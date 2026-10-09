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
    repeat_days      integer,
    game_id          bigint references public.games (id) on delete cascade,
    game_description text,
    cover_url        text,
    start_at         timestamptz
);

alter table public.tasks add column if not exists repeat_days integer;

update public.tasks
set repeat_days = case refresh_type
    when 1 then 1 when 2 then 7 when 3 then 14 when 4 then 15
    when 5 then 28 when 6 then 31 when 7 then 42
    else null end
where repeat_days is null and refresh_type between 1 and 7;

-- Older clients and SQL seeds only supply refresh_type. Preserve that contract,
-- while explicit intervals (including Monthly = 30) take precedence.
create or replace function public.normalize_task_repeat_days()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.refresh_type = 0 then
        new.repeat_days := null;
    elsif new.repeat_days is null
       or (tg_op = 'UPDATE' and old.refresh_type between 1 and 7
           and new.refresh_type is distinct from old.refresh_type
           and new.repeat_days is not distinct from old.repeat_days) then
        new.repeat_days := case new.refresh_type
            when 1 then 1 when 2 then 7 when 3 then 14 when 4 then 15
            when 5 then 28 when 6 then 31 when 7 then 42
            else new.repeat_days end;
    end if;
    return new;
end;
$$;

drop trigger if exists tasks_normalize_repeat_days on public.tasks;
create trigger tasks_normalize_repeat_days
before insert or update of refresh_type, repeat_days on public.tasks
for each row execute function public.normalize_task_repeat_days();

do $$
begin
    if not exists (select 1 from pg_constraint
        where conrelid = 'public.tasks'::regclass and conname = 'tasks_repeat_days_check') then
        alter table public.tasks add constraint tasks_repeat_days_check check (
            (repeat_days is null or repeat_days > 0)
            and (refresh_type is distinct from 0 or repeat_days is null)
            and (refresh_type is distinct from 8 or repeat_days is not null)
        );
    end if;
end;
$$;

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
       or (v_candidate.source = 'starrailassistant-zzz' and v_abbreviation <> 'ZZZ')
       or (v_candidate.source = 'starrailassistant-wuwa' and v_abbreviation <> 'WuWa')
       or (v_candidate.source = 'starrailassistant-nte' and v_abbreviation <> 'NTE') then
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
         or (c.source = 'starrailassistant-zzz' and v_abbreviation = 'ZZZ')
         or (c.source = 'starrailassistant-wuwa' and v_abbreviation = 'WuWa')
         or (c.source = 'starrailassistant-nte' and v_abbreviation = 'NTE')) then
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
            review_reason = case when c.source in ('starrailassistant-wuwa', 'starrailassistant-nte') then coalesce(c.review_reason,
                'Prazo final ausente ou inconsistente na fonte; informe o prazo manualmente.')
                else 'Prazo final ausente ou inconsistente na fonte; informe o prazo manualmente.' end where id = c.id;
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
        where source in ('starrailassistant-genshin', 'starrailassistant-hsr', 'starrailassistant-zzz', 'starrailassistant-wuwa', 'starrailassistant-nte')
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

-- Weekly batch initialization
begin;

-- A batch survives task/game deletion: reopening the app must not undo that decision.
create table if not exists public.weekly_batches (
    abbreviation text primary key check (abbreviation in ('HSR', 'WuWa', 'ZZZ')),
    status text not null check (status in ('skipped', 'created'))
);
create table if not exists public.weekly_batch_items (
    abbreviation text references public.weekly_batches(abbreviation),
    definition_key text not null,
    task_id bigint unique references public.tasks(id) on delete set null,
    primary key (abbreviation, definition_key)
);

-- An existing installation has no trustworthy history of removed games/seed tasks.
insert into public.weekly_batches (abbreviation, status)
select abbreviation, 'skipped' from (values ('HSR'), ('WuWa'), ('ZZZ')) as catalog(abbreviation)
where exists (select 1 from public.games) or exists (select 1 from public.tasks)
on conflict (abbreviation) do nothing;

alter table public.weekly_batches enable row level security;
alter table public.weekly_batch_items enable row level security;
drop policy if exists "allow anon weekly batches" on public.weekly_batches;
create policy "allow anon weekly batches" on public.weekly_batches for all to anon using (true) with check (true);
drop policy if exists "allow anon weekly batch items" on public.weekly_batch_items;
create policy "allow anon weekly batch items" on public.weekly_batch_items for all to anon using (true) with check (true);
grant select, insert, update on public.weekly_batches, public.weekly_batch_items to anon;

-- All enabled America weeklies reset Monday 04:00 UTC-5 = 09:00 UTC.
create or replace function public.next_weekly_deadline(p_now timestamptz default now())
returns timestamptz language plpgsql immutable set search_path = public as $$
declare v_reset timestamp;
begin
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    v_reset := date_trunc('week', p_now at time zone 'UTC') + interval '9 hours';
    if v_reset <= (p_now at time zone 'UTC') then v_reset := v_reset + interval '7 days'; end if;
    return v_reset at time zone 'UTC';
end;
$$;

