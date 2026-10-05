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
