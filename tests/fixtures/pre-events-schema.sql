-- Compatibility baseline: games/tasks before the event-candidate migrations.
create table public.games (
    id bigint generated always as identity primary key,
    description text, abbreviation text, img text, cap_stamina numeric,
    stamina_per_minute numeric, current_stamina numeric default 0,
    max_stamina_at text default '', date_max_stamina timestamptz default now(),
    pending_tasks text default '', color text
);
create table public.tasks (
    id bigint generated always as identity primary key,
    description text, expiration_date timestamptz, is_done boolean default false,
    refresh_type integer, game_id bigint references public.games(id) on delete cascade,
    game_description text
);
alter table public.games enable row level security;
alter table public.tasks enable row level security;
create policy "allow anon full access to games" on public.games for all to anon using (true) with check (true);
create policy "allow anon full access to tasks" on public.tasks for all to anon using (true) with check (true);
