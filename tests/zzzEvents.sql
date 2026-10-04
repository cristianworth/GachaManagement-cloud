-- Run after 2026-10-04-nte-events.sql. All changes are rolled back.
begin;
set local role anon;
do $$
declare
    v_game bigint; v_candidate bigint; v_task bigint; v_missing bigint;
    v_other bigint; v_abbreviation text; v_source text; v_deadline timestamptz := now() + interval '20 days';
begin
    foreach v_abbreviation in array array['GI', 'HSR', 'ZZZ', 'WuWa', 'NTE'] loop
        select id into strict v_game from public.games where abbreviation = v_abbreviation;
        v_source := case v_abbreviation when 'GI' then 'starrailassistant-genshin' when 'HSR' then 'starrailassistant-hsr' when 'ZZZ' then 'starrailassistant-zzz' when 'WuWa' then 'starrailassistant-wuwa' else 'starrailassistant-nte' end;
        select id into strict v_other from public.games where abbreviation = case when v_abbreviation = 'HSR' then 'GI' else 'HSR' end;
        insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
        values (v_source, '__auto_test__', 'Automatic event', v_game, v_deadline)
        returning id into v_candidate;
        if coalesce((public.import_event_candidates(v_source)->>'imported')::integer, 0) < 1 then
            raise exception 'Source importer did not import';
        end if;
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
        values (v_source, '__missing_test__', 'Missing end', v_game) returning id into v_missing;
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
        begin
            perform public.approve_event_candidate(v_candidate, v_deadline);
            raise exception 'Cross-game approval unexpectedly succeeded';
        exception when raise_exception then
            if SQLERRM <> 'O jogo do candidato não corresponde à fonte.' then raise; end if;
        end;
        delete from public.event_candidates where id in (v_candidate, v_missing);
    end loop;
end;
$$;
-- Identical names in different games remain isolated when importing one source.
do $$
declare
    v_gi bigint; v_hsr bigint; v_zzz bigint;
    v_gi_candidate bigint; v_hsr_candidate bigint; v_zzz_candidate bigint;
begin
    select id into strict v_gi from public.games where abbreviation = 'GI';
    select id into strict v_hsr from public.games where abbreviation = 'HSR';
    select id into strict v_zzz from public.games where abbreviation = 'ZZZ';
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-genshin', '__isolation_test__', 'Shared title', v_gi, now() + interval '10 days')
    returning id into v_gi_candidate;
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-hsr', '__isolation_test__', 'Shared title', v_hsr, now() + interval '10 days')
    returning id into v_hsr_candidate;
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-zzz', '__isolation_test__', 'Shared title', v_zzz, now() + interval '10 days')
    returning id into v_zzz_candidate;
    perform public.import_event_candidates('starrailassistant-zzz');
    if (select task_id from public.event_candidates where id = v_zzz_candidate) is null
       or exists (select 1 from public.event_candidates where id in (v_gi_candidate, v_hsr_candidate) and task_id is not null) then
        raise exception 'ZZZ source import affected another game';
    end if;
    perform public.import_event_candidates('starrailassistant-genshin');
    perform public.import_event_candidates('starrailassistant-hsr');
    if (select count(*) from public.tasks where description = 'Shared title' and game_id in (v_gi, v_hsr, v_zzz)) <> 3 then
        raise exception 'Shared title imports did not remain isolated';
    end if;
end;
$$;
rollback;
select 'PASS: GI/HSR/ZZZ/WuWa/NTE automatic import, repeat sync, completion, manual deadline, restore, missing end, ignore, game isolation' as result;
