import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, readProjectFile } from './helpers/testDatabase.mjs';

const clock = '2026-10-08T12:00:00Z';
const anchor = '2026-10-21T10:00:00Z';
const rpc = async (db, name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const batch = (db, profile = 'cran', date = null, now = clock) => rpc(db, 'create_profile_endgame_batch', [profile, date, now]);
const tasks = (db, profile = 'cran') => rpc(db, 'list_profile_tasks', [profile]);
const select = (db, profile, ids) => rpc(db, 'set_profile_games', [profile, ids, false]);
async function snapshot(db) {
    const result = {};
    for (const table of ['tasks', 'profile_tasks', 'profile_endgame_batches', 'profile_weekly_batches', 'profile_event_decisions']) {
        result[table] = (await db.query(`select to_jsonb(t) as data from ${table} t order by to_jsonb(t)::text`)).rows;
    }
    return result;
}

for (const migrated of [false, true]) test(`Endgame batch as anon: ${migrated ? 'upgrade' : 'fresh schema'}`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query("select id,abbreviation from games where abbreviation in ('GI','NTE')")).rows;
    const gi = games.find(g => g.abbreviation === 'GI').id;
    const nte = games.find(g => g.abbreviation === 'NTE').id;
    await select(db, 'cran', [gi, nte]);
    await select(db, 'demo', [gi, nte]);
    const scenario = (name, run) => t.test(name, async () => {
        await db.exec('begin');
        try { await run(); } finally { await db.exec('rollback'); }
    });

    await scenario('One explicit batch creates all three with separate monthly and 14-day cycles', async () => {
        const before = await snapshot(db);
        await rpc(db, 'materialize_profile_tasks', ['cran']);
        assert.deepEqual(await snapshot(db), before, 'Reading/materializing events must not create endgame tasks');
        assert.deepEqual(await batch(db), { created: 3, preserved: 0, registered: 2 });
        const rows = (await tasks(db)).filter(t => t.shared_key?.startsWith('endgame:'));
        assert.deepEqual(rows.map(t => [t.description, t.refresh_type, t.repeat_days, new Date(t.expiration_date).toISOString()]).sort(), [
            ['Beyond the Rails', 3, 14, '2026-10-21T10:00:00.000Z'],
            ['Imaginarium Theater', 9, null, '2026-11-01T09:00:00.000Z'],
            ['Spiral Abyss', 10, null, '2026-10-15T09:00:00.000Z'],
        ]);
        assert.ok(rows.every(t => !t.is_done && !t.is_favorite && t.event_candidates.length === 0));
        assert.deepEqual((await snapshot(db)).profile_weekly_batches, before.profile_weekly_batches);
        const saved = await snapshot(db);
        assert.deepEqual(await batch(db, 'cran', null), { created: 0, preserved: 0, registered: 0 });
        assert.deepEqual(await snapshot(db), saved);
        assert.ok(!(await tasks(db, 'demo')).some(t => t.shared_key?.startsWith('endgame:')));
    });

    await scenario('Existing homonyms keep recurrence, covers, completion, favorites and deadlines', async () => {
        const existing = await rpc(db, 'save_profile_task', ['cran', JSON.stringify({
            description: 'Beyond the Rails', game_id: nte, game_description: 'NTE', refresh_type: 0,
            repeat_days: null, expiration_date: '2099-02-02T14:30:00Z', is_done: true, cover_url: 'https://example.com/custom.jpg',
        })]);
        await rpc(db, 'set_profile_task_favorite', ['cran', existing.id, true]);
        const before = (await tasks(db)).find(t => t.id === existing.id);
        assert.deepEqual(await batch(db, 'cran', null), { created: 2, preserved: 1, registered: 2 });
        assert.deepEqual((await tasks(db)).find(t => t.id === existing.id), before);
    });

    await scenario('Deleting and renaming registered tasks never restores them; selecting NTE later works', async () => {
        await select(db, 'cran', [gi]);
        assert.deepEqual(await batch(db, 'cran', null), { created: 2, preserved: 0, registered: 1 });
        const row = (await tasks(db)).find(t => t.description === 'Spiral Abyss');
        await rpc(db, 'remove_profile_task', ['cran', row.id]);
        await select(db, 'cran', [gi, nte]);
        assert.deepEqual(await batch(db), { created: 1, preserved: 0, registered: 1 });
        assert.ok(!(await tasks(db)).some(t => t.id === row.id));
        const theater = (await tasks(db)).find(t => t.description === 'Imaginarium Theater');
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...theater, description: 'My Theater', expiration_date: '2099-11-01T09:00:00Z' }), theater.id]);
        const before = await snapshot(db);
        await batch(db);
        assert.deepEqual(await snapshot(db), before);
    });

    await scenario('Another profile gets its own anchor and progress while retaining the shared identities', async () => {
        await batch(db);
        const cran = (await tasks(db)).filter(t => t.shared_key?.startsWith('endgame:'));
        await rpc(db, 'complete_profile_task', ['cran', cran[0].id, true]);
        await rpc(db, 'set_profile_task_favorite', ['cran', cran[0].id, true]);
        const cranBefore = await tasks(db);
        await batch(db, 'demo', '2026-10-22T10:00:00Z');
        const demo = (await tasks(db, 'demo')).filter(t => t.shared_key?.startsWith('endgame:'));
        assert.deepEqual(demo.map(t => t.id).sort(), cran.map(t => t.id).sort());
        assert.ok(demo.every(t => !t.is_done && !t.is_favorite));
        assert.equal(new Date(demo.find(t => t.description === 'Beyond the Rails').expiration_date).toISOString(), '2026-10-22T10:00:00.000Z');
        assert.deepEqual(await tasks(db), cranBefore);
        await select(db, 'demo', [gi]);
        assert.equal((await tasks(db, 'demo')).some(t => t.description === 'Beyond the Rails'), false);
        await select(db, 'demo', [gi, nte]);
        assert.equal((await tasks(db, 'demo')).some(t => t.description === 'Beyond the Rails'), true);
    });

    for (const invalid of [clock, '2026-01-01T10:00:00Z', 'infinity']) {
        await scenario(`Invalid NTE anchor ${invalid} rolls back the complete batch`, async () => {
            const before = await snapshot(db);
            await db.exec('savepoint rejected');
            await assert.rejects(batch(db, 'cran', invalid), /Prazo explícito inválido/);
            await db.exec('rollback to savepoint rejected');
            assert.deepEqual(await snapshot(db), before);
        });
    }

    await scenario('No selected games, invalid actor and ambiguous games reject without writes', async () => {
        const before = await snapshot(db);
        await db.exec('savepoint rejected');
        await assert.rejects(batch(db, 'guest'), /Selecione GI ou NTE/);
        await db.exec('rollback to savepoint rejected');
        await assert.rejects(batch(db, 'missing'), /Perfil inválido/);
        await db.exec('rollback to savepoint rejected');
        const duplicate = (await db.query("insert into games(description,abbreviation) values ('Duplicate Genshin','GI') returning id")).rows[0].id;
        await db.query("insert into profile_games(profile_id,game_id) values ('cran',$1)", [duplicate]);
        await db.exec('savepoint ambiguous');
        await assert.rejects(batch(db), /ambígua/);
        await db.exec('rollback to savepoint ambiguous');
        assert.deepEqual(await snapshot(db), before);
    });

    await scenario('Failure inserting NTE rolls back GI and markers, then retry succeeds once', async () => {
        await db.exec(`reset role;
            create function fail_endgame() returns trigger language plpgsql as $$ begin
                if new.description = 'Beyond the Rails' then raise exception 'Injected NTE failure'; end if; return new; end; $$;
            create trigger fail_endgame before insert on tasks for each row execute function fail_endgame();
            set local role anon; savepoint rejected;`);
        const before = await snapshot(db);
        await assert.rejects(batch(db), /Injected NTE failure/);
        await db.exec('rollback to savepoint rejected');
        assert.deepEqual(await snapshot(db), before);
        await db.exec('reset role; drop trigger fail_endgame on tasks; set local role anon');
        assert.equal((await batch(db)).created, 3);
        assert.equal((await batch(db)).created, 0);
    });

    for (const [day, now, expected] of [
        [1, '2028-02-01T08:59:59.999Z', '2028-02-01T09:00:00.000Z'],
        [1, '2028-02-01T09:00:00Z', '2028-03-01T09:00:00.000Z'],
        [15, '2028-02-15T09:00:00Z', '2028-03-15T09:00:00.000Z'],
        [15, '2027-02-28T12:00:00Z', '2027-03-15T09:00:00.000Z'],
        [1, '2026-12-31T20:00:00Z', '2027-01-01T09:00:00.000Z'],
    ]) await scenario(`Calendar reminder day ${day} at ${now} follows UTC months`, async () => {
        await db.exec("set local timezone='Pacific/Auckland'");
        assert.equal((await rpc(db, 'next_monthly_reminder', [day, now])).toISOString(), expected);
    });

    await scenario('Calendar edits and renewal preserve favorites and other profiles through the public save contract', async () => {
        await batch(db);
        await batch(db, 'demo');
        const row = (await tasks(db)).find(t => t.refresh_type === 9);
        await rpc(db, 'set_profile_task_favorite', ['cran', row.id, true]);
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...row, expiration_date: '2027-01-01T09:00:00Z', is_done: false }), row.id]);
        const saved = (await tasks(db)).find(t => t.id === row.id);
        assert.equal(saved.refresh_type, 9);
        assert.equal(saved.repeat_days, null);
        assert.equal(saved.is_favorite, true);
        assert.equal(new Date((await tasks(db, 'demo')).find(t => t.id === row.id).expiration_date).toISOString(), '2026-11-01T09:00:00.000Z');
        await db.exec('savepoint invalid');
        await assert.rejects(rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...saved, repeat_days: 30 }), row.id]), /calendar_recurrence/);
        await db.exec('rollback to savepoint invalid');
    });

    await scenario('Full explicit reset clears batch decisions and permits a new batch', async () => {
        await batch(db);
        await rpc(db, 'reset_application_data', []);
        assert.equal((await db.query('select count(*)::int n from profile_endgame_batches')).rows[0].n, 0);
        assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n, 3);
        await db.exec(await readProjectFile('db/seed.sql'));
        const ids = (await db.query("select id from games where abbreviation in ('GI','NTE')")).rows.map(g => g.id);
        await select(db, 'cran', ids);
        assert.equal((await batch(db)).created, 3);
    });
});
