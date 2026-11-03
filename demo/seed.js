import { seedDesignPreview } from '../scripts/seedDesignPreview.js';
import { createGameDailyState } from '../js/utils/gameDailyState.js';
import { BANNER_GAMES } from '../js/utils/bannerCatalogue.js';

export function createDemoAgenda(now) {
    const at = hours => new Date(now + hours * 3600_000).toISOString();
    return BANNER_GAMES.flatMap((game, index) => [1, 2].map(phase => ({
        id: `${game.abbreviation.toLowerCase()}-demo-phase-${phase}`,
        abbreviation: game.abbreviation, game_name: game.name, kind: 'banner', version: 'Demo', phase,
        title: `Exemplo fictício — ${phase === 1 ? 'Primeira' : 'Segunda'} fase`,
        starts_at: at(phase === 1 ? -72 : 24 + index * 6),
        ends_at: at(phase === 1 ? 18 + index * 2 : 192 + index * 6),
        timing_note: 'Calendário fictício da demonstração. Não representa banners ou datas atuais do jogo.',
        characters: [{ name: phase === 1 ? 'Personagem de exemplo A' : 'Personagem de exemplo B' }],
        members: [{ title: phase === 1 ? 'Personagem de exemplo A' : 'Personagem de exemplo B', image_url: '' }],
        // No external sources: these entries are deliberately fictional.
        sources: [],
    })));
}

export async function seedDemo(db, now = Date.now()) {
    await seedDesignPreview(db, { now, includeExpiredFavorite:false, includeSyntheticEvents:false });
    await db.exec(`update public.profiles set name = case id
        when 'cran' then 'Minha demo' when 'demo' then 'Outro exemplo' else 'Perfil livre' end;
        insert into public.profile_weekly_batches (profile_id, abbreviation, status)
        select p.id, g.abbreviation, 'skipped' from public.profiles p cross join public.games g
        on conflict (profile_id, abbreviation) do nothing;`);
    const games = (await db.query('select id, abbreviation from public.games order by id')).rows;
    for (const profile of ['cran', 'demo', 'guest']) {
        const tasks = (await db.query('select public.list_profile_tasks($1) as tasks',[profile])).rows[0].tasks;
        for (const task of tasks) {
            if (task.refresh_type === 0) await db.query('select public.save_profile_task($1,$2::jsonb,$3)',
                [profile,JSON.stringify({...task,expiration_date:null,start_at:null}),task.id]);
        }
        for (const [index, game] of games.entries()) {
            const state = ['pending', 'return_later', 'done', 'pending', 'done'][index];
            await db.query('select public.save_profile_game($1, $2::jsonb, $3)', [profile,
                JSON.stringify({ abbreviation: game.abbreviation, daily_state: createGameDailyState(game.abbreviation, state, now) }), game.id]);
        }
    }
    await db.query('insert into public.demo_metadata (id, seeded_at, agenda) values (1, $1, $2::jsonb)',
        [new Date(now).toISOString(), JSON.stringify(createDemoAgenda(now))]);
}
