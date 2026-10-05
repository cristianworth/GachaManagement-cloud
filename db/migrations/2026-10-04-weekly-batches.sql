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
