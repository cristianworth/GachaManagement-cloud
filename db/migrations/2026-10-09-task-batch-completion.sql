begin;

-- New weekly definitions have their own group; old GI/NTE endgame markers cannot close it.
alter table public.profile_weekly_batches drop constraint profile_weekly_batches_abbreviation_check;
alter table public.profile_weekly_batches add constraint profile_weekly_batches_abbreviation_check
    check (abbreviation in ('GI','NTE','HSR','WuWa','ZZZ'));

-- Expanding a catalogue never starts new weekly groups automatically for an existing profile.
insert into public.profile_weekly_batches(profile_id, abbreviation, status)
    select p.id, d.abbreviation, 'skipped' from public.profiles p
    cross join (values ('GI'),('NTE')) d(abbreviation)
    where exists (select 1 from public.profile_tasks t where t.profile_id = p.id)
        or exists (select 1 from public.profile_endgame_batches b where b.profile_id = p.id)
        or exists (select 1 from public.profile_task_batch_decisions b where b.profile_id = p.id)
    on conflict do nothing;

-- GI: Game8 Trounce Domains, Monday 04:00 UTC-5.
-- NTE weekly bosses: Monday 06:00 Brasilia confirmed by Cristian on 2026-10-09.
-- This is separate from the NTE daily reset at 05:00 UTC-5.
create or replace function public.task_batch_catalogue() returns jsonb
language sql stable security invoker set search_path = public as $$
    select jsonb_agg(to_jsonb(item) order by abbreviation, definition_key)
    from (values
        ('GI', 'weekly-boss', 'Weekly Boss', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
        ('NTE', 'weekly-boss', 'Weekly Boss', 'weekly', 2, 7, null::integer, null::timestamptz, ''),
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

create or replace function public.create_profile_extra_challenges(p_profile_id text, p_now timestamptz default now()) returns jsonb
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

create or replace function public.list_profile_task_batch(p_profile_id text, p_now timestamptz default now()) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_catalogue jsonb := public.task_batch_catalogue(); v_covers jsonb := public.task_batch_cover_catalogue(); v_result jsonb;
begin
    perform public.require_profile(p_profile_id);
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select g.abbreviation from public.games g join public.profile_games pg on pg.game_id = g.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = g.abbreviation)
        group by g.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    select coalesce(jsonb_agg(c.item || jsonb_build_object(
        'game_description', g.description, 'cover_url', cover.item->>'cover_url',
        'cover_source_url', cover.item->>'source_url', 'current_cover_url', target.cover_url,
        'task_id', target.task_id,
        'can_replace', coalesce(target.batch_owned and not target.imported
            and (c.item->>'calendar_key' = '' or (c.item->>'anchor_at')::timestamptz > p_now), false),
        'task_version', target.task_version,
        'state', case
        when target.deleted then 'excluded'
        when d.status in ('created', 'preserved') then
            case when target.task_id is null then 'excluded' else d.status end
        when (c.item->>'kind' = 'weekly' and exists (select 1 from public.profile_weekly_batches b
                where b.profile_id = p_profile_id and b.abbreviation = g.abbreviation and b.status = 'created'))
            or (c.item->>'kind' = 'endgame' and g.abbreviation in ('GI','NTE') and exists (select 1 from public.profile_endgame_batches b
                where b.profile_id = p_profile_id and b.abbreviation = g.abbreviation))
            or exists (select 1 from public.profile_task_batch_items b where b.profile_id = p_profile_id
                and b.abbreviation = g.abbreviation and b.definition_key = c.item->>'definition_key'
                and b.calendar_key = c.item->>'calendar_key') then 'legacy'
        when target.task_id is not null then 'created'
        when c.item->>'calendar_key' <> '' and (c.item->>'anchor_at')::timestamptz <= p_now then 'unavailable'
        else coalesce(d.status, 'never') end) order by g.abbreviation, c.item->>'definition_key'), '[]'::jsonb)
        into v_result
    from jsonb_array_elements(v_catalogue) c(item)
    join public.games g on g.abbreviation = c.item->>'abbreviation'
    join public.profile_games pg on pg.game_id = g.id and pg.profile_id = p_profile_id and pg.enabled
    left join public.profile_task_batch_decisions d on d.profile_id = p_profile_id
        and d.abbreviation = g.abbreviation and d.definition_key = c.item->>'definition_key'
        and d.calendar_key = c.item->>'calendar_key'
    left join lateral (select x as item from jsonb_array_elements(v_covers) x
        where x->>'abbreviation' = g.abbreviation and x->>'definition_key' = c.item->>'definition_key') cover on true
    left join lateral (
        select t.id task_id, pt.deleted, t.cover_url,
            md5(to_jsonb(pt)::text || to_jsonb(t)::text) task_version,
            (t.shared_key = (case when c.item->>'kind' = 'weekly' then 'weekly:' else 'endgame:' end)
                || g.abbreviation || ':' || (c.item->>'definition_key')
                || case when c.item->>'calendar_key' = '' then '' else ':' || (c.item->>'calendar_key') end
                or (t.owner_profile_id = p_profile_id and d.status = 'created' and d.task_id = t.id)) batch_owned,
            exists (select 1 from public.event_candidates e where e.task_id = t.id
                or exists (select 1 from public.profile_event_decisions ed where ed.profile_id = p_profile_id
                    and ed.task_id = t.id and ed.candidate_id = e.id)) imported
        from public.tasks t join public.profile_tasks pt on pt.task_id = t.id and pt.profile_id = p_profile_id
        where t.game_id = g.id and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)
            and (t.id = d.task_id or (d.task_id is null and t.shared_key =
                (case when c.item->>'kind' = 'weekly' then 'weekly:' else 'endgame:' end)
                || g.abbreviation || ':' || (c.item->>'definition_key')
                || case when c.item->>'calendar_key' = '' then '' else ':' || (c.item->>'calendar_key') end))
        order by t.id limit 1
    ) target on true;
    return v_result;
