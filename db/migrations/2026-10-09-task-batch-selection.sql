begin;

-- Personal offers are separate from historical batch markers and shared task covers.
create table public.profile_task_batch_decisions (
    profile_id text not null references public.profiles(id) on delete cascade,
    abbreviation text not null,
    definition_key text not null,
    calendar_key text not null default '',
    status text not null check (status in ('deferred', 'created', 'preserved')),
    task_id bigint references public.tasks(id) on delete set null,
    primary key (profile_id, abbreviation, definition_key, calendar_key)
);
alter table public.profile_task_batch_decisions enable row level security;
create policy "public profile task batch decisions" on public.profile_task_batch_decisions
    for all using (true) with check (true);
grant select, insert, update, delete on public.profile_task_batch_decisions to anon;

-- Source metadata is populated by the following cover migration; no backfill is performed.
create function public.task_batch_cover_catalogue() returns jsonb
language sql immutable security invoker set search_path = public as $$ select '[]'::jsonb; $$;
grant execute on function public.task_batch_cover_catalogue() to anon;

-- Reading never adopts history by writing. Closed legacy groups protect absent/renamed items.
create function public.list_profile_task_batch(p_profile_id text, p_now timestamptz default now()) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_catalogue jsonb := public.task_batch_catalogue(); v_covers jsonb := public.task_batch_cover_catalogue(); v_result jsonb;
begin
    perform public.require_profile(p_profile_id);
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if exists (select g.abbreviation from public.games g join public.profile_games pg on pg.game_id = g.id
        where pg.profile_id = p_profile_id and pg.enabled
            and exists (select 1 from jsonb_array_elements(v_catalogue) x where x->>'abbreviation' = g.abbreviation)
        group by g.abbreviation having count(*) > 1) then raise exception 'Sigla de jogo ambígua.'; end if;
    select coalesce(jsonb_agg(c.item || jsonb_build_object('game_description', g.description, 'cover_url', (select x->>'cover_url' from jsonb_array_elements(v_covers) x where x->>'abbreviation' = g.abbreviation and x->>'definition_key' = c.item->>'definition_key'), 'state',
        case when d.status in ('created', 'preserved') then
            case when d.task_id is null or pt.deleted or pt.task_id is null then 'excluded' else d.status end
        when (c.item->>'kind' = 'weekly' and exists (select 1 from public.profile_weekly_batches b
                where b.profile_id = p_profile_id and b.abbreviation = g.abbreviation and b.status = 'created'))
            or (g.abbreviation in ('GI','NTE') and exists (select 1 from public.profile_endgame_batches b
                where b.profile_id = p_profile_id and b.abbreviation = g.abbreviation))
            or exists (select 1 from public.profile_task_batch_items b where b.profile_id = p_profile_id
                and b.abbreviation = g.abbreviation and b.definition_key = c.item->>'definition_key'
                and b.calendar_key = c.item->>'calendar_key') then 'legacy'
        when c.item->>'calendar_key' <> '' and (c.item->>'anchor_at')::timestamptz <= p_now then 'unavailable'
        else coalesce(d.status, 'never') end) order by g.abbreviation, c.item->>'definition_key'), '[]'::jsonb)
        into v_result
    from jsonb_array_elements(v_catalogue) c(item)
    join public.games g on g.abbreviation = c.item->>'abbreviation'
    join public.profile_games pg on pg.game_id = g.id and pg.profile_id = p_profile_id and pg.enabled
    left join public.profile_task_batch_decisions d on d.profile_id = p_profile_id
        and d.abbreviation = g.abbreviation and d.definition_key = c.item->>'definition_key'
        and d.calendar_key = c.item->>'calendar_key'
    left join public.profile_tasks pt on pt.profile_id = p_profile_id and pt.task_id = d.task_id;
    return v_result;
end $$;

