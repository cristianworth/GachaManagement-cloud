import { EVENT_GAMES } from '../js/events/eventGames.js';

// Synthetic, clearly labelled scenarios for the disposable local preview only.
export async function seedPreviewEventFixtures(db) {
    const games = (await db.query('select id, abbreviation from public.games')).rows;
    for (const profile of ['cran', 'demo', 'guest']) {
        await db.query('select public.set_profile_games($1, $2::bigint[], false)', [profile, games.map(game => game.id)]);
    }
    for (const source of EVENT_GAMES) {
        const game = games.find(game => game.abbreviation === source.abbreviation);
        for (const edition of ['old', 'next']) {
            const start = edition === 'old' ? '2025-01-01T09:00:00Z' : '2099-01-01T09:00:00Z';
            await db.query(`insert into public.event_candidates
                (source, external_id, name, game_id, source_start_at, source_end_at, proposed_start_at, proposed_end_at)
                values ($1,$2,$3,$4,$5,'2099-01-20T09:00:00Z',$5,'2099-01-20T09:00:00Z')`,
                [source.source, `preview-${edition}`, `[TESTE] ${game.abbreviation}: edição ${edition === 'old' ? 'anterior' : 'seguinte'}`, game.id, start]);
        }
        await db.query('select public.import_event_candidates($1)', [source.source]);
        const candidate = (await db.query(`select task_id from public.event_candidates where source=$1 and external_id='preview-old'`, [source.source])).rows[0];
        await db.query(`update public.tasks set expiration_date='2025-01-20T09:00:00Z' where id=$1`, [candidate.task_id]);
        await db.query(`update public.profile_tasks set expiration_date='2099-02-01T09:00:00Z', event_deadline_manual=true, is_done=true
            where profile_id='demo' and task_id=$1`, [candidate.task_id]);
        await db.query(`update public.profile_tasks set refresh_type=2, repeat_days=7 where profile_id='guest' and task_id=$1`, [candidate.task_id]);
    }
}