end $$;

create or replace function public.create_profile_weekly_batch(p_profile_id text, p_abbreviation text, p_game_id bigint,
    p_definitions jsonb, p_explicit boolean default false, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_scope jsonb; v_result jsonb; begin
    perform public.require_profile_game(p_profile_id, p_game_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    perform public.next_weekly_deadline(p_now);
    if not exists (select 1 from public.games where id = p_game_id and abbreviation = p_abbreviation)
        or p_abbreviation not in ('GI','NTE','HSR','WuWa','ZZZ') then raise exception 'Jogo sem lote semanal disponível.'; end if;
    if p_definitions is null or jsonb_typeof(p_definitions) <> 'array' then raise exception 'Definições semanais inválidas.'; end if;
    select jsonb_agg(x) into v_scope from jsonb_array_elements(public.task_batch_catalogue()) x
        where x->>'abbreviation' = p_abbreviation and x->>'kind' = 'weekly';
    if jsonb_array_length(p_definitions) <> jsonb_array_length(v_scope)
        or (select count(distinct x->>'key') from jsonb_array_elements(p_definitions) x) <> jsonb_array_length(v_scope)
        or exists (select 1 from jsonb_array_elements(p_definitions) x where not exists (
            select 1 from jsonb_array_elements(v_scope) o where o->>'definition_key' = x->>'key' and o->>'description' = x->>'description')) then
        raise exception 'Definições semanais inválidas.'; end if;
    if not p_explicit and (exists (select 1 from public.profile_weekly_batches where profile_id = p_profile_id and abbreviation = p_abbreviation)
        or exists (select 1 from public.profile_task_batch_decisions where profile_id = p_profile_id and abbreviation = p_abbreviation)) then
        return jsonb_build_object('status', coalesce((select status from public.profile_weekly_batches
            where profile_id = p_profile_id and abbreviation = p_abbreviation), 'skipped'), 'created', 0, 'preserved', 0);
    end if;
    v_result := public.apply_profile_task_batch(p_profile_id, null, false, v_scope, null, p_now);
    return v_result - 'registered';
end $$;

create or replace function public.create_profile_endgame_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_scope jsonb; begin
    perform public.require_profile(p_profile_id);
    if not exists (select 1 from public.profile_games pg join public.games g on g.id = pg.game_id
        where pg.profile_id = p_profile_id and pg.enabled and g.abbreviation in ('GI','NTE')) then
        raise exception 'Selecione GI ou NTE no perfil antes de criar o lote.'; end if;
    select jsonb_agg(x) into v_scope from jsonb_array_elements(public.task_batch_catalogue()) x
        where x->>'abbreviation' in ('GI','NTE') and x->>'kind' = 'endgame';
    return public.apply_profile_task_batch(p_profile_id, null, false, v_scope, p_nte_deadline, p_now) - 'status';
end $$;

create or replace function public.set_profile_games(p_profile_id text, p_game_ids bigint[], p_create_weeklies boolean default true) returns void
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
            where g.id = any(p_game_ids) and g.abbreviation in ('GI', 'NTE', 'HSR', 'WuWa', 'ZZZ')
            on conflict (profile_id, abbreviation) do nothing;
    end if;
    perform public.materialize_profile_tasks(p_profile_id);
end $$;

-- Source defaults only. Existing personalized/null covers are never backfilled.
create or replace function public.task_batch_cover_catalogue() returns jsonb
language sql immutable security invoker set search_path = public as $$
    select '[
  {
    "abbreviation": "GI",
    "definition_key": "imaginarium-theater",
    "cover_url": "https://img.game8.co/3943955/ce05aa7ad789c490d54b655fb8a26774.png/show",
    "source_url": "https://game8.co/games/Genshin-Impact/archives/401979",
    "source_label": "Genshin Impact - Imaginarium Theater Guide",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "GI",
    "definition_key": "spiral-abyss",
    "cover_url": "https://img.game8.co/4302376/f98fc79a591045f8bdd0631cfe9e323e.png/show",
    "source_url": "https://game8.co/games/Genshin-Impact/archives/304937",
    "source_label": "Genshin Impact - Spiral Abyss Guide - How to Get to Musk Reef",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "NTE",
    "definition_key": "beyond-the-rails",
    "cover_url": "https://img.gamewith.net/article/thumbnail/rectangle/74216.png",
    "source_url": "https://gamewith.net/nte/74216",
    "source_label": "Beyond the Rails Guide - Location and How to Play",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "ZZZ",
    "definition_key": "deadly-assault",
    "cover_url": "https://img.game8.co/4206855/1971519f6eb1a44b0a88dfc3a8da0d59.png/show",
    "source_url": "https://game8.co/games/Zenless-Zone-Zero/archives/489103",
    "source_label": "Zenless Zone Zero Deadly Assault Guide and Reset",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "ZZZ",
    "definition_key": "shiyu-defense",
    "cover_url": "https://img.game8.co/3955541/2ff3a0bf93bdac4d79177454d0d1d880.png/show",
    "source_url": "https://game8.co/games/Zenless-Zone-Zero/archives/460702",
    "source_label": "Shiyu Defense guide header",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "WuWa",
    "definition_key": "tower-of-adversity",
    "cover_url": "https://img.game8.co/3893839/206a2ebc90ef6fff3394d7bf64e09383.png/show",
    "source_url": "https://game8.co/games/Wuthering-Waves/archives/453474",
    "source_label": "Wuthering Waves - Tower of Adversity Guide",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "WuWa",
    "definition_key": "whimpering-wastes",
    "cover_url": "https://img.game8.co/4104601/0cce02f634aeb46c7679e546e4cd71d6.png/show",
    "source_url": "https://game8.co/games/Wuthering-Waves/archives/498614",
    "source_label": "Wuthering Waves - Whimpering Wastes Guide",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "WuWa",
    "definition_key": "endstate-matrix",
    "cover_url": "https://img.game8.co/4447878/9bc0b8315174f9135d0af2f92f38f687.png/show",
    "source_url": "https://game8.co/games/Wuthering-Waves/archives/572518",
    "source_label": "Endstate Matrix",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "HSR",
    "definition_key": "echo-of-war",
    "cover_url": "https://img.game8.co/4219086/15d7d900482b095987344cd3e305f515.png/show",
    "source_url": "https://game8.co/games/Honkai-Star-Rail/archives/410031",
    "source_label": "Echoes of War Weekly Bosses and Drops | Honkai: Star Rail｜Game8",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "HSR",
    "definition_key": "simulated-universe",
    "cover_url": "https://img.game8.co/3668343/07dbaf282c60b9ddf0f893877e60b595.png/show",
    "source_url": "https://game8.co/games/Honkai-Star-Rail/archives/409149",
    "source_label": "Simulated Universe Guide | Honkai: Star Rail｜Game8",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "GI",
    "definition_key": "weekly-boss",
    "cover_url": "https://img.game8.co/3358170/84dac34cf25fbf37297273dd9472e03c.png/show",
    "source_url": "https://game8.co/games/Genshin-Impact/archives/331384",
    "source_label": "List of Weekly Bosses and Drops | Trounce Domain Guide | Genshin Impact",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "NTE",
    "definition_key": "weekly-boss",
    "cover_url": "https://img.game8.co/4488767/c531bb490192501df9511b21649758dd.png/show",
    "source_url": "https://game8.co/games/Neverness-to-Everness/archives/597952",
    "source_label": "How to Beat Morphix Guide | Neverness to Everness (representative weekly boss)",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "WuWa",
    "definition_key": "weekly-boss",
    "cover_url": "https://img.game8.co/3893931/a4beb189a6b449319c48ce6736f258d2.png/show",
    "source_url": "https://game8.co/games/Wuthering-Waves/archives/456244",
    "source_label": "Scar Boss Fight and Location | Wuthering Waves (WuWa)｜Game8 (representative weekly boss)",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "WuWa",
    "definition_key": "fantasies-of-the-thousand-gateways",
    "cover_url": "https://img.game8.co/4104936/1d1c7948d340059366941588c0db569f.png/show",
    "source_url": "https://game8.co/games/Wuthering-Waves/archives/498720",
    "source_label": "Fantasies of the Thousand Gateways Guide | Wuthering Waves",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "ZZZ",
    "definition_key": "hollow-zero",
    "cover_url": "https://img.game8.co/3889779/999b78370d9698fa7bcd539da597c682.png/show",
    "source_url": "https://game8.co/games/Zenless-Zone-Zero/archives/457182",
    "source_label": "Hollow Zero Guide and Rewards | Zenless Zone Zero",
    "checked_on": "2026-10-09"
  },
  {
    "abbreviation": "ZZZ",
    "definition_key": "notorious-hunt",
    "cover_url": "https://img.game8.co/3923776/e2c37b33dafc5fcd8b2b0849920645b1.png/show",
    "source_url": "https://game8.co/games/Zenless-Zone-Zero/archives/455454",
    "source_label": "Notorious Hunt Guide | Zenless Zone Zero",
    "checked_on": "2026-10-09"
  }
]'::jsonb;
$$;

notify pgrst, 'reload schema';
commit;
