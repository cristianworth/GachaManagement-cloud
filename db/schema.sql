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
