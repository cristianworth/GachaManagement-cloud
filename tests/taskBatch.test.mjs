import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/testDatabase.mjs';
import { WEEKLY_BATCHES } from '../js/data/weeklyTasks.js';

const clock = '2026-10-08T12:00:00Z';
const anchor = '2026-10-21T10:00:00Z';
const rpc = async (db, name, args = []) => (await db.query(
    `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const batch = (db, profile = 'cran', date = null, now = clock) => rpc(db, 'create_profile_task_batch', [profile, date, now]);
const tasks = (db, profile = 'cran') => rpc(db, 'list_profile_tasks', [profile]);
const select = (db, profile, ids) => rpc(db, 'set_profile_games', [profile, ids, false]);
async function snapshot(db) {
    const result = {};
    for (const table of ['tasks', 'profile_tasks', 'profile_weekly_batches', 'profile_endgame_batches', 'profile_task_batch_items', 'profile_event_decisions']) {
        result[table] = (await db.query(`select to_jsonb(t) as data from ${table} t order by to_jsonb(t)::text`)).rows;
    }
    return result;
}

for (const migrated of [false, true]) test(`Unified task batch as anon: ${migrated ? 'upgrade' : 'fresh schema'}`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query("select id,abbreviation from games where abbreviation in ('GI','HSR','ZZZ','WuWa','NTE')")).rows;
    const id = abbreviation => games.find(g => g.abbreviation === abbreviation).id;
    const all = games.map(g => g.id);
    await select(db, 'cran', all);
    await select(db, 'demo', all);
    const scenario = (name, run) => t.test(name, async () => {
        await db.exec('begin');
        try { await run(); } finally { await db.exec('rollback'); }
    });

    await scenario('Public catalogue matches eight weekly definitions and eight challenges; HSR reserves stay inactive', async () => {
        const catalogue = await rpc(db, 'task_batch_catalogue');
        assert.equal(catalogue.length, 16);
        assert.deepEqual(catalogue.filter(d => d.kind === 'weekly').map(d => [d.abbreviation, d.definition_key, d.description, d.refresh_type, d.repeat_days]).sort(),
            WEEKLY_BATCHES.flatMap(b => b.definitions.map(d => [b.abbreviation, d.key, d.description, 2, 7])).sort());
        assert.deepEqual(catalogue.filter(d => d.kind === 'endgame').map(d => [d.description, d.refresh_type, d.repeat_days, d.month_day]).sort(), [
            ['Beyond the Rails', 3, 14, null], ['Deadly Assault', 3, 14, null], ['Endstate Matrix', 0, null, null],
            ['Imaginarium Theater', 9, null, 1], ['Shiyu Defense', 3, 14, null], ['Spiral Abyss', 10, null, 15],
            ['Tower of Adversity', 5, 28, null], ['Whimpering Wastes', 5, 28, null],
        ]);
    });

    for (const [now, expected] of [
        ['2026-10-08T12:00:00Z', '2026-10-21T10:00:00.000Z'],
        ['2026-10-21T09:59:59.999Z', '2026-10-21T10:00:00.000Z'],
        ['2026-10-21T10:00:00Z', '2026-11-04T10:00:00.000Z'],
        ['2026-11-04T10:00:00Z', '2026-11-18T10:00:00.000Z'],
        ['2026-12-31T20:00:00Z', '2027-01-13T10:00:00.000Z'],
    ]) await scenario(`Automatic NTE deadline at ${now} skips expired cycles in fixed UTC`, async () => {
        await db.exec("set local timezone='Pacific/Auckland'");
        assert.equal((await batch(db, 'cran', null, now)).created, now < '2026-11-10T20:00:00Z' ? 16 : 15);
        const row = (await tasks(db)).find(t => t.description === 'Beyond the Rails');
        assert.equal(new Date(row.expiration_date).toISOString(), expected);
        assert.equal(row.repeat_days, 14);
    });

    for (const now of [null, 'infinity']) await scenario(`Invalid clock ${now} rejects without writes`, async () => {
        const before = await snapshot(db);
        await db.exec('savepoint rejected');
        await assert.rejects(batch(db, 'cran', null, now), /Relógio inválido/);
        await db.exec('rollback to savepoint rejected');
        assert.deepEqual(await snapshot(db), before);
    });

    await scenario('One call creates sixteen tasks, then repeats without mutations or inherited progress', async () => {
        assert.deepEqual(await batch(db), { status: 'created', created: 16, preserved: 0, registered: 12 });
        const rows = (await tasks(db)).filter(t => /^(weekly|endgame):/.test(t.shared_key));
        assert.equal(rows.length, 16);
        assert.deepEqual(rows.map(t => t.description).sort(), [
            'Beyond the Rails', 'Deadly Assault', 'Echo of War', 'Endstate Matrix', 'Fantasies of the Thousand Gateways', 'Hollow Zero',
            'Imaginarium Theater', 'Notorious Hunt', 'Shiyu Defense', 'Simulated Universe', 'Spiral Abyss', 'Tower of Adversity', 'Weekly Boss', 'Weekly Boss', 'Weekly Boss', 'Whimpering Wastes',
        ]);
        assert.deepEqual(rows.filter(t => t.shared_key.startsWith('endgame:')).map(t => [t.description, t.refresh_type, t.repeat_days, new Date(t.expiration_date).toISOString()]).sort(), [
            ['Beyond the Rails', 3, 14, '2026-10-21T10:00:00.000Z'],
            ['Deadly Assault', 3, 14, '2026-10-09T09:00:00.000Z'],
            ['Endstate Matrix', 0, null, '2026-11-10T20:00:00.000Z'],
            ['Imaginarium Theater', 9, null, '2026-11-01T09:00:00.000Z'],
            ['Shiyu Defense', 3, 14, '2026-10-16T09:00:00.000Z'],
            ['Spiral Abyss', 10, null, '2026-10-15T09:00:00.000Z'],
            ['Tower of Adversity', 5, 28, '2026-10-12T09:00:00.000Z'],
            ['Whimpering Wastes', 5, 28, '2026-10-26T09:00:00.000Z'],
        ]);
        const before = await snapshot(db);
        assert.deepEqual(await batch(db, 'cran', null), { status: 'created', created: 0, preserved: 0, registered: 0 });
        assert.deepEqual(await snapshot(db), before);
        assert.ok(!(await tasks(db, 'demo')).some(t => /^(weekly|endgame):/.test(t.shared_key)));
        await rpc(db, 'complete_profile_task', ['cran', rows[0].id, true]);
        await rpc(db, 'set_profile_task_favorite', ['cran', rows[0].id, true]);
        const cran = await tasks(db);
        assert.equal((await batch(db, 'demo', '2026-10-22T10:00:00Z')).created, 16);
        const demo = (await tasks(db, 'demo')).filter(t => /^(weekly|endgame):/.test(t.shared_key));
        assert.deepEqual(demo.map(t => t.id).sort(), rows.map(t => t.id).sort());
        assert.ok(demo.every(t => !t.is_done && !t.is_favorite));
        assert.deepEqual(await tasks(db), cran);
    });

    await scenario('Homonyms of any recurrence preserve covers, favorites, dates and completion without requiring an NTE anchor', async () => {
        const originals = [];
        for (const [description, abbreviation] of [['Beyond the Rails', 'NTE'], ['Hollow Zero', 'ZZZ']]) {
            const row = await rpc(db, 'save_profile_task', ['cran', JSON.stringify({
                description, game_id: id(abbreviation), game_description: abbreviation, refresh_type: 0,
                expiration_date: '2099-02-02T14:30:00Z', is_done: true, cover_url: 'https://example.com/custom.jpg',
            })]);
            await rpc(db, 'set_profile_task_favorite', ['cran', row.id, true]);
            originals.push((await tasks(db)).find(t => t.id === row.id));
        }
        assert.deepEqual(await batch(db, 'cran', null), { status: 'created', created: 14, preserved: 2, registered: 12 });
        for (const before of originals) assert.deepEqual((await tasks(db)).find(t => t.id === before.id), before);
    });

    await scenario('Old closed weekly and challenge markers protect deletions and renames across unification', async () => {
        const definitions = WEEKLY_BATCHES.find(b => b.abbreviation === 'ZZZ').definitions;
        await rpc(db, 'create_profile_weekly_batch', ['cran', 'ZZZ', id('ZZZ'), JSON.stringify(definitions), true, clock]);
        await rpc(db, 'create_profile_endgame_batch', ['cran', anchor, clock]);
        const old = await tasks(db);
        const removed = old.find(t => t.description === 'Hollow Zero');
        await rpc(db, 'remove_profile_task', ['cran', removed.id]);
        const theater = old.find(t => t.description === 'Imaginarium Theater');
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...theater, description: 'My Theater', expiration_date: '2099-11-01T09:00:00Z' }), theater.id]);
        const before = (await tasks(db)).find(t => t.id === theater.id);
        assert.deepEqual(await batch(db, 'cran', null), { status: 'created', created: 11, preserved: 0, registered: 9 });
        assert.ok(!(await tasks(db)).some(t => t.id === removed.id));
        assert.deepEqual((await tasks(db)).find(t => t.id === theater.id), before);
    });

    await scenario('Disabled games stay out; enabling a game later creates only its unregistered activities', async () => {
        await select(db, 'cran', [id('GI'), id('HSR')]);
        assert.deepEqual(await batch(db, 'cran', null), { status: 'created', created: 5, preserved: 0, registered: 3 });
        await select(db, 'cran', [id('HSR'), id('NTE')]);
        assert.deepEqual(await batch(db), { status: 'created', created: 2, preserved: 0, registered: 2 });
        await select(db, 'cran', all);
        assert.deepEqual(await batch(db, 'cran', null), { status: 'created', created: 9, preserved: 0, registered: 7 });
        assert.equal((await tasks(db)).filter(t => /^(weekly|endgame):/.test(t.shared_key)).length, 16);
    });

    await scenario('No games, invalid profile and duplicate enabled abbreviations reject without writes', async () => {
        const before = await snapshot(db);
        await db.exec('savepoint rejected');
        await assert.rejects(batch(db, 'guest'), /Selecione um jogo/);
        await db.exec('rollback to savepoint rejected');
        await assert.rejects(batch(db, 'missing'), /Perfil inválido/);
        await db.exec('rollback to savepoint rejected');
        const duplicate = (await db.query("insert into games(description,abbreviation) values ('Duplicate HSR','HSR') returning id")).rows[0].id;
        await db.query("insert into profile_games(profile_id,game_id) values ('cran',$1)", [duplicate]);
        await db.exec('savepoint ambiguous');
        await assert.rejects(batch(db), /ambígua/);
        await db.exec('rollback to savepoint ambiguous');
        assert.deepEqual(await snapshot(db), before);
    });

    await scenario('Late NTE failure rolls back all weekly and GI writes before a successful retry', async () => {
        await db.exec(`reset role;
            create function fail_unified_batch() returns trigger language plpgsql as $$ begin
                if new.description = 'Beyond the Rails' then raise exception 'Injected NTE failure'; end if; return new; end; $$;
            create trigger fail_unified_batch before insert on tasks for each row execute function fail_unified_batch();
            set local role anon; savepoint rejected;`);
        const before = await snapshot(db);
        await assert.rejects(batch(db), /Injected NTE failure/);
        await db.exec('rollback to savepoint rejected');
        assert.deepEqual(await snapshot(db), before);
        await db.exec('reset role; drop trigger fail_unified_batch on tasks; set local role anon');
        assert.equal((await batch(db)).created, 16);
        assert.equal((await batch(db, 'cran', null)).created, 0);
    });
});