create or replace function public.create_weekly_batch(
    p_abbreviation text, p_game_id bigint, p_definitions jsonb,
    p_explicit boolean default false, p_now timestamptz default now()
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    v_game public.games%rowtype;
    v_status text;
    v_new_batch boolean;
    v_definition jsonb;
    v_task_id bigint;
    v_deadline timestamptz;
    v_created integer := 0;
    v_preserved integer := 0;
begin
    if p_abbreviation is null or p_abbreviation not in ('HSR', 'WuWa', 'ZZZ') then
        raise exception 'Jogo sem lote semanal disponível.';
    end if;
    if (select count(*) from public.games where abbreviation = p_abbreviation) <> 1 then
        raise exception 'Sigla de jogo ausente ou ambígua: %.', p_abbreviation;
    end if;
    select * into v_game from public.games where id = p_game_id and abbreviation = p_abbreviation for update;
    if not found then raise exception 'O jogo não corresponde à sigla do lote.'; end if;
    if p_definitions is null or jsonb_typeof(p_definitions) <> 'array' then
        raise exception 'Definições semanais inválidas.';
    end if;
    if jsonb_array_length(p_definitions) = 0 or exists (
        select 1 from jsonb_array_elements(p_definitions) d
        where jsonb_typeof(d) <> 'object' or coalesce(btrim(d->>'key'), '') = ''
            or coalesce(btrim(d->>'description'), '') = ''
    ) or (select count(distinct d->>'key') from jsonb_array_elements(p_definitions) d)
         <> jsonb_array_length(p_definitions) then
        raise exception 'Definições semanais inválidas ou repetidas.';
    end if;
    v_deadline := public.next_weekly_deadline(p_now);

    insert into public.weekly_batches values (p_abbreviation, 'skipped') on conflict do nothing returning status into v_status;
    v_new_batch := found;
    select status into v_status from public.weekly_batches where abbreviation = p_abbreviation for update;
    if v_status = 'created' then return jsonb_build_object('status', 'created', 'created', 0, 'preserved', 0); end if;
    if not p_explicit and not v_new_batch then
        return jsonb_build_object('status', 'skipped', 'created', 0, 'preserved', 0);
    end if;
    -- The batch row serializes browsers, and a failed insert rolls back the entire lot.
    for v_definition in select value from jsonb_array_elements(p_definitions)
    loop
        v_task_id := null;
        if exists (select 1 from public.tasks where game_id = v_game.id
                   and description = v_definition->>'description') then
            -- A matching name prevents duplication but does not establish seed ownership.
            v_preserved := v_preserved + 1;
        else
            insert into public.tasks (description, expiration_date, refresh_type, repeat_days, game_id, game_description)
            values (v_definition->>'description', v_deadline, 2, 7, v_game.id, v_game.description)
            returning id into v_task_id;
            v_created := v_created + 1;
        end if;
        insert into public.weekly_batch_items values (p_abbreviation, v_definition->>'key', v_task_id);
    end loop;
    update public.weekly_batches set status = 'created' where abbreviation = p_abbreviation;
    return jsonb_build_object('status', 'created', 'created', v_created, 'preserved', v_preserved);
end;
$$;
grant execute on function public.next_weekly_deadline(timestamptz) to anon;
grant execute on function public.create_weekly_batch(text, bigint, jsonb, boolean, timestamptz) to anon;

-- Only an explicit full reset forgets weekly decisions. Normal deletion retains them.
create or replace function public.reset_application_data()
returns void language plpgsql security invoker set search_path = public as $$
begin
    delete from public.event_candidates;
    delete from public.weekly_batch_items;
    delete from public.weekly_batches;
    delete from public.tasks;
    delete from public.games;
end;
$$;
grant delete on public.event_candidates, public.weekly_batch_items, public.weekly_batches to anon;
grant execute on function public.reset_application_data() to anon;
commit;

-- Profile model.
begin;

-- Profiles organize shared public data. They are not authenticated identities.
create table public.profiles (
    id text primary key check (id in ('cran', 'demo', 'guest')),
    name text not null,
    sort_order integer not null unique
);
insert into public.profiles values ('cran', 'CRAN', 1), ('demo', 'Demo', 2), ('guest', 'Convidado', 3);

alter table public.games add column catalogue_owner text references public.profiles(id);
alter table public.tasks add column owner_profile_id text references public.profiles(id) default 'cran';
alter table public.tasks add column shared_key text unique;

create table public.profile_games (
    profile_id text references public.profiles(id),
    game_id bigint references public.games(id) on delete cascade,
    enabled boolean not null default true,
    overrides jsonb not null default '{}',
    primary key (profile_id, game_id)
);
create table public.profile_tasks (
    profile_id text references public.profiles(id),
    task_id bigint references public.tasks(id) on delete cascade,
    description text,
    expiration_date timestamptz,
    is_done boolean not null default false,
    refresh_type integer,
    repeat_days integer check (repeat_days is null or repeat_days > 0),
    event_deadline_manual boolean not null default false,
    deleted boolean not null default false,
    primary key (profile_id, task_id),
    check (refresh_type is distinct from 0 or repeat_days is null),
    check (refresh_type is distinct from 8 or repeat_days is not null)
);
create table public.profile_event_decisions (
    profile_id text references public.profiles(id),
    candidate_id bigint references public.event_candidates(id) on delete cascade,
    status text not null check (status in ('approved', 'ignored')),
    -- A reviewed event can use a private manual task instead of the shared template.
    task_id bigint references public.tasks(id) on delete set null,
    primary key (profile_id, candidate_id),
    unique (profile_id, task_id)
);
create table public.profile_weekly_batches (
    profile_id text references public.profiles(id),
    abbreviation text not null check (abbreviation in ('HSR', 'WuWa', 'ZZZ')),
    status text not null default 'created' check (status in ('skipped', 'created')),
    primary key (profile_id, abbreviation)
);

-- Retaining the main profile is inexpensive; Demo and Convidado start empty.
insert into public.profile_games select 'cran', id, true,
    jsonb_build_object('current_stamina', current_stamina, 'max_stamina_at', max_stamina_at,
        'date_max_stamina', date_max_stamina, 'pending_tasks', pending_tasks) from public.games;
update public.tasks t set owner_profile_id = null where exists (
    select 1 from public.event_candidates c where c.task_id = t.id
) or exists (select 1 from public.weekly_batch_items w where w.task_id = t.id);
update public.tasks t set shared_key = 'weekly:' || w.abbreviation || ':' || w.definition_key
    from public.weekly_batch_items w where w.task_id = t.id;
insert into public.profile_tasks
    select 'cran', id, description, expiration_date, coalesce(is_done, false), refresh_type,
        repeat_days, event_deadline_manual, false from public.tasks;
insert into public.profile_event_decisions
    select 'cran', id, status, task_id from public.event_candidates where status in ('ignored', 'approved');
insert into public.profile_weekly_batches select 'cran', abbreviation, status from public.weekly_batches;
-- Manual decisions now belong to a profile, not to the shared importer.
update public.event_candidates set status = 'pending', approved_end_at = null where status = 'ignored';
update public.tasks set event_deadline_manual = false;
update public.games set current_stamina = 0, pending_tasks = '', max_stamina_at = '', date_max_stamina = null;

alter table public.profiles enable row level security;
create policy "read fixed profiles" on public.profiles for select to anon using (true);
revoke insert, update, delete on public.profiles from anon;
grant select on public.profiles to anon;
do $$ declare v_table text; begin
    foreach v_table in array array['profile_games', 'profile_tasks', 'profile_event_decisions', 'profile_weekly_batches'] loop
        execute format('alter table public.%I enable row level security', v_table);
        execute format('create policy "public profile data" on public.%I for all to anon using (true) with check (true)', v_table);
        execute format('grant select, insert, update, delete on public.%I to anon', v_table);
    end loop;
end $$;

-- Reset remains an explicit full reset; fixed profile identities survive it.
create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
    delete from public.profile_weekly_batches;
    delete from public.profile_event_decisions;
    delete from public.profile_tasks;
    delete from public.profile_games;
    delete from public.event_candidates;
    delete from public.weekly_batch_items;
    delete from public.weekly_batches;
    delete from public.tasks;
    delete from public.games;
end $$;

notify pgrst, 'reload schema';
commit;

-- Profile contracts.
begin;

create function public.require_profile(p_profile_id text) returns void
language plpgsql security invoker set search_path = public as $$ begin
    if not exists (select 1 from public.profiles where id = p_profile_id) then raise exception 'Perfil inválido.'; end if;
end $$;

create function public.require_profile_game(p_profile_id text, p_game_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    if not exists (select 1 from public.profile_games where profile_id = p_profile_id and game_id = p_game_id and enabled) then
        raise exception 'Selecione este jogo no perfil antes de alterar seus dados.';
    end if;
end $$;

create function public.initialize_game_catalogue(p_games jsonb) returns void
language plpgsql security invoker set search_path = public as $$ declare g jsonb; begin
    perform pg_advisory_xact_lock(hashtext('game-catalogue'));
    if exists (select 1 from public.games) then return; end if;
    if p_games is null or jsonb_typeof(p_games) <> 'array' then raise exception 'Catálogo inválido.'; end if;
    if exists (select 1 from jsonb_array_elements(p_games) x where coalesce(btrim(x->>'abbreviation'), '') = '' or coalesce(btrim(x->>'description'), '') = '')
        or (select count(distinct x->>'abbreviation') from jsonb_array_elements(p_games) x) <> jsonb_array_length(p_games) then raise exception 'Catálogo inválido ou repetido.'; end if;
    for g in select value from jsonb_array_elements(p_games) loop
        insert into public.games (description, abbreviation, img, cap_stamina, stamina_per_minute, color)
        values (g->>'description', g->>'abbreviation', g->>'img', (g->>'cap_stamina')::numeric, (g->>'stamina_per_minute')::numeric, g->>'color');
    end loop;
end $$;

create function public.profile_game_catalogue(p_profile_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(g) || jsonb_build_object('enabled', coalesce(pg.enabled, false)) order by g.description)
        from public.games g left join public.profile_games pg on pg.game_id = g.id and pg.profile_id = p_profile_id
        where g.catalogue_owner is null or g.catalogue_owner = p_profile_id), '[]');
end $$;

create function public.list_profile_games(p_profile_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(g) || pg.overrides order by (pg.overrides->>'date_max_stamina') nulls last)
        from public.games g join public.profile_games pg on pg.game_id = g.id
        where pg.profile_id = p_profile_id and pg.enabled), '[]');
end $$;

create function public.materialize_profile_tasks(p_profile_id text) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
    select p_profile_id, t.id, t.description, t.expiration_date, t.refresh_type, t.repeat_days
    from public.tasks t join public.event_candidates c on c.task_id = t.id
    join public.profile_games pg on pg.profile_id = p_profile_id and pg.game_id = t.game_id and pg.enabled
    where t.owner_profile_id is null
        and c.is_active and c.proposed_end_at > now() and c.review_reason is null
        and (c.proposed_start_at is null or c.proposed_end_at > c.proposed_start_at)
        and not exists (select 1 from public.profile_event_decisions d where d.profile_id = p_profile_id and d.candidate_id = c.id and d.status = 'ignored')
    on conflict (profile_id, task_id) do nothing;
end $$;

create function public.set_profile_games(p_profile_id text, p_game_ids bigint[], p_create_weeklies boolean default true) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    -- Serialize concurrent selection edits without erasing progress or decisions.
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_game_ids is null or exists (select 1 from unnest(p_game_ids) n where n is null or not exists (
        select 1 from public.games where id = n and (catalogue_owner is null or catalogue_owner = p_profile_id))) then
        raise exception 'Catálogo de jogos inválido.';
    end if;
    update public.profile_games set enabled = false where profile_id = p_profile_id;
    insert into public.profile_games (profile_id, game_id, enabled)
        select p_profile_id, n, true from (select distinct unnest(p_game_ids) n) games
        on conflict (profile_id, game_id) do update set enabled = true;
    if not p_create_weeklies then
        insert into public.profile_weekly_batches (profile_id, abbreviation, status)
            select p_profile_id, g.abbreviation, 'skipped' from public.games g
            where g.id = any(p_game_ids) and g.abbreviation in ('HSR', 'WuWa', 'ZZZ')
            on conflict (profile_id, abbreviation) do nothing;
    end if;
    perform public.materialize_profile_tasks(p_profile_id);
end $$;

