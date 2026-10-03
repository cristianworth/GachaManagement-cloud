-- db/schema.sql
-- Estrutura do banco Gacha Management no Supabase (Postgres).
-- Como usar: no painel do Supabase abra  SQL Editor > New query,
-- cole todo este conteúdo e clique em "Run".

-- ------------------------------------------------------------
-- Tabela: games
-- ------------------------------------------------------------
create table if not exists public.games (
    id                 bigint generated always as identity primary key,
    description        text,
    abbreviation       text,
    img                text,
    cap_stamina        numeric,
    stamina_per_minute numeric,
    current_stamina    numeric      default 0,
    max_stamina_at     text         default '',
    date_max_stamina   timestamptz  default now(),
    pending_tasks      text         default '',
    color              text
);

-- ------------------------------------------------------------
-- Tabela: tasks
-- ------------------------------------------------------------
create table if not exists public.tasks (
    id               bigint generated always as identity primary key,
    description      text,
    expiration_date  timestamptz,
    is_done          boolean default false,
    refresh_type     integer,
    game_id          bigint references public.games (id) on delete cascade,
    game_description text,
    cover_url        text,
    start_at         timestamptz
);

create index if not exists tasks_game_id_idx on public.tasks (game_id);
create index if not exists tasks_expiration_date_idx on public.tasks (expiration_date);

-- Candidatos descobertos pela rotina de eventos. Apenas a aprovação cria uma tarefa.
create table if not exists public.event_candidates (
    id               bigint generated always as identity primary key,
    source           text not null,
    external_id      text not null,
    name             text not null,
    type_name        text,
    game_id          bigint references public.games (id) on delete cascade,
    proposed_start_at timestamptz,
    source_start_at  timestamptz,
    source_end_at    timestamptz,
    proposed_end_at  timestamptz,
    cover_url        text,
    approved_end_at  timestamptz,
    review_reason    text,
    is_active        boolean not null default true,
    status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'ignored')),
    task_id          bigint references public.tasks (id) on delete set null,
    last_seen_at     timestamptz not null default now(),
    unique (source, external_id)
);

create index if not exists event_candidates_game_id_idx on public.event_candidates (game_id);
create index if not exists event_candidates_status_idx on public.event_candidates (status);
create unique index if not exists event_candidates_task_id_idx
    on public.event_candidates (task_id) where task_id is not null;

-- A aprovação e a escrita da tarefa acontecem na mesma transação.
create or replace function public.approve_event_candidate(
    p_candidate_id bigint,
    p_deadline timestamptz,
    p_existing_task_id bigint default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_candidate public.event_candidates%rowtype;
    v_game_id bigint;
    v_game_name text;
    v_abbreviation text;
    v_task_id bigint;
begin
    if p_deadline is null or p_deadline <= now() then
        raise exception 'Escolha um prazo futuro para o evento.';
    end if;

    select * into v_candidate
    from public.event_candidates
    where id = p_candidate_id
    for update;
    if not found then
        raise exception 'Evento não encontrado.';
    end if;
    if not v_candidate.is_active then
        raise exception 'O evento não aparece mais na fonte; sincronize antes de aprovar.';
    end if;

    select id, description, abbreviation into v_game_id, v_game_name, v_abbreviation
    from public.games where id = v_candidate.game_id;
    if v_game_id is null then
        raise exception 'O candidato precisa estar associado a um jogo cadastrado; sincronize novamente.';
    end if;

    if (v_candidate.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and v_abbreviation <> 'GI')
       or (v_candidate.source = 'starrailassistant-hsr' and v_abbreviation <> 'HSR')
       or (v_candidate.source = 'starrailassistant-zzz' and v_abbreviation <> 'ZZZ') then
        raise exception 'O jogo do candidato não corresponde à fonte.';
    end if;

    v_task_id := coalesce(v_candidate.task_id, p_existing_task_id);
    if v_task_id is not null then
        if not exists (
            select 1 from public.tasks
            where id = v_task_id and game_id = v_game_id and refresh_type = 0
        ) then
            raise exception 'A tarefa selecionada deve ser um evento do mesmo jogo.';
        end if;
        if exists (
            select 1 from public.event_candidates
            where task_id = v_task_id and id <> p_candidate_id
        ) then
            raise exception 'Essa tarefa já está vinculada a outro evento.';
        end if;
        update public.tasks
        set expiration_date = p_deadline,
            start_at = v_candidate.proposed_start_at,
            cover_url = coalesce(nullif(btrim(v_candidate.cover_url), ''), cover_url)
        where id = v_task_id;
    else
        insert into public.tasks
            (description, expiration_date, is_done, refresh_type, game_id, game_description, cover_url, start_at)
        values
            (v_candidate.name, p_deadline, false, 0, v_game_id, v_game_name, nullif(btrim(v_candidate.cover_url), ''), v_candidate.proposed_start_at)
        returning id into v_task_id;
    end if;

    update public.event_candidates
    set task_id = v_task_id, approved_end_at = p_deadline, status = 'approved'
    where id = p_candidate_id;
    return v_task_id;
end;
$$;

-- Only linked HSR imports are owned by this cleanup. Manual tasks are untouched.
create or replace function public.cleanup_expired_hsr_events()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_count integer;
begin
    delete from public.tasks as task
    using public.event_candidates as candidate, public.games as game
    where candidate.task_id = task.id
      and candidate.source = 'starrailassistant-hsr'
      and candidate.game_id = task.game_id
      and game.id = task.game_id and game.abbreviation = 'HSR'
      and task.refresh_type = 0 and task.expiration_date <= now();
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

grant execute on function public.cleanup_expired_hsr_events() to anon;

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- Acesso pessoal/aberto (sem login): liberamos leitura e escrita para a
-- chave "anon". Troque estas policies por regras baseadas em auth.uid()
-- caso um dia adicione login.
-- ------------------------------------------------------------
alter table public.games enable row level security;
alter table public.tasks enable row level security;
alter table public.event_candidates enable row level security;

drop policy if exists "allow anon full access to games" on public.games;
create policy "allow anon full access to games"
    on public.games
    for all
    to anon
    using (true)
    with check (true);

drop policy if exists "allow anon full access to tasks" on public.tasks;
create policy "allow anon full access to tasks"
    on public.tasks
    for all
    to anon
    using (true)
    with check (true);

drop policy if exists "allow anon full access to event candidates" on public.event_candidates;
create policy "allow anon full access to event candidates"
    on public.event_candidates
    for all
    to anon
    using (true)
    with check (true);

grant select, insert, update on public.event_candidates to anon;
grant usage, select on sequence public.event_candidates_id_seq to anon;
grant execute on function public.approve_event_candidate(bigint, timestamptz, bigint) to anon;

-- Automatic event import (1.2.0)
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
         or (c.source = 'starrailassistant-hsr' and v_abbreviation = 'HSR')
         or (c.source = 'starrailassistant-zzz' and v_abbreviation = 'ZZZ')) then
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
        where source in ('starrailassistant-genshin', 'starrailassistant-hsr', 'starrailassistant-zzz')
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
