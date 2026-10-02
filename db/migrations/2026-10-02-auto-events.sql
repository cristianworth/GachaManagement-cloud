-- Run after the HSR migration. Existing manual tasks and weeklies are preserved.
begin;
alter table public.tasks add column if not exists event_deadline_manual boolean not null default false;

-- Protect corrections already made before this migration.
update public.tasks t set event_deadline_manual = true
from public.event_candidates c
where c.task_id = t.id and c.status = 'approved'
  and (t.expiration_date is distinct from c.approved_end_at
       or c.approved_end_at is distinct from c.proposed_end_at);

create or replace function public.protect_event_task_deadline()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
    if new.expiration_date is distinct from old.expiration_date
       and exists (select 1 from public.event_candidates where task_id = old.id) then
        new.event_deadline_manual := true;
    end if;
    return new;
end;
$$;
drop trigger if exists protect_event_task_deadline on public.tasks;
create trigger protect_event_task_deadline before update on public.tasks
for each row execute function public.protect_event_task_deadline();

-- Manual approval may create a task when the source has no deadline at all.
create or replace function public.protect_approved_event_deadline()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
    if new.status = 'approved' and new.task_id is not null
       and new.approved_end_at is distinct from new.proposed_end_at then
        update public.tasks set event_deadline_manual = true where id = new.task_id;
    end if;
    return new;
end;
$$;
drop trigger if exists protect_approved_event_deadline on public.event_candidates;
create trigger protect_approved_event_deadline after update of approved_end_at, status on public.event_candidates
for each row execute function public.protect_approved_event_deadline();

create or replace function public.sync_event_candidate(p_candidate_id bigint, p_force_api boolean default false)
returns text language plpgsql security invoker set search_path = public as $$
declare
    c public.event_candidates%rowtype;
    t public.tasks%rowtype;
    v_task_id bigint;
    v_abbreviation text;
    v_result text;
begin
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found then raise exception 'Evento não encontrado.'; end if;
    if not c.is_active then return 'inactive'; end if;
    if c.status = 'ignored' then return 'ignored'; end if;
    select abbreviation into v_abbreviation from public.games where id = c.game_id;
    if not ((c.source = 'starrailassistant-genshin' and v_abbreviation = 'GI')
         or (c.source = 'starrailassistant-hsr' and v_abbreviation = 'HSR')) then
        raise exception 'O jogo do candidato não corresponde à fonte.';
    end if;
    if v_abbreviation is null then raise exception 'Jogo não cadastrado.'; end if;

    if c.task_id is not null then
        select * into t from public.tasks where id = c.task_id for update;
        if not found or t.game_id is distinct from c.game_id or t.refresh_type <> 0 then
            raise exception 'A tarefa selecionada deve ser um evento do mesmo jogo.';
        end if;
        if t.event_deadline_manual and not p_force_api then
            update public.tasks set start_at = c.proposed_start_at,
                cover_url = coalesce(nullif(btrim(c.cover_url), ''), cover_url) where id = t.id;
            update public.event_candidates set status = 'approved', approved_end_at = t.expiration_date where id = c.id;
            return 'manual';
        end if;
    end if;
    if c.proposed_end_at is null or (c.proposed_start_at is not null and c.proposed_end_at <= c.proposed_start_at) then
        if p_force_api then raise exception 'A fonte não possui um prazo utilizável.'; end if;
        update public.event_candidates set status = 'pending',
            review_reason = 'Prazo final ausente ou inconsistente na fonte; informe o prazo manualmente.' where id = c.id;
        return 'review';
    end if;
    if c.proposed_end_at <= now() then
        if p_force_api then raise exception 'O prazo da fonte já venceu.'; end if;
        return 'expired';
    end if;
    v_result := case when c.task_id is null then 'imported' else 'updated' end;
    v_task_id := public.approve_event_candidate(c.id, c.proposed_end_at);
    -- The candidate and task are locked; clear the edit marker only for an API write.
    update public.tasks set event_deadline_manual = false where id = v_task_id;
    update public.event_candidates set review_reason = null where id = c.id;
    return v_result;
end;
$$;

create or replace function public.import_event_candidates(p_source text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_result text; v_counts jsonb := '{}'::jsonb;
begin
    for v_id in select id from public.event_candidates
        where source in ('starrailassistant-genshin', 'starrailassistant-hsr')
          and (p_source is null or source = p_source) and is_active and status <> 'ignored'
        order by id
    loop
        v_result := public.sync_event_candidate(v_id);
        v_counts := jsonb_set(v_counts, array[v_result], to_jsonb(coalesce((v_counts->>v_result)::integer, 0) + 1));
    end loop;
    return v_counts;
end;
$$;

create or replace function public.ignore_imported_task(p_task_id bigint)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype;
begin
    select * into c from public.event_candidates where task_id = p_task_id for update;
    if not found then raise exception 'A tarefa não é um evento importado.'; end if;
    update public.event_candidates set status = 'ignored' where id = c.id;
    delete from public.tasks where id = p_task_id and game_id = c.game_id and refresh_type = 0;
    if not found then raise exception 'O vínculo da tarefa com o evento é inválido.'; end if;
end;
$$;
grant execute on function public.sync_event_candidate(bigint, boolean) to anon;
grant execute on function public.import_event_candidates(text) to anon;
grant execute on function public.ignore_imported_task(bigint) to anon;
commit;

select 'Automatic event import ready' as result;