create function public.save_profile_game(p_profile_id text, p_game jsonb, p_game_id bigint default null) returns jsonb
language plpgsql security invoker set search_path = public as $$ declare v_id bigint; v_game public.games%rowtype; begin
    perform public.require_profile(p_profile_id);
    p_game := p_game - 'id' - 'catalogue_owner';
    if p_game_id is null then
        perform pg_advisory_xact_lock(hashtext('game-catalogue'));
        if exists (select 1 from public.games where abbreviation = p_game->>'abbreviation') then raise exception 'Esta sigla já existe no catálogo. Use Selecionar jogos.'; end if;
        insert into public.games (description, abbreviation, img, cap_stamina, stamina_per_minute, color, catalogue_owner)
        values (p_game->>'description', p_game->>'abbreviation', p_game->>'img', (p_game->>'cap_stamina')::numeric,
            (p_game->>'stamina_per_minute')::numeric, p_game->>'color', p_profile_id) returning * into v_game;
        v_id := v_game.id;
        insert into public.profile_games (profile_id, game_id, overrides) values (p_profile_id, v_id, p_game);
    else
        perform public.require_profile_game(p_profile_id, p_game_id);
        select * into v_game from public.games where id = p_game_id;
        if v_game.catalogue_owner is null and p_game->>'abbreviation' is distinct from v_game.abbreviation then
            raise exception 'A sigla dos jogos integrados pertence ao catálogo.';
        end if;
        v_id := p_game_id;
        update public.profile_games set overrides = overrides || p_game where profile_id = p_profile_id and game_id = v_id;
    end if;
    return to_jsonb(v_game) || p_game || jsonb_build_object('id', v_id);
end $$;

create function public.remove_profile_game(p_profile_id text, p_game_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile_game(p_profile_id, p_game_id);
    update public.profile_games set enabled = false where profile_id = p_profile_id and game_id = p_game_id;
end $$;

-- The global importer writes shared templates; state updates never reset completion.
create function public.sync_profile_task_templates() returns trigger
language plpgsql security invoker set search_path = public as $$ begin
    if tg_op = 'INSERT' and new.owner_profile_id is not null then
        insert into public.profile_tasks (profile_id, task_id, description, expiration_date, is_done, refresh_type, repeat_days)
            values (new.owner_profile_id, new.id, new.description, new.expiration_date, coalesce(new.is_done, false), new.refresh_type, new.repeat_days);
    elsif tg_op = 'UPDATE' then
        update public.profile_tasks set expiration_date = new.expiration_date
            where task_id = new.id and refresh_type = 0 and not event_deadline_manual and not deleted
                and exists (select 1 from public.event_candidates c where c.task_id = new.id);
    end if;
    return new;
end $$;
create trigger tasks_profile_templates after insert or update on public.tasks for each row execute function public.sync_profile_task_templates();

create function public.sync_profile_candidate_template() returns trigger
language plpgsql security invoker set search_path = public as $$ declare v_profile text; begin
    if new.task_id is not null then
        update public.tasks set owner_profile_id = null where id = new.task_id;
        update public.tasks t set cover_url = coalesce(nullif(btrim(new.cover_url), ''), t.cover_url), start_at = new.proposed_start_at
            where exists (select 1 from public.profile_event_decisions d where d.candidate_id = new.id and d.task_id = t.id and t.id <> new.task_id);
        for v_profile in select profile_id from public.profile_games where game_id = new.game_id and enabled loop
            perform public.materialize_profile_tasks(v_profile);
        end loop;
    end if;
    return new;
end $$;
create trigger candidates_profile_templates after insert or update on public.event_candidates
    for each row execute function public.sync_profile_candidate_template();

create function public.list_profile_tasks(p_profile_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(t) || (to_jsonb(pt) - 'profile_id' - 'task_id' - 'deleted') ||
        jsonb_build_object('game', to_jsonb(g) || pg.overrides, 'game_description', coalesce(pg.overrides->>'description', g.description),
            'event_candidates', case when c.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', c.id, 'source', c.source)) end,
            'weekly_batch_items', case when t.shared_key like 'weekly:%' then jsonb_build_object('definition_key', split_part(t.shared_key, ':', 3)) else null end)
        order by pt.expiration_date nulls last)
        from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
        join public.games g on g.id = t.game_id
        join public.profile_games pg on pg.game_id = t.game_id and pg.profile_id = pt.profile_id and pg.enabled
        left join public.event_candidates c on c.task_id = t.id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id and d.profile_id = pt.profile_id)
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = pt.profile_id
        where pt.profile_id = p_profile_id and not pt.deleted and coalesce(d.status, '') <> 'ignored'
            and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)), '[]');
end $$;

create function public.save_profile_task(p_profile_id text, p_task jsonb, p_task_id bigint default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_task public.tasks%rowtype; v_state public.profile_tasks%rowtype; v_repeat integer; begin
    perform public.require_profile_game(p_profile_id, (p_task->>'game_id')::bigint);
    v_repeat := case when (p_task->>'refresh_type')::integer = 0 then null else (p_task->>'repeat_days')::integer end;
    if p_task_id is null then
        insert into public.tasks (description, expiration_date, is_done, refresh_type, repeat_days, game_id, game_description, cover_url, start_at, owner_profile_id)
        values (p_task->>'description', (p_task->>'expiration_date')::timestamptz, coalesce((p_task->>'is_done')::boolean, false),
            (p_task->>'refresh_type')::integer, v_repeat, (p_task->>'game_id')::bigint, p_task->>'game_description',
            p_task->>'cover_url', (p_task->>'start_at')::timestamptz, p_profile_id) returning * into v_task;
    else
        -- Use the same candidate-before-template lock order as the importer.
        perform 1 from public.event_candidates c where c.task_id = p_task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = p_task_id and d.profile_id = p_profile_id)
            order by c.id for update;
        select t.* into v_task from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
            where t.id = p_task_id and pt.profile_id = p_profile_id and not pt.deleted for update of t;
        if not found or (v_task.owner_profile_id is not null and v_task.owner_profile_id <> p_profile_id) then raise exception 'Tarefa não encontrada neste perfil.'; end if;
        select * into v_state from public.profile_tasks where profile_id = p_profile_id and task_id = p_task_id for update;
        if (v_task.owner_profile_id is null or exists (select 1 from public.event_candidates c where c.task_id = p_task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = p_task_id and d.profile_id = p_profile_id)))
            and (p_task->>'game_id')::bigint is distinct from v_task.game_id then
            raise exception 'Uma tarefa compartilhada deve permanecer no mesmo jogo.';
        end if;
        if p_task ? 'cover_url' then
            update public.tasks set cover_url = p_task->>'cover_url' where id = p_task_id;
            update public.tasks t set cover_url = p_task->>'cover_url' where exists (
                select 1 from public.event_candidates c where (c.task_id = p_task_id or exists (
                    select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = p_task_id and d.profile_id = p_profile_id))
                    and (t.id = c.task_id or exists (select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id)));
        end if;
        if v_task.owner_profile_id is not null then
            update public.tasks set game_id = (p_task->>'game_id')::bigint, game_description = p_task->>'game_description',
                start_at = case when p_task ? 'start_at' then (p_task->>'start_at')::timestamptz else start_at end where id = p_task_id;
        end if;
        update public.profile_tasks set description = p_task->>'description', expiration_date = (p_task->>'expiration_date')::timestamptz,
            is_done = coalesce((p_task->>'is_done')::boolean, false), refresh_type = (p_task->>'refresh_type')::integer,
            repeat_days = coalesce(v_repeat, case (p_task->>'refresh_type')::integer when 1 then 1 when 2 then 7 when 3 then 14 when 4 then 15 when 5 then 28 when 6 then 31 when 7 then 42 end),
            event_deadline_manual = v_state.event_deadline_manual or (
                v_state.expiration_date is distinct from (p_task->>'expiration_date')::timestamptz
                and exists (select 1 from public.event_candidates c where c.task_id = p_task_id or exists (
                    select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = p_task_id and d.profile_id = p_profile_id)))
            where profile_id = p_profile_id and task_id = p_task_id;
    end if;
    return (select value from jsonb_array_elements(public.list_profile_tasks(p_profile_id)) where (value->>'id')::bigint = v_task.id);
end $$;

create function public.complete_profile_task(p_profile_id text, p_task_id bigint, p_is_done boolean) returns void
language plpgsql security invoker set search_path = public as $$ declare v_game_id bigint; begin
    select t.game_id into v_game_id from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
        where t.id = p_task_id and pt.profile_id = p_profile_id and not pt.deleted;
    perform public.require_profile_game(p_profile_id, v_game_id);
    update public.profile_tasks set is_done = p_is_done where profile_id = p_profile_id and task_id = p_task_id;
end $$;