-- One transaction/actor lock; scope is used only by the compatible legacy entry points.
create function public.apply_profile_task_batch(p_profile_id text, p_items jsonb default null,
    p_defer_unselected boolean default false, p_scope jsonb default null,
    p_nte_deadline timestamptz default null, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_offers jsonb; d jsonb; g public.games%rowtype; v_id bigint; v_deadline timestamptz;
    v_key text; v_status text; v_selected boolean; v_created integer := 0; v_preserved integer := 0;
    v_registered integer := 0; v_processed integer := 0; v_deferred integer := 0; b record;
begin
    perform public.require_profile(p_profile_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    v_offers := public.list_profile_task_batch(p_profile_id, p_now);
    if jsonb_array_length(v_offers) = 0 then raise exception 'Selecione um jogo com atividades do lote neste perfil.'; end if;
    if p_items is not null then
        if jsonb_typeof(p_items) <> 'array' then raise exception 'Seleção inválida.'; end if;
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
    end if;
    for d in select value from jsonb_array_elements(v_offers) loop
        if p_scope is not null and not exists (select 1 from jsonb_array_elements(p_scope) x
            where x->>'abbreviation' = d->>'abbreviation' and x->>'definition_key' = d->>'definition_key'
                and x->>'calendar_key' = d->>'calendar_key') then continue; end if;
        if d->>'state' not in ('never', 'deferred', 'unavailable') then continue; end if;
        v_selected := p_items is null or exists (select 1 from jsonb_array_elements(p_items) x
            where x->>'abbreviation' = d->>'abbreviation' and x->>'definition_key' = d->>'definition_key'
                and x->>'calendar_key' = d->>'calendar_key');
        if not v_selected then
            if p_defer_unselected and d->>'state' <> 'unavailable' then
                insert into public.profile_task_batch_decisions(profile_id, abbreviation, definition_key, calendar_key, status)
                    values(p_profile_id, d->>'abbreviation', d->>'definition_key', d->>'calendar_key', 'deferred')
                    on conflict do nothing;
            end if;
            continue;
        end if;
        if d->>'state' = 'unavailable' then v_deferred := v_deferred + 1; continue; end if;
        select * into g from public.games where abbreviation = d->>'abbreviation'
            and id in (select game_id from public.profile_games where profile_id = p_profile_id and enabled);
        v_id := null;
        select pt.task_id into v_id from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
            where pt.profile_id = p_profile_id and not pt.deleted and t.game_id = g.id
                and pt.description = d->>'description' order by pt.task_id limit 1;
        if v_id is not null then
            -- A homonym prevents creation, but grants no ownership or permission to rewrite it.
            v_status := 'preserved'; v_preserved := v_preserved + 1;
        else
            v_deadline := case when d->>'kind' = 'weekly' then public.next_weekly_deadline(p_now)
                when d->>'month_day' is not null then public.next_monthly_reminder((d->>'month_day')::integer, p_now)
                when g.abbreviation = 'NTE' then coalesce(p_nte_deadline, public.next_beyond_the_rails_deadline(p_now))
                when d->>'repeat_days' is null then (d->>'anchor_at')::timestamptz
                else public.next_anchored_batch_deadline((d->>'anchor_at')::timestamptz, (d->>'repeat_days')::integer, p_now) end;
            if g.abbreviation = 'NTE' and (not isfinite(v_deadline) or v_deadline <= p_now) then
                raise exception 'Prazo explícito inválido para Beyond the Rails. Nenhuma tarefa foi criada.'; end if;
            v_key := (case when d->>'kind' = 'weekly' then 'weekly:' else 'endgame:' end)
                || g.abbreviation || ':' || (d->>'definition_key')
                || case when d->>'calendar_key' = '' then '' else ':' || (d->>'calendar_key') end;
            insert into public.tasks(description, expiration_date, refresh_type, repeat_days, game_id,
                game_description, owner_profile_id, shared_key, cover_url)
                values(d->>'description', v_deadline, (d->>'refresh_type')::integer, (d->>'repeat_days')::integer,
                    g.id, g.description, null, v_key, d->>'cover_url')
                on conflict (shared_key) do nothing returning id into v_id;
            if v_id is null then select id into v_id from public.tasks where shared_key = v_key and game_id = g.id; end if;
            if v_id is null then raise exception 'Definição de desafio incompatível com o jogo.'; end if;
            -- A tombstone must never be recreated even if old metadata was incomplete.
            if exists (select 1 from public.profile_tasks where profile_id = p_profile_id and task_id = v_id) then
                v_status := 'preserved'; v_preserved := v_preserved + 1;
            else
                insert into public.profile_tasks(profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
                    values(p_profile_id, v_id, d->>'description', v_deadline, (d->>'refresh_type')::integer, (d->>'repeat_days')::integer);
                v_status := 'created'; v_created := v_created + 1;
            end if;
        end if;
        insert into public.profile_task_batch_decisions(profile_id, abbreviation, definition_key, calendar_key, status, task_id)
            values(p_profile_id, g.abbreviation, d->>'definition_key', d->>'calendar_key', v_status, v_id)
            on conflict (profile_id, abbreviation, definition_key, calendar_key)
                do update set status = excluded.status, task_id = excluded.task_id;
        v_processed := v_processed + 1;
        if d->>'anchor_at' is not null then
            insert into public.profile_task_batch_items(profile_id, abbreviation, definition_key, calendar_key)
                values(p_profile_id, g.abbreviation, d->>'definition_key', d->>'calendar_key') on conflict do nothing;
            v_registered := v_registered + 1;
        end if;
    end loop;
    v_offers := public.list_profile_task_batch(p_profile_id, p_now);
    -- A legacy group closes only after every definition is processed, never after partial selection.
    for b in select o->>'abbreviation' abbreviation, o->>'kind' kind
        from jsonb_array_elements(v_offers) o where o->>'anchor_at' is null group by 1, 2 loop
        if not exists (select 1 from jsonb_array_elements(v_offers) o
            where o->>'abbreviation' = b.abbreviation and o->>'kind' = b.kind and o->>'anchor_at' is null
                and o->>'state' in ('never','deferred','unavailable')) then
            if b.kind = 'weekly' then
                if not exists (select 1 from public.profile_weekly_batches where profile_id = p_profile_id
                    and abbreviation = b.abbreviation and status = 'created') then
                    insert into public.profile_weekly_batches values(p_profile_id, b.abbreviation, 'created')
                        on conflict (profile_id, abbreviation) do update set status = 'created';
                    v_registered := v_registered + 1;
                end if;
            elsif not exists (select 1 from public.profile_endgame_batches where profile_id = p_profile_id and abbreviation = b.abbreviation) then
                insert into public.profile_endgame_batches values(p_profile_id, b.abbreviation);
                v_registered := v_registered + 1;
            end if;
        end if;
    end loop;
    return jsonb_build_object('status', 'created', 'created', v_created, 'preserved', v_preserved,
        'registered', case when p_defer_unselected then v_processed else v_registered end)
        || case when v_deferred > 0 then jsonb_build_object('deferred', v_deferred) else '{}'::jsonb end;
end $$;

create function public.choose_profile_task_batch(p_profile_id text, p_items jsonb, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    if p_items is null then raise exception 'Seleção explícita obrigatória.'; end if;
    return public.apply_profile_task_batch(p_profile_id, p_items, true, null, null, p_now);
end $$;
create or replace function public.create_profile_task_batch(p_profile_id text, p_nte_deadline timestamptz default null,
    p_now timestamptz default now()) returns jsonb language sql security invoker set search_path = public as $$
    select public.apply_profile_task_batch(p_profile_id, null, false, null, p_nte_deadline, p_now);
$$;

create or replace function public.create_profile_weekly_batch(p_profile_id text, p_abbreviation text, p_game_id bigint,
    p_definitions jsonb, p_explicit boolean default false, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_scope jsonb; v_result jsonb; begin
    perform public.require_profile_game(p_profile_id, p_game_id);
    perform pg_advisory_xact_lock(hashtext('profile:' || p_profile_id));
    perform public.next_weekly_deadline(p_now);
    if not exists (select 1 from public.games where id = p_game_id and abbreviation = p_abbreviation)
        or p_abbreviation not in ('HSR','WuWa','ZZZ') then raise exception 'Jogo sem lote semanal disponível.'; end if;
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
        where x->>'abbreviation' in ('GI','NTE');
    return public.apply_profile_task_batch(p_profile_id, null, false, v_scope, p_nte_deadline, p_now) - 'status';
end $$;
create or replace function public.create_profile_extra_challenges(p_profile_id text, p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path = public as $$ declare v_scope jsonb; v_result jsonb; begin
    select jsonb_agg(x) into v_scope from jsonb_array_elements(public.task_batch_catalogue()) x where x->>'anchor_at' is not null;
    v_result := public.apply_profile_task_batch(p_profile_id, null, false, v_scope, null, p_now) - 'status';
    return v_result || jsonb_build_object('deferred', coalesce((v_result->>'deferred')::integer, 0));
end $$;

create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
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
grant execute on function public.list_profile_task_batch(text, timestamptz) to anon;
grant execute on function public.apply_profile_task_batch(text, jsonb, boolean, jsonb, timestamptz, timestamptz) to anon;
grant execute on function public.choose_profile_task_batch(text, jsonb, timestamptz) to anon;
notify pgrst, 'reload schema';
commit;
