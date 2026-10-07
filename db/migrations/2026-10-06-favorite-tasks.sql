begin;

alter table public.profile_tasks add column is_favorite boolean not null default false;

create or replace function public.list_profile_tasks(p_profile_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    return coalesce((select jsonb_agg(to_jsonb(t) || (to_jsonb(pt) - 'profile_id' - 'task_id' - 'deleted') ||
        jsonb_build_object('game', to_jsonb(g) || pg.overrides, 'game_description', coalesce(pg.overrides->>'description', g.description),
            'event_candidates', case when c.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id', c.id, 'source', c.source)) end,
            'weekly_batch_items', case when t.shared_key like 'weekly:%' then jsonb_build_object('definition_key', split_part(t.shared_key, ':', 3)) else null end)
        order by pt.is_favorite desc, pt.expiration_date nulls last, t.id)
        from public.tasks t join public.profile_tasks pt on pt.task_id = t.id
        join public.games g on g.id = t.game_id
        join public.profile_games pg on pg.game_id = t.game_id and pg.profile_id = pt.profile_id and pg.enabled
        left join public.event_candidates c on c.task_id = t.id or exists (
            select 1 from public.profile_event_decisions d where d.candidate_id = c.id and d.task_id = t.id and d.profile_id = pt.profile_id)
        left join public.profile_event_decisions d on d.candidate_id = c.id and d.profile_id = pt.profile_id
        where pt.profile_id = p_profile_id and not pt.deleted and coalesce(d.status, '') <> 'ignored'
            and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id)), '[]');
end $$;

create function public.set_profile_task_favorite(p_profile_id text, p_task_id bigint, p_is_favorite boolean) returns void
language plpgsql security invoker set search_path = public as $$ begin
    perform public.require_profile(p_profile_id);
    if p_is_favorite is null then raise exception 'Informe o estado da favorita.'; end if;
    -- Update only existing personal state; a favorite must never materialize or restore a task.
    update public.profile_tasks pt set is_favorite = p_is_favorite
        from public.tasks t join public.profile_games pg on pg.game_id = t.game_id
        where pt.task_id = t.id and pt.profile_id = p_profile_id and t.id = p_task_id
            and pg.profile_id = p_profile_id and pg.enabled and not pt.deleted
            and (t.owner_profile_id is null or t.owner_profile_id = p_profile_id);
    if not found then raise exception 'Tarefa não encontrada nos jogos selecionados deste perfil.'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
