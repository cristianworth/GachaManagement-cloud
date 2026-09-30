-- Migração do piloto de eventos para um Supabase que já possui games e tasks.
-- Execute no SQL Editor depois de confirmar o backup das tabelas existentes.
-- Não remove nem modifica games/tasks existentes ou suas policies.

begin;

create table if not exists public.event_candidates (
    id               bigint generated always as identity primary key,
    source           text not null,
    external_id      text not null,
    name             text not null,
    type_name        text,
    source_start_at  timestamptz,
    source_end_at    timestamptz,
    proposed_end_at  timestamptz,
    approved_end_at  timestamptz,
    review_reason    text,
    is_active        boolean not null default true,
    status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'ignored')),
    task_id          bigint references public.tasks (id) on delete set null,
    last_seen_at     timestamptz not null default now(),
    unique (source, external_id)
);

create index if not exists event_candidates_status_idx
    on public.event_candidates (status);
create unique index if not exists event_candidates_task_id_idx
    on public.event_candidates (task_id) where task_id is not null;

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

    select id into v_game_id
    from public.games
    where abbreviation = 'GI'
    order by id
    limit 1;
    if v_game_id is null then
        raise exception 'Cadastre o jogo Genshin Impact (GI) antes de aprovar eventos.';
    end if;

    v_task_id := coalesce(v_candidate.task_id, p_existing_task_id);
    if v_task_id is not null then
        if not exists (
            select 1 from public.tasks
            where id = v_task_id and game_id = v_game_id and refresh_type = 0
        ) then
            raise exception 'A tarefa selecionada deve ser um evento do Genshin.';
        end if;
        if exists (
            select 1 from public.event_candidates
            where task_id = v_task_id and id <> p_candidate_id
        ) then
            raise exception 'Essa tarefa já está vinculada a outro evento.';
        end if;
        update public.tasks
        set expiration_date = p_deadline
        where id = v_task_id;
    else
        insert into public.tasks
            (description, expiration_date, is_done, refresh_type, game_id, game_description)
        values
            (v_candidate.name, p_deadline, false, 0, v_game_id, 'Genshin Impact')
        returning id into v_task_id;
    end if;

    update public.event_candidates
    set task_id = v_task_id, approved_end_at = p_deadline, status = 'approved'
    where id = p_candidate_id;
    return v_task_id;
end;
$$;

alter table public.event_candidates enable row level security;

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

commit;

-- Resultado esperado antes da primeira sincronização: zero candidatos.
select count(*) as event_candidates from public.event_candidates;