create function public.remove_profile_task(p_profile_id text, p_task_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ declare v_game_id bigint; begin
    select t.game_id into v_game_id from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
        where t.id = p_task_id and pt.profile_id = p_profile_id and not pt.deleted;
    perform public.require_profile_game(p_profile_id, v_game_id);
    update public.profile_tasks set deleted = true where profile_id = p_profile_id and task_id = p_task_id;
end $$;

create function public.list_profile_candidates(p_profile_id text, p_source text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('task_id', coalesce(d.task_id, c.task_id)) order by c.proposed_end_at nulls last)
        from public.event_candidates c join public.profile_games pg on pg.game_id = c.game_id and pg.profile_id = p_profile_id and pg.enabled
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = p_profile_id
        where c.is_active and (p_source is null or c.source = p_source) and d.status is null
            and (c.proposed_end_at is null or c.proposed_end_at > now())
            and (c.proposed_end_at is null or c.review_reason is not null or (c.proposed_start_at is not null and c.proposed_end_at <= c.proposed_start_at))), '[]');
end $$;

create function public.ignore_profile_candidate(p_profile_id text, p_candidate_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ declare c public.event_candidates%rowtype; begin
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found then raise exception 'Evento não encontrado.'; end if;
    perform public.require_profile_game(p_profile_id, c.game_id);
    update public.profile_tasks set deleted = true where profile_id = p_profile_id and task_id in (
        select c.task_id union select task_id from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id);
    insert into public.profile_event_decisions values (p_profile_id, c.id, 'ignored', null)
        on conflict (profile_id, candidate_id) do update set status = 'ignored', task_id = null;
end $$;

create function public.ignore_profile_task(p_profile_id text, p_task_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ declare v_candidate_id bigint; begin
    select c.id into v_candidate_id from public.event_candidates c where c.task_id = p_task_id or exists (
        select 1 from public.profile_event_decisions d where d.profile_id = p_profile_id and d.candidate_id = c.id and d.task_id = p_task_id);
    if v_candidate_id is null or not exists (select 1 from public.profile_tasks where profile_id = p_profile_id and task_id = p_task_id and not deleted) then
        raise exception 'Evento não encontrado neste perfil.';
    end if;
    perform public.ignore_profile_candidate(p_profile_id, v_candidate_id);
end $$;

create function public.approve_profile_candidate(p_profile_id text, p_candidate_id bigint, p_deadline timestamptz, p_existing_task_id bigint default null) returns bigint
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; v_task_id bigint; v_game_name text; begin
    if p_deadline is null or p_deadline <= now() then raise exception 'Escolha um prazo futuro para o evento.'; end if;
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found or not c.is_active then raise exception 'Evento não encontrado ou inativo.'; end if;
    perform public.require_profile_game(p_profile_id, c.game_id);
    select description into v_game_name from public.games where id = c.game_id;
    if not exists (select 1 from public.games g where g.id = c.game_id and (
        (c.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and g.abbreviation = 'GI')
        or (c.source = 'starrailassistant-hsr' and g.abbreviation = 'HSR')
        or (c.source = 'starrailassistant-zzz' and g.abbreviation = 'ZZZ')
        or (c.source = 'starrailassistant-wuwa' and g.abbreviation = 'WuWa')
        or (c.source = 'starrailassistant-nte' and g.abbreviation = 'NTE'))) then raise exception 'O jogo do candidato não corresponde à fonte.'; end if;
    select task_id into v_task_id from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id;
    v_task_id := coalesce(v_task_id, p_existing_task_id, c.task_id);
    if v_task_id is not null then
        if not exists (select 1 from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
            where t.id = v_task_id and pt.profile_id = p_profile_id and t.game_id = c.game_id and pt.refresh_type = 0
                and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)) then
            -- A shared template without state may be reviewed independently by another profile.
            if v_task_id is distinct from c.task_id then raise exception 'A tarefa selecionada deve ser um evento deste perfil e jogo.'; end if;
        end if;
        if exists (select 1 from public.event_candidates where task_id = v_task_id and id <> c.id)
            or exists (select 1 from public.profile_event_decisions where profile_id = p_profile_id and task_id = v_task_id and candidate_id <> c.id) then
            raise exception 'Essa tarefa já está vinculada a outro evento.';
        end if;
    else
        insert into public.tasks (description, expiration_date, refresh_type, game_id, game_description, cover_url, start_at, owner_profile_id)
            values (c.name, c.proposed_end_at, 0, c.game_id, v_game_name, c.cover_url, c.proposed_start_at, null) returning id into v_task_id;
        update public.event_candidates set task_id = v_task_id where id = c.id;
    end if;
    insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, event_deadline_manual)
        values (p_profile_id, v_task_id, c.name, p_deadline, 0, true)
        on conflict (profile_id, task_id) do update set expiration_date = p_deadline, event_deadline_manual = true, deleted = false;
    if c.task_id is distinct from v_task_id then
        update public.profile_tasks set deleted = true where profile_id = p_profile_id and task_id = c.task_id;
    end if;
    insert into public.profile_event_decisions values (p_profile_id, c.id, 'approved', v_task_id)
        on conflict (profile_id, candidate_id) do update set status = 'approved', task_id = v_task_id;
    return v_task_id;
end $$;

create function public.restore_profile_api_deadline(p_profile_id text, p_candidate_id bigint) returns void
language plpgsql security invoker set search_path = public as $$ declare c public.event_candidates%rowtype; v_id bigint; begin
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found then raise exception 'Evento não encontrado.'; end if;
    perform public.require_profile_game(p_profile_id, c.game_id);
    if not c.is_active or c.review_reason is not null or c.proposed_end_at is null or c.proposed_end_at <= now()
        or (c.proposed_start_at is not null and c.proposed_end_at <= c.proposed_start_at) then raise exception 'A fonte não possui um prazo utilizável.'; end if;
    select task_id into v_id from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id;
    v_id := coalesce(v_id, c.task_id);
    update public.profile_tasks set expiration_date = c.proposed_end_at, event_deadline_manual = false
        where profile_id = p_profile_id and task_id = v_id and not deleted;
    if not found then raise exception 'Tarefa não encontrada neste perfil.'; end if;
end $$;

