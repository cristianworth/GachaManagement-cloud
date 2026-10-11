import { EVENT_GAMES } from '../js/events/eventGames.js';

// All writes target the disposable preview database provided by the caller.
export async function seedDesignPreview(db) {
    const games = (await db.query('select * from public.games order by id')).rows;
    const now = Date.now();
    for (const profile of ['cran', 'demo', 'guest']) {
        await db.query('select public.set_profile_games($1, $2::bigint[], false)', [profile, games.map(game => game.id)]);
        for (const [index, game] of games.entries()) {
            const stamina = [148, 180, 96, 120, 240][index];
            const notes = ['• Comissões diárias\n• Explorar a nova região', '• Treino diário\n• Universo Simulado', '• Atividades diárias\n• Materiais de ascensão', '• Fazer os encargos\n• Gastar bateria', '• Explorar a cidade'][index];
            const payload = {
                ...game, current_stamina: stamina, pending_tasks: notes,
                max_stamina_at: 'Preview forecast',
                date_max_stamina: new Date(now + (Number(game.cap_stamina) - stamina) * Number(game.stamina_per_minute) * 60000).toISOString(),
            };
            await db.query('select public.save_profile_game($1,$2::jsonb,$3)', [profile, JSON.stringify(payload), game.id]);
        }
        const definitions = [
            ['Comissões diárias', 0, 1, 1], ['Explorar a nova região', 0, 0, null],
            ['Universo Simulado', 1, 2, 7], ['Treino diário', 1, 1, 1],
            ['Atividades diárias', 2, 1, 1], ['Materiais de ascensão', 2, 0, null],
            ['Defesa Shiyu', 3, 3, 14], ['Explorar a cidade', 4, 0, null],
        ];
        for (const [index, [description, gameIndex, refresh, days]] of definitions.entries()) {
            const game = games[gameIndex];
            const task = {
                description, game_id: game.id, game_description: game.description,
                expiration_date: index === 1 ? null : new Date(now + (index + 1) * 86400000).toISOString(),
                is_done: index === 3, refresh_type: refresh, repeat_days: days,
            };
            const saved = (await db.query('select public.save_profile_task($1,$2::jsonb) as task', [profile, JSON.stringify(task)])).rows[0].task;
            if (index === 2) await db.query('select public.set_profile_task_favorite($1,$2,true)', [profile, saved.id]);
        }
    }
    for (const source of EVENT_GAMES) {
        const game = games.find(game => game.abbreviation === source.abbreviation);
        await db.query(`insert into public.event_candidates
            (source, external_id, name, game_id, source_start_at, source_end_at, proposed_start_at, proposed_end_at, review_reason)
            values ($1,$2,$3,$4,$5,$6,$5,$6,$7)`, [
            source.source, `design-preview-${source.key}`, `[PRÉVIA] Evento de ${game.description}`, game.id,
            new Date(now - 86400000).toISOString(), new Date(now + 12 * 86400000).toISOString(),
            'Dados fictícios para experimentar a revisão de eventos; não representam o calendário do jogo.',
        ]);
    }
}
