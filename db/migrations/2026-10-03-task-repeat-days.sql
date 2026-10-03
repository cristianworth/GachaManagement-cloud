-- Preserve existing cycles while allowing a user-defined number of days.
-- Apply after the event migrations. No deadlines, completion states or links change.
begin;

alter table public.tasks add column if not exists repeat_days integer;

update public.tasks
set repeat_days = case refresh_type
    when 1 then 1 when 2 then 7 when 3 then 14 when 4 then 15
    when 5 then 28 when 6 then 31 when 7 then 42
    else null end
where repeat_days is null and refresh_type between 1 and 7;

-- Older clients and SQL seeds only supply refresh_type. Preserve that contract,
-- while explicit intervals (including Monthly = 30) take precedence.
create or replace function public.normalize_task_repeat_days()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.refresh_type = 0 then
        new.repeat_days := null;
    elsif new.repeat_days is null
       or (tg_op = 'UPDATE' and old.refresh_type between 1 and 7
           and new.refresh_type is distinct from old.refresh_type
           and new.repeat_days is not distinct from old.repeat_days) then
        new.repeat_days := case new.refresh_type
            when 1 then 1 when 2 then 7 when 3 then 14 when 4 then 15
            when 5 then 28 when 6 then 31 when 7 then 42
            else new.repeat_days end;
    end if;
    return new;
end;
$$;

drop trigger if exists tasks_normalize_repeat_days on public.tasks;
create trigger tasks_normalize_repeat_days
before insert or update of refresh_type, repeat_days on public.tasks
for each row execute function public.normalize_task_repeat_days();

do $$
begin
    if not exists (select 1 from pg_constraint
        where conrelid = 'public.tasks'::regclass and conname = 'tasks_repeat_days_check') then
        alter table public.tasks add constraint tasks_repeat_days_check check (
            (repeat_days is null or repeat_days > 0)
            and (refresh_type is distinct from 0 or repeat_days is null)
            and (refresh_type is distinct from 8 or repeat_days is not null)
        );
    end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