create function public.create_profile_weekly_batch(p_profile_id text, p_abbreviation text, p_game_id bigint, p_definitions jsonb, p_explicit boolean default false, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; d jsonb; v_id bigint; v_status text; v_created integer := 0; v_preserved integer := 0; begin
    perform public.require_profile_game(p_profile_id, p_game_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    select * into g from public.games where id = p_game_id and abbreviation = p_abbreviation;
    if not found or p_abbreviation not in ('HSR', 'WuWa', 'ZZZ') then raise exception 'Jogo sem lote semanal disponível.'; end if;
    if p_definitions is null or jsonb_typeof(p_definitions) <> 'array' then raise exception 'Definições semanais inválidas.'; end if;
    if jsonb_array_length(p_definitions) = 0 or exists (select 1 from jsonb_array_elements(p_definitions) x
        where jsonb_typeof(x) <> 'object' or coalesce(btrim(x->>'key'), '') = '' or coalesce(btrim(x->>'description'), '') = '')
        or (select count(distinct x->>'key') from jsonb_array_elements(p_definitions) x) <> jsonb_array_length(p_definitions) then raise exception 'Definições semanais inválidas.'; end if;
    perform public.next_weekly_deadline(p_now);
    select status into v_status from public.profile_weekly_batches where profile_id = p_profile_id and abbreviation = p_abbreviation;
    if v_status = 'created' then
        return jsonb_build_object('status', 'created', 'created', 0, 'preserved', 0);
    end if;
    if v_status = 'skipped' and not p_explicit then return jsonb_build_object('status', 'skipped', 'created', 0, 'preserved', 0); end if;
    for d in select value from jsonb_array_elements(p_definitions) loop
        if exists (select 1 from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
            where pt.profile_id = p_profile_id and not pt.deleted and t.game_id = p_game_id and pt.description = d->>'description') then
            v_preserved := v_preserved + 1;
        else
            insert into public.tasks (description, expiration_date, refresh_type, repeat_days, game_id, game_description, owner_profile_id, shared_key)
                values (d->>'description', public.next_weekly_deadline(p_now), 2, 7, p_game_id, g.description, null, 'weekly:' || p_abbreviation || ':' || (d->>'key'))
                on conflict (shared_key) do update set shared_key = excluded.shared_key returning id into v_id;
            insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
                values (p_profile_id, v_id, d->>'description', public.next_weekly_deadline(p_now), 2, 7);
            v_created := v_created + 1;
        end if;
    end loop;
    insert into public.profile_weekly_batches values (p_profile_id, p_abbreviation, 'created')
        on conflict (profile_id, abbreviation) do update set status = 'created';
    return jsonb_build_object('status', 'created', 'created', v_created, 'preserved', v_preserved);
end $$;

-- Keep the legacy HSR entry point safe until per-profile expiry is introduced.
create or replace function public.cleanup_expired_hsr_events() returns integer
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; v_task public.tasks%rowtype; v_count integer := 0; begin
    -- Match the candidate-before-template lock order used by imports and profile edits.
    for c in select candidate.* from public.event_candidates candidate
        join public.tasks task on task.id = candidate.task_id and task.game_id = candidate.game_id
        join public.games game on game.id = task.game_id and game.abbreviation = 'HSR'
        where candidate.source = 'starrailassistant-hsr'
            and task.refresh_type = 0 and task.expiration_date <= now()
        order by candidate.id for update of candidate
    loop
        select * into v_task from public.tasks where id = c.task_id for update;
        if not found or v_task.refresh_type is distinct from 0 or v_task.expiration_date is null
            or v_task.expiration_date > now() then continue; end if;
        perform 1 from public.profile_tasks pt
            where pt.task_id = v_task.id or exists (select 1 from public.profile_event_decisions d
                where d.candidate_id = c.id and d.task_id = pt.task_id and d.profile_id = pt.profile_id)
            order by pt.task_id, pt.profile_id for update of pt;
        -- Hidden games retain progress. Unknown deadlines and recurring states cannot expire here.
        if not exists (select 1 from public.profile_tasks pt where not pt.deleted
            and (pt.task_id = v_task.id or exists (select 1 from public.profile_event_decisions d
                where d.candidate_id = c.id and d.task_id = pt.task_id and d.profile_id = pt.profile_id))
            and (pt.refresh_type is distinct from 0 or pt.expiration_date is null or pt.expiration_date > now())) then
            delete from public.tasks where id = v_task.id;
            v_count := v_count + 1;
        end if;
    end loop;
    return v_count;
end $$;

notify pgrst, 'reload schema';
commit;

-- Edition expiry policy for GI/HSR/ZZZ.
begin;

alter table public.profile_event_decisions drop constraint profile_event_decisions_status_check;
alter table public.profile_event_decisions add constraint profile_event_decisions_status_check
    check (status in ('approved', 'ignored', 'expired'));

-- An expired decision retains only an identity tombstone, never a task/history row.
create function public.protect_closed_profile_edition() returns trigger
language plpgsql security invoker set search_path = public as $$ begin
    if old.status = 'expired' and new.status <> 'expired' then
        raise exception 'Esta edição já foi encerrada neste perfil. Uma edição nova terá estado próprio.';
    end if;
    return new;
end $$;
create trigger decisions_closed_editions before update on public.profile_event_decisions
    for each row execute function public.protect_closed_profile_edition();

create or replace function public.materialize_profile_tasks(p_profile_id text) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
    select p_profile_id, t.id, t.description, t.expiration_date, t.refresh_type, t.repeat_days
    from public.tasks t join public.event_candidates c on c.task_id = t.id
    join public.profile_games pg on pg.profile_id = p_profile_id and pg.game_id = t.game_id and pg.enabled
    where t.owner_profile_id is null
        and c.is_active and c.status <> 'ignored' and c.proposed_end_at > now() and c.review_reason is null
        and (c.proposed_start_at is null or c.proposed_end_at > c.proposed_start_at)
        and not exists (select 1 from public.profile_event_decisions d where d.profile_id = p_profile_id and d.candidate_id = c.id
            and (d.status in ('ignored', 'expired') or d.task_id is distinct from c.task_id))
    on conflict (profile_id, task_id) do nothing;
end $$;

create or replace function public.list_profile_candidates(p_profile_id text, p_source text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('task_id', coalesce(d.task_id, c.task_id)) order by c.proposed_end_at nulls last)
        from public.event_candidates c join public.profile_games pg on pg.game_id = c.game_id and pg.profile_id = p_profile_id and pg.enabled
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = p_profile_id
        where c.is_active and c.status <> 'ignored' and (p_source is null or c.source = p_source) and d.status is null
            and (c.proposed_end_at is null or c.proposed_end_at > now())
            and (c.proposed_end_at is null or c.review_reason is not null or (c.proposed_start_at is not null and c.proposed_end_at <= c.proposed_start_at))), '[]');
end $$;

create function public.cleanup_expired_imported_events(p_source text default null, p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; s record; v_removed integer := 0; begin
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if p_source is not null and p_source not in ('starrailassistant-genshin', 'ennead-genshin-calendar',
        'starrailassistant-hsr', 'starrailassistant-zzz', 'starrailassistant-wuwa', 'starrailassistant-nte') then
        raise exception 'Fonte sem política de limpeza de vencidos.';
    end if;
    -- Match both source and game. Unlinked manual tasks and personal recurrence stay out.
    for c in select ec.* from public.event_candidates ec join public.games g on g.id = ec.game_id
        where (p_source is null or ec.source = p_source) and (
            (ec.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and g.abbreviation = 'GI')
            or (ec.source = 'starrailassistant-hsr' and g.abbreviation = 'HSR')
            or (ec.source = 'starrailassistant-zzz' and g.abbreviation = 'ZZZ')
            or (ec.source = 'starrailassistant-wuwa' and g.abbreviation = 'WuWa')
            or (ec.source = 'starrailassistant-nte' and g.abbreviation = 'NTE'))
        order by ec.id for update of ec
    loop
        -- Use the importer/editor order: candidate, all linked templates, then personal state.
        perform 1 from public.tasks t where t.game_id = c.game_id and (t.id = c.task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id))
            order by t.id for update of t;
        perform 1 from public.profile_tasks pt where pt.task_id = c.task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.profile_id = pt.profile_id and d.task_id = pt.task_id)
            order by pt.task_id, pt.profile_id for update of pt;
        for s in select pt.profile_id, pt.task_id from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
            left join public.profile_event_decisions d on d.profile_id = pt.profile_id and d.candidate_id = c.id
            where pt.refresh_type = 0 and pt.expiration_date <= p_now and t.game_id = c.game_id
                and t.id = coalesce(d.task_id, c.task_id)
            order by pt.task_id, pt.profile_id
        loop
            insert into public.profile_event_decisions values (s.profile_id, c.id, 'expired', null)
                on conflict (profile_id, candidate_id) do update set status = 'expired', task_id = null;
            delete from public.profile_tasks where profile_id = s.profile_id and task_id in (s.task_id, c.task_id);
            v_removed := v_removed + 1;
            -- Remove an unused alias, while retaining links owned by other candidates/profiles.
            delete from public.tasks t where t.id = s.task_id and t.id is distinct from c.task_id
                and not exists (select 1 from public.profile_tasks pt where pt.task_id = t.id and not pt.deleted)
                and not exists (select 1 from public.event_candidates ec where ec.task_id = t.id)
                and not exists (select 1 from public.profile_event_decisions d where d.task_id = t.id);
        end loop;
        if exists (select 1 from public.tasks t where t.id = c.task_id and t.refresh_type = 0 and t.expiration_date <= p_now)
            and not exists (select 1 from public.profile_tasks pt where not pt.deleted and (pt.task_id = c.task_id or exists (
                select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.profile_id = pt.profile_id and d.task_id = pt.task_id))) then
            -- Keep the catalogue identity so corrected feeds cannot resurrect a closed edition.
            update public.event_candidates set status = 'ignored', approved_end_at = null where id = c.id;
            delete from public.tasks where id = c.task_id;
        end if;
    end loop;
    return v_removed;
end $$;
grant execute on function public.cleanup_expired_imported_events(text, timestamptz) to anon;

-- Old callers retain their source-specific contract; new callers use the function above.
create or replace function public.cleanup_expired_hsr_events() returns integer
language plpgsql security invoker set search_path = public as $$
declare v_before integer; v_after integer; begin
    select count(*) into v_before from public.event_candidates where source = 'starrailassistant-hsr' and task_id is not null;
    perform public.cleanup_expired_imported_events('starrailassistant-hsr');
    select count(*) into v_after from public.event_candidates where source = 'starrailassistant-hsr' and task_id is not null;
    return v_before - v_after;
end;
$$;

