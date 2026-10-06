begin;

alter table public.profile_event_decisions drop constraint profile_event_decisions_status_check;
alter table public.profile_event_decisions add constraint profile_event_decisions_status_check
    check (status in ('approved', 'ignored', 'expired'));

-- An expired decision retains only an identity tombstone, never a task/history row.
create function public.protect_closed_profile_edition() returns trigger
language plpgsql security invoker set search_path = public as $$ begin
    if old.status = 'expired' and new.status <> 'expired' then
        raise exception 'Esta edição já foi encerrada neste perfil. Uma edição nova terá estado próprio.';
    end if;
    return new;
end $$;
create trigger decisions_closed_editions before update on public.profile_event_decisions
    for each row execute function public.protect_closed_profile_edition();

create or replace function public.materialize_profile_tasks(p_profile_id text) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    insert into public.profile_tasks (profile_id, task_id, description, expiration_date, refresh_type, repeat_days)
    select p_profile_id, t.id, t.description, t.expiration_date, t.refresh_type, t.repeat_days
    from public.tasks t join public.event_candidates c on c.task_id = t.id
    join public.profile_games pg on pg.profile_id = p_profile_id and pg.game_id = t.game_id and pg.enabled
    where t.owner_profile_id is null
        and c.is_active and c.status <> 'ignored' and c.proposed_end_at > now() and c.review_reason is null
        and (c.proposed_start_at is null or c.proposed_end_at > c.proposed_start_at)
        and not exists (select 1 from public.profile_event_decisions d where d.profile_id = p_profile_id and d.candidate_id = c.id
            and (d.status in ('ignored', 'expired') or d.task_id is distinct from c.task_id))
    on conflict (profile_id, task_id) do nothing;
end $$;

create or replace function public.list_profile_candidates(p_profile_id text, p_source text default null) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('task_id', coalesce(d.task_id, c.task_id)) order by c.proposed_end_at nulls last)
        from public.event_candidates c join public.profile_games pg on pg.game_id = c.game_id and pg.profile_id = p_profile_id and pg.enabled
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = p_profile_id
        where c.is_active and c.status <> 'ignored' and (p_source is null or c.source = p_source) and d.status is null
            and (c.proposed_end_at is null or c.proposed_end_at > now())
            and (c.proposed_end_at is null or c.review_reason is not null or (c.proposed_start_at is not null and c.proposed_end_at <= c.proposed_start_at))), '[]');
end $$;

create function public.cleanup_expired_imported_events(p_source text default null, p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; s record; v_removed integer := 0; begin
    if p_now is null or not isfinite(p_now) then raise exception 'Relógio inválido.'; end if;
    if p_source is not null and p_source not in ('starrailassistant-genshin', 'ennead-genshin-calendar',
        'starrailassistant-hsr', 'starrailassistant-zzz', 'starrailassistant-wuwa', 'starrailassistant-nte') then
        raise exception 'Fonte sem política de limpeza de vencidos.';
    end if;
    -- Match both source and game. Unlinked manual tasks and personal recurrence stay out.
    for c in select ec.* from public.event_candidates ec join public.games g on g.id = ec.game_id
        where (p_source is null or ec.source = p_source) and (
            (ec.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and g.abbreviation = 'GI')
            or (ec.source = 'starrailassistant-hsr' and g.abbreviation = 'HSR')
            or (ec.source = 'starrailassistant-zzz' and g.abbreviation = 'ZZZ')
            or (ec.source = 'starrailassistant-wuwa' and g.abbreviation = 'WuWa')
            or (ec.source = 'starrailassistant-nte' and g.abbreviation = 'NTE'))
        order by ec.id for update of ec
    loop
        -- Use the importer/editor order: candidate, all linked templates, then personal state.
        perform 1 from public.tasks t where t.game_id = c.game_id and (t.id = c.task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id))
            order by t.id for update of t;
        perform 1 from public.profile_tasks pt where pt.task_id = c.task_id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.profile_id = pt.profile_id and d.task_id = pt.task_id)
            order by pt.task_id, pt.profile_id for update of pt;
        for s in select pt.profile_id, pt.task_id from public.profile_tasks pt join public.tasks t on t.id = pt.task_id
            left join public.profile_event_decisions d on d.profile_id = pt.profile_id and d.candidate_id = c.id
            where pt.refresh_type = 0 and pt.expiration_date <= p_now and t.game_id = c.game_id
                and t.id = coalesce(d.task_id, c.task_id)
            order by pt.task_id, pt.profile_id
        loop
            insert into public.profile_event_decisions values (s.profile_id, c.id, 'expired', null)
                on conflict (profile_id, candidate_id) do update set status = 'expired', task_id = null;
            delete from public.profile_tasks where profile_id = s.profile_id and task_id in (s.task_id, c.task_id);
            v_removed := v_removed + 1;
            -- Remove an unused alias, while retaining links owned by other candidates/profiles.
            delete from public.tasks t where t.id = s.task_id and t.id is distinct from c.task_id
                and not exists (select 1 from public.profile_tasks pt where pt.task_id = t.id and not pt.deleted)
                and not exists (select 1 from public.event_candidates ec where ec.task_id = t.id)
                and not exists (select 1 from public.profile_event_decisions d where d.task_id = t.id);
        end loop;
        if exists (select 1 from public.tasks t where t.id = c.task_id and t.refresh_type = 0 and t.expiration_date <= p_now)
            and not exists (select 1 from public.profile_tasks pt where not pt.deleted and (pt.task_id = c.task_id or exists (
                select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.profile_id = pt.profile_id and d.task_id = pt.task_id))) then
            -- Keep the catalogue identity so corrected feeds cannot resurrect a closed edition.
            update public.event_candidates set status = 'ignored', approved_end_at = null where id = c.id;
            delete from public.tasks where id = c.task_id;
        end if;
    end loop;
    return v_removed;
