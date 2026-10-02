-- Run after 2026-10-02-auto-events.sql. All changes are rolled back.
begin;
set local role anon;
do $$
declare
    v_game bigint; v_candidate bigint; v_task bigint; v_missing bigint; v_ignored bigint;
    v_other bigint; v_count integer; v_deadline timestamptz := now() + interval '20 days';
begin
    select id into strict v_game from public.games where abbreviation = 'GI';
    select id into strict v_other from public.games where abbreviation = 'HSR';
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-genshin', '__auto_test__', 'Automatic event', v_game, v_deadline)
    returning id into v_candidate;
    if public.sync_event_candidate(v_candidate) <> 'imported' then raise exception 'Valid end did not import'; end if;
    select task_id into v_task from public.event_candidates where id = v_candidate;
    if not exists (select 1 from public.tasks where id = v_task and expiration_date = v_deadline
        and cover_url is null and start_at is null and not event_deadline_manual) then
        raise exception 'Missing cover/start blocked or corrupted import';
    end if;
    update public.tasks set is_done = true where id = v_task;
    perform public.sync_event_candidate(v_candidate);
    if (select task_id from public.event_candidates where id = v_candidate) <> v_task
        or not (select is_done from public.tasks where id = v_task) then
        raise exception 'Repeated import changed identity or completion';
    end if;

    update public.event_candidates set proposed_end_at = v_deadline + interval '1 day' where id = v_candidate;
    perform public.sync_event_candidate(v_candidate);
    if not exists (select 1 from public.tasks where id = v_task
        and expiration_date = v_deadline + interval '1 day' and not event_deadline_manual) then
        raise exception 'API-managed deadline did not update';
    end if;
    update public.tasks set expiration_date = v_deadline + interval '2 days' where id = v_task;
    if not (select event_deadline_manual from public.tasks where id = v_task) then
        raise exception 'Manual edit was not protected';
    end if;
    update public.event_candidates set proposed_end_at = v_deadline + interval '3 days',
        cover_url = 'https://example.com/new.jpg' where id = v_candidate;
    if public.sync_event_candidate(v_candidate) <> 'manual'
        or (select expiration_date from public.tasks where id = v_task) <> v_deadline + interval '2 days'
        or (select cover_url from public.tasks where id = v_task) <> 'https://example.com/new.jpg' then
        raise exception 'Sync overwrote manual deadline or failed to update cover';
    end if;
    perform public.sync_event_candidate(v_candidate, true);
    if not exists (select 1 from public.tasks where id = v_task
        and expiration_date = v_deadline + interval '3 days' and not event_deadline_manual and is_done) then
        raise exception 'Restore API deadline failed';
    end if;

    insert into public.event_candidates (source, external_id, name, game_id)
    values ('starrailassistant-hsr', '__missing_test__', 'Missing end', v_other) returning id into v_missing;
    if public.sync_event_candidate(v_missing) <> 'review'
        or (select task_id from public.event_candidates where id = v_missing) is not null then
        raise exception 'Missing deadline imported a task';
    end if;
    perform public.approve_event_candidate(v_missing, v_deadline);
    if public.sync_event_candidate(v_missing) <> 'manual' then
        raise exception 'Manual approval of missing end was not protected';
    end if;
    update public.event_candidates set proposed_start_at = v_deadline + interval '1 day', proposed_end_at = v_deadline where id = v_missing;
    begin
        perform public.sync_event_candidate(v_missing, true);
        raise exception 'Invalid range unexpectedly imported';
    exception when raise_exception then
        if SQLERRM <> 'A fonte não possui um prazo utilizável.' then raise; end if;
    end;

    perform public.ignore_imported_task(v_task);
    if exists (select 1 from public.tasks where id = v_task)
        or public.sync_event_candidate(v_candidate) <> 'ignored' then
        raise exception 'Ignored event reappeared';
    end if;
    update public.event_candidates set status = 'pending', game_id = v_other where id = v_candidate;
    begin
        perform public.sync_event_candidate(v_candidate);
        raise exception 'Cross-game import unexpectedly succeeded';
    exception when raise_exception then
        if SQLERRM <> 'O jogo do candidato não corresponde à fonte.' then raise; end if;
    end;
end;
$$;
rollback;
select 'PASS: automatic import, repeat sync, completion, manual deadline, restore, missing end, ignore, game isolation' as result;