create or replace function public.approve_profile_candidate(p_profile_id text, p_candidate_id bigint, p_deadline timestamptz, p_existing_task_id bigint default null) returns bigint
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; v_task_id bigint; v_game_name text; begin
    if p_deadline is null or p_deadline <= now() then raise exception 'Escolha um prazo futuro para o evento.'; end if;
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found or not c.is_active then raise exception 'Evento não encontrado ou inativo.'; end if;
    if c.status = 'ignored' or exists (select 1 from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id and status = 'expired') then
        raise exception 'Esta edição já foi encerrada neste perfil. Uma edição nova terá estado próprio.';
    end if;
    perform public.require_profile_game(p_profile_id, c.game_id);
    select description into v_game_name from public.games where id = c.game_id;
    if not exists (select 1 from public.games g where g.id = c.game_id and (
        (c.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and g.abbreviation = 'GI')
        or (c.source = 'starrailassistant-hsr' and g.abbreviation = 'HSR')
        or (c.source = 'starrailassistant-zzz' and g.abbreviation = 'ZZZ')
        or (c.source = 'starrailassistant-wuwa' and g.abbreviation = 'WuWa')
        or (c.source = 'starrailassistant-nte' and g.abbreviation = 'NTE'))) then raise exception 'O jogo do candidato não corresponde à fonte.'; end if;
    select task_id into v_task_id from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id;
    v_task_id := coalesce(v_task_id, p_existing_task_id, c.task_id);
    if v_task_id is not null then
        if not exists (select 1 from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
            where t.id = v_task_id and pt.profile_id = p_profile_id and t.game_id = c.game_id and pt.refresh_type = 0
                and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)) then
            -- A shared template without state may be reviewed independently by another profile.
            if v_task_id is distinct from c.task_id then raise exception 'A tarefa selecionada deve ser um evento deste perfil e jogo.'; end if;
        end if;
        if exists (select 1 from public.event_candidates where task_id = v_task_id and id <> c.id)
            or exists (select 1 from public.profile_event_decisions where profile_id = p_profile_id and task_id = v_task_id and candidate_id <> c.id) then
            raise exception 'Essa tarefa já está vinculada a outro evento.';
        end if;
    else
        insert into public.tasks (description, expiration_date, refresh_type, game_id, game_description, cover_url, start_at, owner_profile_id)
            values (c.name, c.proposed_end_at, 0, c.game_id, v_game_name, c.cover_url, c.proposed_start_at, null) returning id into v_task_id;
        update public.event_candidates set task_id = v_task_id where id = c.id;
    end if;
    insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, event_deadline_manual)
        values (p_profile_id, v_task_id, c.name, p_deadline, 0, true)
        on conflict (profile_id, task_id) do update set expiration_date = p_deadline, event_deadline_manual = true, deleted = false;
    if c.task_id is distinct from v_task_id then
        update public.profile_tasks set deleted = true where profile_id = p_profile_id and task_id = c.task_id;
    end if;
    insert into public.profile_event_decisions values (p_profile_id, c.id, 'approved', v_task_id)
        on conflict (profile_id, candidate_id) do update set status = 'approved', task_id = v_task_id;
    return v_task_id;
end $$;

-- Importing a shared template must not materialize CRAN before game selection.
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
       or (v_candidate.source = 'starrailassistant-zzz' and v_abbreviation <> 'ZZZ')
       or (v_candidate.source = 'starrailassistant-wuwa' and v_abbreviation <> 'WuWa')
       or (v_candidate.source = 'starrailassistant-nte' and v_abbreviation <> 'NTE') then
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
            (description, expiration_date, is_done, refresh_type, game_id, game_description, cover_url, start_at, owner_profile_id)
        values
            (v_candidate.name, p_deadline, false, 0, v_game_id, v_game_name, nullif(btrim(v_candidate.cover_url), ''), v_candidate.proposed_start_at, null)
        returning id into v_task_id;
    end if;

    update public.event_candidates
    set task_id = v_task_id, approved_end_at = p_deadline, status = 'approved'
    where id = p_candidate_id;
    return v_task_id;
end;
$$;

notify pgrst, 'reload schema';
commit;

-- Favorite tasks: personal preference and stable ordering.
begin;

alter table public.profile_tasks add column is_favorite boolean not null default false;

create or replace function public.list_profile_tasks(p_profile_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(t) || (to_jsonb(pt) - 'profile_id' - 'task_id' - 'deleted') ||
        jsonb_build_object('game', to_jsonb(g) || pg.overrides, 'game_description', coalesce(pg.overrides->>'description', g.description),
            'event_candidates', case when c.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', c.id, 'source', c.source)) end,
            'weekly_batch_items', case when t.shared_key like 'weekly:%' then jsonb_build_object('definition_key', split_part(t.shared_key, ':', 3)) else null end)
        order by pt.is_favorite desc, pt.expiration_date nulls last, t.id)
        from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
        join public.games g on g.id = t.game_id
        join public.profile_games pg on pg.game_id = t.game_id and pg.profile_id = pt.profile_id and pg.enabled
        left join public.event_candidates c on c.task_id = t.id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id and d.profile_id = pt.profile_id)
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = pt.profile_id
        where pt.profile_id = p_profile_id and not pt.deleted and coalesce(d.status, '') <> 'ignored'
            and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)), '[]');
end $$;

create function public.set_profile_task_favorite(p_profile_id text, p_task_id bigint, p_is_favorite boolean) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    if p_is_favorite is null then raise exception 'Informe o estado da favorita.'; end if;
    -- Update only existing personal state; a favorite must never materialize or restore a task.
    update public.profile_tasks pt set is_favorite = p_is_favorite
        from public.tasks t join public.profile_games pg on pg.game_id = t.game_id
        where pt.task_id = t.id and pt.profile_id = p_profile_id and t.id = p_task_id
            and pg.profile_id = p_profile_id and pg.enabled and not pt.deleted
            and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id);
    if not found then raise exception 'Tarefa não encontrada nos jogos selecionados deste perfil.'; end if;
end $$;

notify pgrst, 'reload schema';
commit;


-- Explicit GI/NTE endgame batch and calendar reminders.
begin;

-- Calendar types are new IDs; legacy Monthly keeps its fixed day interval.
alter table public.tasks add constraint tasks_calendar_recurrence
    check (refresh_type not in (9, 10) or (repeat_days is null and expiration_date is not null));
alter table public.profile_tasks add constraint profile_tasks_calendar_recurrence
    check (refresh_type not in (9, 10) or (repeat_days is null and expiration_date is not null));

create table public.profile_endgame_batches (
    profile_id text references public.profiles(id),
    abbreviation text not null check (abbreviation in ('GI', 'NTE')),
    primary key (profile_id, abbreviation)
);
alter table public.profile_endgame_batches enable row level security;
create policy "public profile endgame batches" on public.profile_endgame_batches
    for all to anon using (true) with check (true);
grant select, insert, update, delete on public.profile_endgame_batches to anon;

create function public.next_monthly_reminder(p_day integer, p_now timestamptz default now()) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare v_next timestamp; begin
    if p_day is null or p_day not in (1, 15) or p_now is null or not isfinite(p_now) then
        raise exception 'Lembrete mensal inválido.';
    end if;
    -- 09:00 UTC is a reminder time (06:00 Brasilia), not a claim about every game reset.
    v_next := date_trunc('month', p_now at time zone 'UTC') + make_interval(days => p_day - 1, hours => 9);
    if v_next at time zone 'UTC' <= p_now then v_next := v_next + interval '1 month'; end if;
    return v_next at time zone 'UTC';
end $$;

-- One explicit transaction covers both enabled games; per-game markers allow later selection.
create function public.create_profile_endgame_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; d record; v_id bigint; v_deadline timestamptz;
    v_created integer := 0; v_preserved integer := 0; v_registered integer := 0; begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select selected.abbreviation from public.games selected join public.profile_games pg on pg.game_id = selected.id
        where pg.profile_id = p_profile_id and pg.enabled and selected.abbreviation in ('GI', 'NTE')
        group by selected.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    if not exists (select 1 from public.games selected join public.profile_games pg on pg.game_id = selected.id
        where pg.profile_id = p_profile_id and pg.enabled and selected.abbreviation in ('GI', 'NTE')) then
        raise exception 'Selecione GI ou NTE no perfil antes de criar o lote.';
    end if;
    for g in select games.* from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('GI', 'NTE') order by games.abbreviation
    loop
        if exists (select 1 from public.profile_endgame_batches where profile_id = p_profile_id and abbreviation = g.abbreviation) then
            continue;
        end if;
        for d in select * from (values
            ('GI', 'imaginarium-theater', 'Imaginarium Theater', 9, null::integer, 1),
            ('GI', 'spiral-abyss', 'Spiral Abyss', 10, null::integer, 15),
            ('NTE', 'beyond-the-rails', 'Beyond the Rails', 3, 14, null::integer)
        ) as catalogue(abbreviation, key, description, refresh_type, repeat_days, month_day)
            where abbreviation = g.abbreviation
        loop
            if exists (select 1 from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
                where pt.profile_id = p_profile_id and not pt.deleted and t.game_id = g.id and pt.description = d.description) then
                v_preserved := v_preserved + 1;
                continue;
            end if;
            if g.abbreviation = 'NTE' then
                if p_nte_deadline is null or not isfinite(p_nte_deadline) or p_nte_deadline <= p_now then
                    raise exception 'Informe o próximo prazo futuro do Beyond the Rails mostrado no jogo. Nenhuma tarefa foi criada.';
                end if;
                v_deadline := p_nte_deadline;
            else
                v_deadline := public.next_monthly_reminder(d.month_day, p_now);
            end if;
            insert into public.tasks (description, expiration_date, refresh_type, repeat_days, game_id,
                game_description, owner_profile_id, shared_key)
            values (d.description, v_deadline, d.refresh_type, d.repeat_days, g.id, g.description,
                null, 'endgame:' || g.abbreviation || ':' || d.key)
            on conflict (shared_key) do nothing returning id into v_id;
            if v_id is null then
                select id into v_id from public.tasks
                    where shared_key = 'endgame:' || g.abbreviation || ':' || d.key and game_id = g.id;
            end if;
            if v_id is null then raise exception 'Definição de desafio incompatível com o jogo.'; end if;
            insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
                values (p_profile_id, v_id, d.description, v_deadline, d.refresh_type, d.repeat_days);
            v_created := v_created + 1;
        end loop;
        insert into public.profile_endgame_batches values (p_profile_id, g.abbreviation);
        v_registered := v_registered + 1;
    end loop;
    return jsonb_build_object('created', v_created, 'preserved', v_preserved, 'registered', v_registered);
