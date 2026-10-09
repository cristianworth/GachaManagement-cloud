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
