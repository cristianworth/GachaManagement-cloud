-- Execute in Supabase SQL Editor after the HSR migration.
-- Every fixture and mutation is rolled back. Assertions raise on failure.
begin;
set local role anon;
do $$
declare
    v_hsr bigint;
    v_genshin bigint;
    v_candidate bigint;
    v_task bigint;
    v_manual bigint;
    v_foreign bigint;
    v_count integer;
begin
    select id into strict v_hsr from public.games where abbreviation = 'HSR';
    select id into strict v_genshin from public.games where abbreviation = 'GI';
    insert into public.event_candidates
        (source, external_id, name, game_id, proposed_start_at, cover_url)
    values ('starrailassistant-hsr', '__hsr_test__', 'Test HSR edition', v_hsr,
        now() + interval '1 day', 'https://example.com/test.jpg') returning id into v_candidate;
    v_task := public.approve_event_candidate(v_candidate, now() + interval '2 days');
    if not exists (select 1 from public.tasks where id = v_task and game_id = v_hsr
        and refresh_type = 0 and start_at > now() and cover_url = 'https://example.com/test.jpg') then
        raise exception 'HSR approval did not preserve game, start, deadline or cover';
    end if;
    perform public.approve_event_candidate(v_candidate, now() + interval '3 days');
    if (select task_id from public.event_candidates where id = v_candidate) <> v_task then
        raise exception 'Repeated approval created another task';
    end if;
    update public.event_candidates set cover_url = '' where id = v_candidate;
    perform public.approve_event_candidate(v_candidate, now() + interval '3 days');
    if (select cover_url from public.tasks where id = v_task) <> 'https://example.com/test.jpg' then
        raise exception 'Empty cover erased existing image';
    end if;

    insert into public.tasks (description, game_id, refresh_type, expiration_date)
    values ('Manual expired HSR', v_hsr, 0, now() - interval '1 day') returning id into v_manual;
    insert into public.tasks (description, game_id, refresh_type, expiration_date)
    values ('Other game', v_genshin, 0, now() - interval '1 day') returning id into v_foreign;
    update public.event_candidates set task_id = null where id = v_candidate;
    begin
        perform public.approve_event_candidate(v_candidate, now() + interval '2 days', v_foreign);
        raise exception 'Cross-game approval unexpectedly succeeded';
    exception when raise_exception then
        if SQLERRM <> 'A tarefa selecionada deve ser um evento do mesmo jogo.' then raise; end if;
    end;
    update public.event_candidates set task_id = v_task where id = v_candidate;
    perform public.cleanup_expired_hsr_events();
    if not exists (select 1 from public.tasks where id = v_task) then
        raise exception 'Cleanup removed a future imported edition';
    end if;
    update public.tasks set expiration_date = now() - interval '1 second' where id = v_task;
    v_count := public.cleanup_expired_hsr_events();
    if v_count < 1 or exists (select 1 from public.tasks where id = v_task) then
        raise exception 'Cleanup did not remove expired import';
    end if;
    if not exists (select 1 from public.tasks where id = v_manual)
        or not exists (select 1 from public.tasks where id = v_foreign) then
        raise exception 'Cleanup touched manual or other-game tasks';
    end if;
    if (select task_id from public.event_candidates where id = v_candidate) is not null then
        raise exception 'Cleanup did not release candidate task link';
    end if;
end;
$$;
rollback;
select 'PASS: approval, game isolation, covers, repeated approval and expiry cleanup' as result;
