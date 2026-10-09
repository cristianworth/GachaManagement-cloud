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
