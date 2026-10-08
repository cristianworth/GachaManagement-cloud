begin;

-- Calendar types are new IDs; legacy Monthly keeps its fixed day interval.
alter table public.tasks add constraint tasks_calendar_recurrence
    check (refresh_type not in (9, 10) or (repeat_days is null and expiration_date is not null));
alter table public.profile_tasks add constraint profile_tasks_calendar_recurrence
    check (refresh_type not in (9, 10) or (repeat_days is null and expiration_date is not null));

create table public.profile_endgame_batches (
    profile_id text references public.profiles(id),
    abbreviation text not null check (abbreviation in ('GI', 'NTE')),
    primary key (profile_id, abbreviation)
);
alter table public.profile_endgame_batches enable row level security;
create policy "public profile endgame batches" on public.profile_endgame_batches
    for all to anon using (true) with check (true);
grant select, insert, update, delete on public.profile_endgame_batches to anon;

create function public.next_monthly_reminder(p_day integer, p_now timestamptz default now()) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare v_next timestamp; begin
    if p_day is null or p_day not in (1, 15) or p_now is null or not isfinite(p_now) then
        raise exception 'Lembrete mensal inválido.';
    end if;
    -- 09:00 UTC is a reminder time (06:00 Brasilia), not a claim about every game reset.
    v_next := date_trunc('month', p_now at time zone 'UTC') + make_interval(days => p_day - 1, hours => 9);
    if v_next at time zone 'UTC' <= p_now then v_next := v_next + interval '1 month'; end if;
    return v_next at time zone 'UTC';
end $$;

-- One explicit transaction covers both enabled games; per-game markers allow later selection.
create function public.create_profile_endgame_batch(p_profile_id text, p_nte_deadline timestamptz default null,
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
                if p_nte_deadline is null or not isfinite(p_nte_deadline) or p_nte_deadline <= p_now then
                    raise exception 'Informe o próximo prazo futuro do Beyond the Rails mostrado no jogo. Nenhuma tarefa foi criada.';
                end if;
                v_deadline := p_nte_deadline;
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
grant execute on function public.create_profile_endgame_batch(text, timestamptz, timestamptz) to anon;

create or replace function public.reset_application_data() returns void
language plpgsql security invoker set search_path = public as $$ begin
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

notify pgrst, 'reload schema';
commit;
