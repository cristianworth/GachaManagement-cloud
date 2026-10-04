import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createTestDatabase, readProjectFile, migrations } from './helpers/testDatabase.mjs';
import { EVENT_GAMES, EVENT_GAME_CATALOG } from '../js/events/eventGames.js';

test('The upgrade path includes every versioned SQL migration', () => {
    const files = readdirSync(new URL('../db/migrations/', import.meta.url)).filter(file => file.endsWith('.sql'));
    assert.deepEqual([...migrations].sort(), files.sort(), 'Add new migrations to the explicit dependency order in testDatabase.mjs');
});

async function snapshot(db) {
    return (await db.query(`select jsonb_build_object(
        'games', (select coalesce(jsonb_agg(g order by id), '[]') from public.games g),
        'tasks', (select coalesce(jsonb_agg(t order by id), '[]') from public.tasks t),
        'candidates', (select coalesce(jsonb_agg(c order by id), '[]') from public.event_candidates c)
    ) as data`)).rows[0].data;
}

for (const migrated of [false, true]) test(`${migrated ? 'Upgraded' : 'Fresh'} database protects import and recurrence contracts`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    if (migrated) {
        const row = (await db.query("select * from public.tasks where description = 'Existing weekly'")).rows[0];
        assert.equal(row.repeat_days, 7);
        assert.equal(row.is_done, true);
        assert.equal(row.expiration_date.toISOString(), '2025-01-06T09:00:00.000Z');
    }
    for (const file of ['hsrEvents.sql', 'autoEvents.sql', 'zzzEvents.sql', 'taskRepeatDays.sql', 'wuwaEvents.sql']) {
        await t.test(file, async () => {
            const before = await snapshot(db);
            await db.exec(await readProjectFile(`tests/${file}`));
            assert.deepEqual(await snapshot(db), before, `${file} must roll back all rows`);
        });
    }
    await t.test('Registry sources match SQL imports and reject cross-game candidates', async () => {
        await db.exec('begin; set local role anon;');
        try {
            for (const game of EVENT_GAMES) {
                const { rows } = await db.query(`insert into public.event_candidates
                    (source, external_id, name, game_id, proposed_end_at)
                    select $1, $2, 'Registry contract', id, now() + interval '20 days'
                    from public.games where abbreviation = $3 returning id`, [game.source, `contract-${game.key}`, game.abbreviation]);
                assert.equal(rows.length, 1);
                const result = await db.query('select public.import_event_candidates($1) as counts', [game.source]);
                assert.deepEqual(result.rows[0].counts, { imported: 1 });
                const linked = await db.query(`select g.abbreviation, t.refresh_type from public.event_candidates c
                    join public.tasks t on t.id = c.task_id join public.games g on g.id = t.game_id where c.id = $1`, [rows[0].id]);
                assert.equal(linked.rows[0].abbreviation, game.abbreviation);
                assert.equal(linked.rows[0].refresh_type, 0);
                await db.exec('savepoint invalid_game');
                await db.query(`update public.event_candidates set game_id =
                    (select id from public.games where abbreviation <> $1 order by id limit 1) where id = $2`, [game.abbreviation, rows[0].id]);
                await assert.rejects(db.query('select public.sync_event_candidate($1)', [rows[0].id]), /não corresponde/);
                await db.exec('rollback to savepoint invalid_game');
            }
            for (const game of EVENT_GAME_CATALOG.filter(game => game.status === 'planned')) {
                await db.query(`insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
                    select $1, 'planned', 'Not enabled', id, now() + interval '20 days'
                    from public.games where abbreviation = $2`, [game.source, game.abbreviation]);
                const result = await db.query('select public.import_event_candidates($1) as counts', [game.source]);
                assert.deepEqual(result.rows[0].counts, {});
            }
        } finally {
            await db.exec('rollback');
        }
    });
    await t.test('Repeat-days migration is safe to rerun', async () => {
        const before = await snapshot(db);
        await db.exec(await readProjectFile('db/migrations/2026-10-03-task-repeat-days.sql'));
        assert.deepEqual(await snapshot(db), before);
    });
    await t.test('WuWa migration preserves linked completion and manual edits when rerun', async () => {
        await db.exec(`insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
            select 'starrailassistant-wuwa', 'migration-preservation', 'Preserved edition', id, now() + interval '20 days'
            from public.games where abbreviation = 'WuWa';
            select public.import_event_candidates('starrailassistant-wuwa');
            update public.tasks set is_done = true, expiration_date = expiration_date + interval '1 day'
            where id in (select task_id from public.event_candidates where external_id = 'migration-preservation');`);
        const before = await snapshot(db);
        await db.exec(await readProjectFile('db/migrations/2026-10-03-wuwa-events.sql'));
        // Reapply later function definitions in delivery order; an older migration replaces them.
        await db.exec(await readProjectFile('db/migrations/2026-10-04-nte-events.sql'));
        assert.deepEqual(await snapshot(db), before);
    });
    await t.test('NTE migration is safe to rerun with completed and ignored editions', async () => {
        await db.exec(`insert into public.event_candidates (source, external_id, name, game_id, proposed_end_at)
            select 'starrailassistant-nte', 'nte-migration-preservation', 'NTE preserved edition', id, now() + interval '20 days'
            from public.games where abbreviation='NTE';
            select public.import_event_candidates('starrailassistant-nte');
            update public.tasks set is_done=true, expiration_date=expiration_date + interval '1 day'
            where id in (select task_id from public.event_candidates where external_id='nte-migration-preservation');
            insert into public.event_candidates (source, external_id, name, game_id, status)
            select 'starrailassistant-nte', 'nte-ignored-migration', 'NTE ignored edition', id, 'ignored'
            from public.games where abbreviation='NTE';`);
        const before = await snapshot(db);
        await db.exec(await readProjectFile('db/migrations/2026-10-04-nte-events.sql'));
        assert.deepEqual(await snapshot(db), before);
    });
});