end $$;
grant execute on function public.cleanup_expired_imported_events(text, timestamptz) to anon;

-- Old callers retain their source-specific contract; new callers use the function above.
create or replace function public.cleanup_expired_hsr_events() returns integer
language plpgsql security invoker set search_path = public as $$
declare v_before integer; v_after integer; begin
    select count(*) into v_before from public.event_candidates where source = 'starrailassistant-hsr' and task_id is not null;
    perform public.cleanup_expired_imported_events('starrailassistant-hsr');
    select count(*) into v_after from public.event_candidates where source = 'starrailassistant-hsr' and task_id is not null;
    return v_before - v_after;
end;
$$;

create or replace function public.approve_profile_candidate(p_profile_id text, p_candidate_id bigint, p_deadline timestamptz, p_existing_task_id bigint default null) returns bigint
language plpgsql security invoker set search_path = public as $$
declare c public.event_candidates%rowtype; v_task_id bigint; v_game_name text; begin
    if p_deadline is null or p_deadline <= now() then raise exception 'Escolha um prazo futuro para o evento.'; end if;
    select * into c from public.event_candidates where id = p_candidate_id for update;
    if not found or not c.is_active then raise exception 'Evento não encontrado ou inativo.'; end if;
    if c.status = 'ignored' or exists (select 1 from public.profile_event_decisions where profile_id = p_profile_id and candidate_id = c.id and status = 'expired') then
        raise exception 'Esta edição já foi encerrada neste perfil. Uma edição nova terá estado próprio.';
    end if;
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

-- Importing a shared template must not materialize CRAN before game selection.
create or replace function public.approve_event_candidate(
    p_candidate_id bigint,
    p_deadline timestamptz,
    p_existing_task_id bigint default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_candidate public.event_candidates%rowtype;
    v_game_id bigint;
    v_game_name text;
    v_abbreviation text;
    v_task_id bigint;
begin
    if p_deadline is null or p_deadline <= now() then
        raise exception 'Escolha um prazo futuro para o evento.';
    end if;

    select * into v_candidate
    from public.event_candidates
    where id = p_candidate_id
    for update;
    if not found then
        raise exception 'Evento não encontrado.';
    end if;
    if not v_candidate.is_active then
        raise exception 'O evento não aparece mais na fonte; sincronize antes de aprovar.';
    end if;

    select id, description, abbreviation into v_game_id, v_game_name, v_abbreviation
    from public.games where id = v_candidate.game_id;
    if v_game_id is null then
        raise exception 'O candidato precisa estar associado a um jogo cadastrado; sincronize novamente.';
    end if;

    if (v_candidate.source in ('starrailassistant-genshin', 'ennead-genshin-calendar') and v_abbreviation <> 'GI')
       or (v_candidate.source = 'starrailassistant-hsr' and v_abbreviation <> 'HSR')
       or (v_candidate.source = 'starrailassistant-zzz' and v_abbreviation <> 'ZZZ')
       or (v_candidate.source = 'starrailassistant-wuwa' and v_abbreviation <> 'WuWa')
       or (v_candidate.source = 'starrailassistant-nte' and v_abbreviation <> 'NTE') then
        raise exception 'O jogo do candidato não corresponde à fonte.';
    end if;

    v_task_id := coalesce(v_candidate.task_id, p_existing_task_id);
    if v_task_id is not null then
        if not exists (
            select 1 from public.tasks
            where id = v_task_id and game_id = v_game_id and refresh_type = 0
        ) then
            raise exception 'A tarefa selecionada deve ser um evento do mesmo jogo.';
        end if;
        if exists (
            select 1 from public.event_candidates
            where task_id = v_task_id and id <> p_candidate_id
        ) then
            raise exception 'Essa tarefa já está vinculada a outro evento.';
        end if;
        update public.tasks
        set expiration_date = p_deadline,
            start_at = v_candidate.proposed_start_at,
            cover_url = coalesce(nullif(btrim(v_candidate.cover_url), ''), cover_url)
        where id = v_task_id;
    else
        insert into public.tasks
            (description, expiration_date, is_done, refresh_type, game_id, game_description, cover_url, start_at, owner_profile_id)
        values
            (v_candidate.name, p_deadline, false, 0, v_game_id, v_game_name, nullif(btrim(v_candidate.cover_url), ''), v_candidate.proposed_start_at, null)
        returning id into v_task_id;
    end if;

    update public.event_candidates
    set task_id = v_task_id, approved_end_at = p_deadline, status = 'approved'
    where id = p_candidate_id;
    return v_task_id;
end;
$$;

notify pgrst, 'reload schema';
commit;
