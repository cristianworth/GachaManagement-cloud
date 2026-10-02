-- Run after the three Genshin/cover migrations. No manual tasks are removed.
begin;

alter table public.event_candidates add column if not exists game_id bigint
    references public.games (id) on delete cascade;
alter table public.event_candidates add column if not exists proposed_start_at timestamptz;
alter table public.tasks add column if not exists start_at timestamptz;

update public.event_candidates as candidate
set game_id = game.id, proposed_start_at = candidate.source_start_at
from public.games as game
where game.abbreviation = 'GI' and candidate.game_id is null
  and candidate.source in ('starrailassistant-genshin', 'ennead-genshin-calendar');

create index if not exists event_candidates_game_id_idx on public.event_candidates (game_id);

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
       or (v_candidate.source = 'starrailassistant-hsr' and v_abbreviation <> 'HSR') then
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

commit;

select source, count(*) as candidates from public.event_candidates group by source;
