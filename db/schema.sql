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
    game_description text
);

create index if not exists tasks_game_id_idx on public.tasks (game_id);
create index if not exists tasks_expiration_date_idx on public.tasks (expiration_date);

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- Acesso pessoal/aberto (sem login): liberamos leitura e escrita para a
-- chave "anon". Troque estas policies por regras baseadas em auth.uid()
-- caso um dia adicione login.
-- ------------------------------------------------------------
alter table public.games enable row level security;
alter table public.tasks enable row level security;

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
