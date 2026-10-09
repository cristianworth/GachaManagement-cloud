import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, migrations, readProjectFile } from './helpers/testDatabase.mjs';

const clock = '2026-10-08T12:00:00Z';
const rpc = async (db, name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const batch = (db, profile = 'cran', now = clock) => rpc(db, 'create_profile_task_batch', [profile, null, now]);
const list = db => rpc(db, 'list_profile_tasks', ['cran']);

for (const migrated of [false, true]) test(`Extra challenge decisions: ${migrated ? 'upgrade' : 'fresh'}`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query("select id,abbreviation from games")).rows;
    await rpc(db, 'set_profile_games', ['cran', games.map(g => g.id), false]);
    const scenario = (name, run) => t.test(name, async () => {
        await db.exec('begin');
        try { await run(); } finally { await db.exec('rollback'); }
    });

    await scenario('New definition markers protect deleted and renamed tasks and all personal fields', async () => {
        await batch(db);
        const rows = await list(db);
        const removed = rows.find(r => r.description === 'Deadly Assault');
        const modified = rows.find(r => r.description === 'Tower of Adversity');
        await rpc(db, 'remove_profile_task', ['cran', removed.id]);
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...modified, description: 'My Tower',
            expiration_date: '2099-02-02T14:30:00Z', refresh_type: 8, repeat_days: 19,
            is_done: true, cover_url: 'https://example.com/tower.jpg' }), modified.id]);
        await rpc(db, 'set_profile_task_favorite', ['cran', modified.id, true]);
        const before = await list(db);
        assert.equal((await batch(db)).created, 0);
        assert.deepEqual(await list(db), before);
        assert.ok(!(await list(db)).some(r => r.id === removed.id));
        assert.equal((await db.query("select count(*)::int as count from profile_task_batch_items where profile_id='cran'")).rows[0].count, 5);
    });

    await scenario('A custom homonym is preserved once without changing its recurrence or assuming seed origin', async () => {
        const game = games.find(g => g.abbreviation === 'WuWa');
        const saved = await rpc(db, 'save_profile_task', ['cran', JSON.stringify({
            description: 'Whimpering Wastes', game_id: game.id, game_description: game.description,
            refresh_type: 8, repeat_days: 19, expiration_date: '2099-02-02T14:30:00Z',
            is_done: true, cover_url: 'https://example.com/custom.jpg',
        })]);
        const original = (await list(db)).find(r => r.id === saved.id);
        const result = await batch(db);
        assert.equal(result.created, 13);
        assert.equal(result.preserved, 1);
        assert.deepEqual((await list(db)).find(r => r.id === saved.id), original);
        await rpc(db, 'remove_profile_task', ['cran', saved.id]);
        assert.equal((await batch(db)).created, 0);
        assert.ok(!(await list(db)).some(r => r.description === 'Whimpering Wastes'));
    });

    await scenario('Late Shiyu failure rolls back earlier new modes, legacy tasks and all markers', async () => {
        await db.exec(`reset role;
            create function fail_expanded_batch() returns trigger language plpgsql as $$ begin
                if new.description = 'Shiyu Defense' then raise exception 'Injected Shiyu failure'; end if; return new; end; $$;
            create trigger fail_expanded_batch before insert on tasks for each row execute function fail_expanded_batch();
            set local role anon; savepoint rejected;`);
        const before = await list(db);
        const markers = {};
        for (const table of ['profile_task_batch_items', 'profile_weekly_batches', 'profile_endgame_batches'])
            markers[table] = (await db.query(`select to_jsonb(t) as row from ${table} t where profile_id='cran' order by to_jsonb(t)::text`)).rows;
        await assert.rejects(batch(db), /Injected Shiyu/);
        await db.exec('rollback to savepoint rejected');
        assert.deepEqual(await list(db), before);
        for (const table of ['profile_task_batch_items', 'profile_weekly_batches', 'profile_endgame_batches'])
            assert.deepEqual((await db.query(`select to_jsonb(t) as row from ${table} t where profile_id='cran' order by to_jsonb(t)::text`)).rows, markers[table]);
        await db.exec('reset role; drop trigger fail_expanded_batch on tasks; set local role anon');
        assert.equal((await batch(db)).created, 14);
    });

    await scenario('Expired Endstate phase is not imported or extrapolated; other cycles still load', async () => {
        const result = await batch(db, 'cran', '2026-11-10T20:00:00Z');
        assert.equal(result.created, 13);
        assert.equal(result.deferred, 1);
        assert.ok(!(await list(db)).some(r => r.description === 'Endstate Matrix'));
        assert.equal((await db.query("select count(*)::int as count from profile_task_batch_items where definition_key='endstate-matrix'")).rows[0].count, 0);
        const repeat = await batch(db, 'cran', '2026-12-31T20:00:00Z');
        assert.equal(repeat.created, 0);
        assert.equal(repeat.deferred, 1);
    });

    await scenario('Four fixed cycles skip missed resets, retain UTC through DST, and advance at the exact boundary', async () => {
        await db.exec("set local timezone='America/New_York'");
        for (const [anchor, days, now, expected] of [
            ['2026-10-09T09:00:00Z', 14, '2026-10-09T08:59:59.999Z', '2026-10-09T09:00:00.000Z'],
            ['2026-10-09T09:00:00Z', 14, '2026-10-09T09:00:00Z', '2026-10-23T09:00:00.000Z'],
            ['2026-10-16T09:00:00Z', 14, '2026-11-01T12:00:00Z', '2026-11-13T09:00:00.000Z'],
            ['2026-10-12T09:00:00Z', 28, '2026-12-31T12:00:00Z', '2027-01-04T09:00:00.000Z'],
            ['2026-10-26T09:00:00Z', 28, '2026-12-31T12:00:00Z', '2027-01-18T09:00:00.000Z'],
        ]) assert.equal(new Date(await rpc(db, 'next_anchored_batch_deadline', [anchor, days, now])).toISOString(), expected);
        for (const args of [[null, 14, clock], [clock, 0, clock], [clock, 14, null]]) {
            await db.exec('savepoint rejected');
            await assert.rejects(rpc(db, 'next_anchored_batch_deadline', args), /Calendário inválido/);
            await db.exec('rollback to savepoint rejected');
        }
    });

    await scenario('Explicit reset clears per-definition decisions and allows all fourteen tasks after reseeding', async () => {
        await batch(db);
        await rpc(db, 'reset_application_data');
        assert.equal((await db.query('select count(*)::int as count from profile_task_batch_items')).rows[0].count, 0);
        await db.exec(await readProjectFile('db/seed.sql'));
        const ids = (await db.query('select id from games')).rows.map(g => g.id);
        await rpc(db, 'set_profile_games', ['cran', ids, false]);
        assert.equal((await batch(db)).created, 14);
    });
});

