-- Run after 2026-10-03-task-repeat-days.sql. Test data is rolled back.
begin;
set local role anon;
do $$
declare
    v_task bigint; v_type integer; v_days integer; v_date timestamptz := now() + interval '20 days';
begin
    for v_type, v_days in select * from (values (1,1),(2,7),(3,14),(4,15),(5,28),(6,31),(7,42)) as legacy(id,days) loop
        insert into public.tasks (description, refresh_type, expiration_date, is_done, cover_url)
        values ('__repeat_test__', v_type, v_date, true, 'https://example.com/cover.jpg') returning id into v_task;
        if not exists (select 1 from public.tasks where id = v_task and repeat_days = v_days) then
            raise exception 'Legacy interval % did not retain % days', v_type, v_days;
        end if;
        update public.tasks set refresh_type = case when v_type = 2 then 6 else 2 end where id = v_task;
        if (select repeat_days from public.tasks where id = v_task) <> (case when v_type = 2 then 31 else 7 end) then
            raise exception 'Legacy update did not update the interval';
        end if;
        update public.tasks set repeat_days = 19, refresh_type = 8 where id = v_task;
        if not exists (select 1 from public.tasks where id = v_task and repeat_days = 19
            and expiration_date = v_date and is_done and cover_url = 'https://example.com/cover.jpg') then
            raise exception 'Custom interval changed other task fields';
        end if;
        update public.tasks set refresh_type = 2, repeat_days = 7 where id = v_task;
        if (select repeat_days from public.tasks where id = v_task) <> 7 then
            raise exception 'Legacy update did not update the interval';
        end if;
        update public.tasks set refresh_type = 0 where id = v_task;
        if (select repeat_days from public.tasks where id = v_task) is not null then
            raise exception 'An event became recurring';
        end if;
    end loop;

    insert into public.tasks (description, refresh_type, repeat_days) values ('__repeat_test__', 6, 30) returning id into v_task;
    if (select repeat_days from public.tasks where id = v_task) <> 30 then
        raise exception 'New Monthly was converted to the legacy interval';
    end if;
    update public.tasks set refresh_type = 8, repeat_days = 30 where id = v_task;
    if (select repeat_days from public.tasks where id = v_task) <> 30 then
        raise exception 'Changing only the preset lost the explicit interval';
    end if;
    update public.tasks set refresh_type = 6, repeat_days = 30 where id = v_task;
    if (select repeat_days from public.tasks where id = v_task) <> 30 then
        raise exception 'Returning from Custom to Monthly changed 30 to 31 days';
    end if;
    update public.tasks set refresh_type = 8 where id = v_task;
    begin
        update public.tasks set repeat_days = 0 where id = v_task;
        raise exception 'Zero interval was accepted';
    exception when check_violation then null;
    end;
    begin
        update public.tasks set repeat_days = -1 where id = v_task;
        raise exception 'Negative interval was accepted';
    exception when check_violation then null;
    end;
    begin
        insert into public.tasks (refresh_type) values (8);
        raise exception 'Custom interval without days was accepted';
    exception when check_violation then null;
    end;
end;
$$;
rollback;
select 'PASS: legacy cycles, custom interval, Monthly 30, event without recurrence, field preservation and constraints' as result;