end $$;
grant execute on function public.create_profile_endgame_batch(text, timestamptz, timestamptz) to anon;

create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
    delete from public.profile_endgame_batches;
    delete from public.profile_weekly_batches;
    delete from public.profile_event_decisions;
    delete from public.profile_tasks;
    delete from public.profile_games;
    delete from public.event_candidates;
    delete from public.weekly_batch_items;
    delete from public.weekly_batches;
    delete from public.tasks;
    delete from public.games;
end $$;

notify pgrst, 'reload schema';
commit;


-- Unified explicit task batch.
begin;

-- Public inventory for the current batch. Future additions must keep stable definition keys.
create function public.task_batch_catalogue() returns jsonb
language sql stable security invoker set search_path = public as $$
    select jsonb_agg(to_jsonb(item) order by abbreviation, definition_key)
    from (values
        ('HSR', 'echo-of-war', 'Echo of War', 'weekly', 2, 7, null::integer),
        ('HSR', 'simulated-universe', 'Simulated Universe', 'weekly', 2, 7, null::integer),
        ('WuWa', 'weekly-boss', 'Weekly Boss', 'weekly', 2, 7, null::integer),
        ('WuWa', 'fantasies-of-the-thousand-gateways', 'Fantasies of the Thousand Gateways', 'weekly', 2, 7, null::integer),
        ('ZZZ', 'hollow-zero', 'Hollow Zero', 'weekly', 2, 7, null::integer),
        ('ZZZ', 'notorious-hunt', 'Notorious Hunt', 'weekly', 2, 7, null::integer),
        ('GI', 'imaginarium-theater', 'Imaginarium Theater', 'endgame', 9, null::integer, 1),
        ('GI', 'spiral-abyss', 'Spiral Abyss', 'endgame', 10, null::integer, 15),
        ('NTE', 'beyond-the-rails', 'Beyond the Rails', 'endgame', 3, 14, null::integer)
    ) item(abbreviation, definition_key, description, kind, refresh_type, repeat_days, month_day);
$$;

-- Confirmed in game by Cristian on 2026-10-08: 12 days plus hours, rounded to Oct 21 at 05:00 America (UTC-5).
create function public.next_beyond_the_rails_deadline(p_now timestamptz default now()) returns timestamptz
language plpgsql stable security invoker set search_path = public as $$
declare v_anchor constant timestamptz := '2026-10-21T10:00:00Z'; begin
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    -- Hours keep the cycle fixed in UTC even when the database timezone observes DST.
    return v_anchor + (floor(extract(epoch from (p_now - v_anchor)) / 1209600) + 1) * interval '336 hours';
end $$;

-- Keep the earlier RPC signature compatible; omitted deadlines now use the verified cycle.
create or replace function public.create_profile_endgame_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; d record; v_id bigint; v_deadline timestamptz;
    v_created integer := 0; v_preserved integer := 0; v_registered integer := 0; begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select selected.abbreviation from public.games selected join public.profile_games pg on pg.game_id = selected.id
        where pg.profile_id = p_profile_id and pg.enabled and selected.abbreviation in ('GI', 'NTE')
        group by selected.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    if not exists (select 1 from public.games selected join public.profile_games pg on pg.game_id = selected.id
        where pg.profile_id = p_profile_id and pg.enabled and selected.abbreviation in ('GI', 'NTE')) then
        raise exception 'Selecione GI ou NTE no perfil antes de criar o lote.';
    end if;
    for g in select games.* from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('GI', 'NTE') order by games.abbreviation
    loop
        if exists (select 1 from public.profile_endgame_batches where profile_id = p_profile_id and abbreviation = g.abbreviation) then
            continue;
        end if;
        for d in select * from (values
            ('GI', 'imaginarium-theater', 'Imaginarium Theater', 9, null::integer, 1),
            ('GI', 'spiral-abyss', 'Spiral Abyss', 10, null::integer, 15),
            ('NTE', 'beyond-the-rails', 'Beyond the Rails', 3, 14, null::integer)
        ) as catalogue(abbreviation, key, description, refresh_type, repeat_days, month_day)
            where abbreviation = g.abbreviation
        loop
            if exists (select 1 from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
                where pt.profile_id = p_profile_id and not pt.deleted and t.game_id = g.id and pt.description = d.description) then
                v_preserved := v_preserved + 1;
                continue;
            end if;
            if g.abbreviation = 'NTE' then
                if p_nte_deadline is not null and (not isfinite(p_nte_deadline) or p_nte_deadline <= p_now) then
                    raise exception 'Prazo explícito inválido para Beyond the Rails. Nenhuma tarefa foi criada.';
                end if;
                v_deadline := coalesce(p_nte_deadline, public.next_beyond_the_rails_deadline(p_now));
            else
                v_deadline := public.next_monthly_reminder(d.month_day, p_now);
            end if;
            insert into public.tasks (description, expiration_date, refresh_type, repeat_days, game_id,
                game_description, owner_profile_id, shared_key)
            values (d.description, v_deadline, d.refresh_type, d.repeat_days, g.id, g.description,
                null, 'endgame:' || g.abbreviation || ':' || d.key)
            on conflict (shared_key) do nothing returning id into v_id;
            if v_id is null then
                select id into v_id from public.tasks
                    where shared_key = 'endgame:' || g.abbreviation || ':' || d.key and game_id = g.id;
            end if;
            if v_id is null then raise exception 'Definição de desafio incompatível com o jogo.'; end if;
            insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
                values (p_profile_id, v_id, d.description, v_deadline, d.refresh_type, d.repeat_days);
            v_created := v_created + 1;
        end loop;
        insert into public.profile_endgame_batches values (p_profile_id, g.abbreviation);
        v_registered := v_registered + 1;
    end loop;
    return jsonb_build_object('created', v_created, 'preserved', v_preserved, 'registered', v_registered);
end $$;
-- Delegate to existing contracts inside one transaction, retaining all prior batch decisions.
create function public.create_profile_task_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; v_catalogue jsonb := public.task_batch_catalogue();
    v_definitions jsonb; v_result jsonb; v_was_created boolean;
    v_created integer := 0; v_preserved integer := 0; v_registered integer := 0; begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select games.abbreviation from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = games.abbreviation)
        group by games.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    if not exists (select 1 from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = games.abbreviation)) then
        raise exception 'Selecione um jogo com atividades do lote neste perfil.';
    end if;
    for g in select games.* from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x
                where x->>'abbreviation' = games.abbreviation and x->>'kind' = 'weekly')
        order by games.abbreviation
    loop
        select jsonb_agg(jsonb_build_object('key', x->>'definition_key', 'description', x->>'description') order by x->>'definition_key')
            into v_definitions from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = g.abbreviation and x->>'kind' = 'weekly';
        select exists (select 1 from public.profile_weekly_batches where profile_id = p_profile_id and abbreviation = g.abbreviation and status = 'created')
            into v_was_created;
        v_result := public.create_profile_weekly_batch(p_profile_id, g.abbreviation, g.id, v_definitions, true, p_now);
        v_created := v_created + (v_result->>'created')::integer;
        v_preserved := v_preserved + (v_result->>'preserved')::integer;
        if not v_was_created then v_registered := v_registered + 1; end if;
    end loop;
    if exists (select 1 from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('GI', 'NTE')) then
        v_result := public.create_profile_endgame_batch(p_profile_id, p_nte_deadline, p_now);
        v_created := v_created + (v_result->>'created')::integer;
        v_preserved := v_preserved + (v_result->>'preserved')::integer;
        v_registered := v_registered + (v_result->>'registered')::integer;
    end if;
    return jsonb_build_object('status', 'created', 'created', v_created, 'preserved', v_preserved, 'registered', v_registered);
end $$;
grant execute on function public.next_beyond_the_rails_deadline(timestamptz) to anon;
grant execute on function public.task_batch_catalogue() to anon;
grant execute on function public.create_profile_task_batch(text, timestamptz, timestamptz) to anon;

notify pgrst, 'reload schema';
commit;

begin;

-- Decisions survive task deletion and catalogue expansion. Phase calendars have independent offers.
create table public.profile_task_batch_items (
    profile_id text not null references public.profiles(id) on delete cascade,
    abbreviation text not null,
    definition_key text not null,
    calendar_key text not null default '',
    registered_at timestamptz not null default now(),
    primary key (profile_id, abbreviation, definition_key, calendar_key)
);
alter table public.profile_task_batch_items enable row level security;
create policy "public profile task batch items" on public.profile_task_batch_items
    for all using (true) with check (true);
grant select, insert, update, delete on public.profile_task_batch_items to anon;

