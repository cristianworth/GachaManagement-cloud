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
