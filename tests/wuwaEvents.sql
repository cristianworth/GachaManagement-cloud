-- WuWa contracts as anon; fixtures are rolled back and never retained.
begin;
set local role anon;
do $$
declare
    v_game bigint; v_old bigint; v_new bigint; v_old_task bigint; v_new_task bigint;
    v_review bigint; v_deadline timestamptz := now() + interval '20 days';
begin
    select id into strict v_game from public.games where abbreviation = 'WuWa';
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-wuwa', '__wuwa_old__', 'Chord Cleansing', v_game, v_deadline) returning id into v_old;
    perform public.sync_event_candidate(v_old);
    select task_id into v_old_task from public.event_candidates where id = v_old;
    update public.tasks set is_done = true where id = v_old_task;
    insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
    values ('starrailassistant-wuwa', '__wuwa_new__', 'Chord Cleansing', v_game, v_deadline + interval '20 days') returning id into v_new;
    perform public.sync_event_candidate(v_new);
    select task_id into v_new_task from public.event_candidates where id = v_new;
    if v_old_task = v_new_task or (select is_done from public.tasks where id = v_new_task) then
        raise exception 'New WuWa edition inherited the previous task or completion';
    end if;
    update public.event_candidates set proposed_end_at = v_deadline + interval '1 day' where id = v_old;
    perform public.sync_event_candidate(v_old);
    if (select task_id from public.event_candidates where id = v_old) <> v_old_task
       or not (select is_done from public.tasks where id = v_old_task) then
        raise exception 'Deadline correction reset identity or completion';
    end if;
    perform public.ignore_imported_task(v_old_task);
    perform public.import_event_candidates('starrailassistant-wuwa');
    if (select status from public.event_candidates where id = v_old) <> 'ignored'
       or (select task_id from public.event_candidates where id = v_new) <> v_new_task then
        raise exception 'Ignoring one edition affected another';
    end if;
    insert into public.event_candidates (source, external_id, name, game_id, review_reason)
    values ('starrailassistant-wuwa', '__wuwa_review__', 'Unknown clock', v_game, 'Confirm America on Game8') returning id into v_review;
    if public.sync_event_candidate(v_review) <> 'review'
       or (select review_reason from public.event_candidates where id = v_review) <> 'Confirm America on Game8'
       or (select task_id from public.event_candidates where id = v_review) is not null then
        raise exception 'Unverified clock imported or lost its evidence warning';
    end if;
end;
$$;
rollback;
select 'PASS: WuWa editions, completion, correction, ignore and unverified clock review' as result;