create function public.next_anchored_batch_deadline(p_anchor timestamptz, p_days integer,
    p_now timestamptz default now()) returns timestamptz
language plpgsql stable security invoker set search_path = public as $$
begin
    if p_anchor is null or not isfinite(p_anchor) or p_days is null or p_days <= 0
        or p_now is null or not isfinite(p_now) then raise exception 'Calendário inválido.'; end if;
    return p_anchor + (floor(extract(epoch from (p_now - p_anchor)) / (p_days::bigint * 86400)) + 1)
        * (p_days::bigint * interval '24 hours');
end $$;

create or replace function public.task_batch_catalogue() returns jsonb
language sql stable security invoker set search_path = public as $$
    select jsonb_agg(to_jsonb(item) order by abbreviation, definition_key)
    from (values
        ('HSR', 'echo-of-war', 'Echo of War', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('HSR', 'simulated-universe', 'Simulated Universe', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('WuWa', 'weekly-boss', 'Weekly Boss', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('WuWa', 'fantasies-of-the-thousand-gateways', 'Fantasies of the Thousand Gateways', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('ZZZ', 'hollow-zero', 'Hollow Zero', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('ZZZ', 'notorious-hunt', 'Notorious Hunt', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('GI', 'imaginarium-theater', 'Imaginarium Theater', 'endgame', 9, null::integer, 1, null::timestamptz, ''),
        ('GI', 'spiral-abyss', 'Spiral Abyss', 'endgame', 10, null::integer, 15, null::timestamptz, ''),
        ('NTE', 'beyond-the-rails', 'Beyond the Rails', 'endgame', 3, 14, null::integer, null::timestamptz, ''),
        -- America UTC-5. These are absolute observations, not days added on every click.
        ('ZZZ', 'deadly-assault', 'Deadly Assault', 'endgame', 3, 14, null::integer, '2026-10-09T09:00:00Z'::timestamptz, ''),
        ('ZZZ', 'shiyu-defense', 'Shiyu Defense', 'endgame', 3, 14, null::integer, '2026-10-16T09:00:00Z'::timestamptz, ''),
        ('WuWa', 'whimpering-wastes', 'Whimpering Wastes', 'endgame', 5, 28, null::integer, '2026-10-26T09:00:00Z'::timestamptz, ''),
        ('WuWa', 'tower-of-adversity', 'Tower of Adversity', 'endgame', 5, 28, null::integer, '2026-10-12T09:00:00Z'::timestamptz, ''),
        -- Current phase only. Never infer a fixed recurrence from a version's remaining days.
        ('WuWa', 'endstate-matrix', 'Endstate Matrix', 'endgame', 0, null::integer, null::integer, '2026-11-10T20:00:00Z'::timestamptz, '3.7')
        -- HSR reserves deliberately inactive: Pure Fiction, Apocalyptic Shadow, Memory of Chaos.
        -- They arrive from the API by edition; do not activate fallback merely on API absence/failure.
    ) item(abbreviation, definition_key, description, kind, refresh_type, repeat_days, month_day, anchor_at, calendar_key);
$$;

create function public.create_profile_extra_challenges(p_profile_id text, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; d record; v_id bigint; v_deadline timestamptz; v_shared_key text;
    v_created integer := 0; v_preserved integer := 0; v_registered integer := 0; v_deferred integer := 0;
begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select games.abbreviation from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('WuWa', 'ZZZ')
        group by games.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    for g in select games.* from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('WuWa', 'ZZZ') order by games.abbreviation
    loop
        for d in select * from jsonb_to_recordset(public.task_batch_catalogue())
            as x(abbreviation text, definition_key text, description text, refresh_type integer,
                repeat_days integer, anchor_at timestamptz, calendar_key text)
            where x.abbreviation = g.abbreviation and anchor_at is not null order by definition_key
        loop
            if exists (select 1 from public.profile_task_batch_items i where i.profile_id = p_profile_id
                and i.abbreviation = g.abbreviation and i.definition_key = d.definition_key and i.calendar_key = d.calendar_key) then
                continue;
            end if;
            if d.repeat_days is null and d.anchor_at <= p_now then
                -- No future phase is known yet. Leave it unregistered and report the missing calendar.
                v_deferred := v_deferred + 1;
                continue;
            end if;
            if exists (select 1 from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
                where pt.profile_id = p_profile_id and not pt.deleted and t.game_id = g.id and pt.description = d.description) then
                v_preserved := v_preserved + 1;
            else
                v_deadline := case when d.repeat_days is null then d.anchor_at
                    else public.next_anchored_batch_deadline(d.anchor_at, d.repeat_days, p_now) end;
                v_shared_key := 'endgame:' || g.abbreviation || ':' || d.definition_key
                    || case when d.calendar_key = '' then '' else ':' || d.calendar_key end;
                insert into public.tasks(description, expiration_date, refresh_type, repeat_days, game_id,
                    game_description, owner_profile_id, shared_key)
                    values(d.description, v_deadline, d.refresh_type, d.repeat_days, g.id, g.description, null, v_shared_key)
                    on conflict (shared_key) do nothing returning id into v_id;
                if v_id is null then select id into v_id from public.tasks where shared_key = v_shared_key and game_id = g.id; end if;
                if v_id is null then raise exception 'Definição de desafio incompatível com o jogo.'; end if;
                insert into public.profile_tasks(profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
                    values(p_profile_id, v_id, d.description, v_deadline, d.refresh_type, d.repeat_days);
                v_created := v_created + 1;
            end if;
            insert into public.profile_task_batch_items(profile_id, abbreviation, definition_key, calendar_key)
                values(p_profile_id, g.abbreviation, d.definition_key, d.calendar_key);
            v_registered := v_registered + 1;
        end loop;
    end loop;
    return jsonb_build_object('created', v_created, 'preserved', v_preserved, 'registered', v_registered, 'deferred', v_deferred);
end $$;

create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
    delete from public.profile_task_batch_items;
    delete from public.profile_endgame_batches;
    delete from public.profile_weekly_batches;
    delete from public.profile_event_decisions;
    delete from public.profile_tasks;
    delete from public.profile_games;
    delete from public.event_candidates;
    delete from public.weekly_batch_items;
    delete from public.weekly_batches;
    delete from public.tasks;
    delete from public.games;
end $$;

grant execute on function public.next_anchored_batch_deadline(timestamptz, integer, timestamptz) to anon;
grant execute on function public.create_profile_extra_challenges(text, timestamptz) to anon;
create or replace function public.create_profile_task_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g public.games%rowtype; v_catalogue jsonb := public.task_batch_catalogue();
    v_definitions jsonb; v_result jsonb; v_deferred integer := 0; v_was_created boolean;
    v_created integer := 0; v_preserved integer := 0; v_registered integer := 0; begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select games.abbreviation from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = games.abbreviation)
        group by games.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    if not exists (select 1 from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = games.abbreviation)) then
        raise exception 'Selecione um jogo com atividades do lote neste perfil.';
    end if;
    for g in select games.* from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x
                where x->>'abbreviation' = games.abbreviation and x->>'kind' = 'weekly')
        order by games.abbreviation
    loop
        select jsonb_agg(jsonb_build_object('key', x->>'definition_key', 'description', x->>'description') order by x->>'definition_key')
            into v_definitions from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = g.abbreviation and x->>'kind' = 'weekly';
        select exists (select 1 from public.profile_weekly_batches where profile_id = p_profile_id and abbreviation = g.abbreviation and status = 'created')
            into v_was_created;
        v_result := public.create_profile_weekly_batch(p_profile_id, g.abbreviation, g.id, v_definitions, true, p_now);
        v_created := v_created + (v_result->>'created')::integer;
        v_preserved := v_preserved + (v_result->>'preserved')::integer;
        if not v_was_created then v_registered := v_registered + 1; end if;
    end loop;
    if exists (select 1 from public.games games join public.profile_games pg on pg.game_id = games.id
        where pg.profile_id = p_profile_id and pg.enabled and games.abbreviation in ('GI', 'NTE')) then
        v_result := public.create_profile_endgame_batch(p_profile_id, p_nte_deadline, p_now);
        v_created := v_created + (v_result->>'created')::integer;
        v_preserved := v_preserved + (v_result->>'preserved')::integer;
        v_registered := v_registered + (v_result->>'registered')::integer;
    end if;
    v_result := public.create_profile_extra_challenges(p_profile_id, p_now);
    v_created := v_created + (v_result->>'created')::integer;
    v_preserved := v_preserved + (v_result->>'preserved')::integer;
    v_registered := v_registered + (v_result->>'registered')::integer;
    v_deferred := (v_result->>'deferred')::integer;
    return jsonb_build_object('status', 'created', 'created', v_created, 'preserved', v_preserved, 'registered', v_registered)
        || case when v_deferred > 0 then jsonb_build_object('deferred', v_deferred) else '{}'::jsonb end;
end $$;

notify pgrst, 'reload schema';
commit;
