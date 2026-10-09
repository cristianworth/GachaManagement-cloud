begin;

-- Resolve only a recorded task or a stable shared definition; never infer ownership by name.
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
            or (g.abbreviation in ('GI','NTE') and exists (select 1 from public.profile_endgame_batches b
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

-- A receipt makes retries safe even when the successful response was lost.
create table public.profile_task_batch_requests (
    profile_id text not null references public.profiles(id),
    request_id uuid not null,
    items jsonb not null,
    result jsonb not null,
    primary key (profile_id, request_id)
);
alter table public.profile_task_batch_requests enable row level security;
create policy "public profile batch requests" on public.profile_task_batch_requests
    for all to anon using (true) with check (true);
grant select, insert, update, delete on public.profile_task_batch_requests to anon;

-- Keep the old positional arguments; the optional request identifies one explicit submission.
drop function public.choose_profile_task_batch(text, jsonb, timestamptz);
create function public.choose_profile_task_batch(p_profile_id text, p_items jsonb,
    p_now timestamptz default now(), p_request_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_offers jsonb; v_offer jsonb; v_current jsonb; v_item jsonb; v_receipt record;
    v_old_id bigint; v_new_id bigint; v_deadline timestamptz; v_game public.games%rowtype;
    v_replaced integer := 0; v_result jsonb;
begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Seleção explícita inválida.'; end if;
    if p_request_id is not null then
        select * into v_receipt from public.profile_task_batch_requests
            where profile_id = p_profile_id and request_id = p_request_id;
        if found then
            if v_receipt.items <> p_items then raise exception 'A tentativa já foi usada com outra seleção.'; end if;
            return v_receipt.result;
        end if;
    end if;
    -- Prevent a game toggle during the transaction; personal row locks follow template locks.
    perform 1 from public.profile_games where profile_id = p_profile_id order by game_id for update;
    v_offers := public.list_profile_task_batch(p_profile_id, p_now);
    if exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object'
        or jsonb_typeof(x->'abbreviation') is distinct from 'string'
        or jsonb_typeof(x->'definition_key') is distinct from 'string'
        or jsonb_typeof(x->'calendar_key') is distinct from 'string'
        or not exists (select 1 from jsonb_array_elements(v_offers) o
            where o->>'abbreviation' = x->>'abbreviation' and o->>'definition_key' = x->>'definition_key'
                and o->>'calendar_key' = x->>'calendar_key'))
        or (select count(distinct (x->>'abbreviation', x->>'definition_key', x->>'calendar_key'))
            from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
        raise exception 'Seleção desconhecida, desabilitada ou repetida.';
    end if;
    for v_item in select value from jsonb_array_elements(p_items) loop
        -- Identity-only calls retain the original creation/preservation contract.
        if not (v_item ? 'expected_task_id') then continue; end if;
        select x into v_offer from jsonb_array_elements(v_offers) x
            where x->>'abbreviation' = v_item->>'abbreviation' and x->>'definition_key' = v_item->>'definition_key'
                and x->>'calendar_key' = v_item->>'calendar_key';
        if p_request_id is null or not coalesce((v_offer->>'can_replace')::boolean, false)
            or v_item->>'expected_task_id' is distinct from v_offer->>'task_id'
            or v_item->>'expected_version' is distinct from v_offer->>'task_version' then
            raise exception 'Item protegido, calendário indisponível ou tarefa alterada. Reabra a seleção.';
        end if;
        v_old_id := (v_offer->>'task_id')::bigint;
        perform 1 from public.tasks where id = v_old_id for update;
        perform 1 from public.profile_tasks where profile_id = p_profile_id and task_id = v_old_id for update;
        select x into v_current from jsonb_array_elements(public.list_profile_task_batch(p_profile_id, p_now)) x
            where x->>'abbreviation' = v_item->>'abbreviation' and x->>'definition_key' = v_item->>'definition_key'
                and x->>'calendar_key' = v_item->>'calendar_key';
        if not coalesce((v_current->>'can_replace')::boolean, false)
            or v_current->>'task_id' is distinct from v_item->>'expected_task_id'
            or v_current->>'task_version' is distinct from v_item->>'expected_version' then
            raise exception 'A tarefa mudou enquanto a seleção estava aberta. Reabra a seleção.';
        end if;
        select * into v_game from public.games where abbreviation = v_offer->>'abbreviation'
            and id in (select game_id from public.profile_games where profile_id = p_profile_id and enabled);
        v_deadline := case when v_offer->>'kind' = 'weekly' then public.next_weekly_deadline(p_now)
            when v_offer->>'month_day' is not null then public.next_monthly_reminder((v_offer->>'month_day')::integer, p_now)
            when v_game.abbreviation = 'NTE' then public.next_beyond_the_rails_deadline(p_now)
            when v_offer->>'repeat_days' is null then (v_offer->>'anchor_at')::timestamptz
            else public.next_anchored_batch_deadline((v_offer->>'anchor_at')::timestamptz,
                (v_offer->>'repeat_days')::integer, p_now) end;
        if v_deadline is null or not isfinite(v_deadline) or v_deadline <= p_now then
            raise exception 'Calendário indisponível. A tarefa anterior foi mantida.';
        end if;
        -- A private replacement keeps the shared template and every other profile untouched.
        insert into public.tasks(description, expiration_date, refresh_type, repeat_days, game_id,
            game_description, owner_profile_id, cover_url, is_done)
            values(v_offer->>'description', v_deadline, (v_offer->>'refresh_type')::integer,
                (v_offer->>'repeat_days')::integer, v_game.id, v_game.description, p_profile_id,
                v_offer->>'cover_url', false) returning id into v_new_id;
        -- tasks_profile_templates materializes the fresh personal state with default flags.
        insert into public.profile_task_batch_decisions(profile_id, abbreviation, definition_key, calendar_key, status, task_id)
            values(p_profile_id, v_offer->>'abbreviation', v_offer->>'definition_key', v_offer->>'calendar_key', 'created', v_new_id)
            on conflict (profile_id, abbreviation, definition_key, calendar_key)
                do update set status = 'created', task_id = excluded.task_id;
        delete from public.profile_tasks where profile_id = p_profile_id and task_id = v_old_id;
        delete from public.tasks where id = v_old_id and owner_profile_id = p_profile_id
            and not exists (select 1 from public.profile_tasks where task_id = v_old_id)
            and not exists (select 1 from public.profile_task_batch_decisions where task_id = v_old_id);
        v_replaced := v_replaced + 1;
    end loop;
    v_result := public.apply_profile_task_batch(p_profile_id, p_items, true, null, null, p_now);
    v_result := v_result || jsonb_build_object('created', (v_result->>'created')::integer + v_replaced,
        'registered', (v_result->>'registered')::integer + v_replaced, 'replaced', v_replaced);
    if p_request_id is not null then
        insert into public.profile_task_batch_requests values(p_profile_id, p_request_id, p_items, v_result);
    end if;
    return v_result;
end $$;
grant execute on function public.choose_profile_task_batch(text, jsonb, timestamptz, uuid) to anon;

create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
    delete from public.profile_task_batch_requests;
    delete from public.profile_task_batch_decisions;
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

-- Add the two requested HSR defaults without updating existing task covers.
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
  }
]'::jsonb;
$$;

notify pgrst, 'reload schema';
commit;