test('Expansion migration preserves an existing closed nine-item batch until the explicit click', async t => {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(`create role anon; create role authenticated; create role service_role;
        grant usage on schema public to anon;
        alter default privileges in schema public grant select, insert, update, delete on tables to anon;
        alter default privileges in schema public grant usage, select on sequences to anon;`);
    await db.exec(await readProjectFile('tests/fixtures/pre-events-schema.sql'));
    await db.exec(await readProjectFile('db/seed.sql'));
    for (const file of migrations.filter(f => !f.includes('expanded-task-batch')))
        await db.exec(await readProjectFile(`db/migrations/${file}`));
    await db.exec('set role anon');
    const games = (await db.query('select id,abbreviation from games')).rows;
    await rpc(db, 'set_profile_games', ['cran', games.map(g => g.id), false]);
    assert.equal((await batch(db)).created, 9);
    const old = await list(db);
    await rpc(db, 'remove_profile_task', ['cran', old.find(r => r.description === 'Hollow Zero').id]);
    const before = await list(db);
    await db.exec('reset role');
    await db.exec(await readProjectFile('db/migrations/2026-10-08-expanded-task-batch.sql'));
    await db.exec('set role anon');
    assert.deepEqual(await list(db), before, 'Migration only registers schema, never imports tasks');
    assert.deepEqual(await batch(db), { status: 'created', created: 5, preserved: 0, registered: 5 });
    const after = await list(db);
    for (const task of before) assert.deepEqual(after.find(r => r.id === task.id), task);
    assert.ok(!after.some(r => r.description === 'Hollow Zero'));
    assert.equal((await batch(db)).created, 0);
});
