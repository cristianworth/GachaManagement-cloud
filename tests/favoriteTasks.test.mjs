import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, readProjectFile, migrations } from './helpers/testDatabase.mjs';

const call = async (db, name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)).rows[0].result;
const list = (db, profile = 'cran') => call(db, 'list_profile_tasks', [profile]);
const favorite = (db, profile, id, value = true) => call(db, 'set_profile_task_favorite', [profile, id, value]);
const payload = (game, name, end, overrides = {}) => ({ description: name, game_id: game.id,
    expiration_date: end, refresh_type: 2, repeat_days: 7, ...overrides });

for (const migrated of [false, true]) test(`favorites are personal and stable (${migrated ? 'upgrade' : 'fresh'})`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const gi = (await db.query("select * from games where abbreviation='GI'")).rows[0];
    for (const profile of ['cran', 'demo']) await call(db, 'set_profile_games', [profile, [gi.id]]);
    const add = (name, end, extra) => call(db, 'save_profile_task', ['cran', JSON.stringify(payload(gi, name, end, extra))]);
    const early = await add('Early', '2099-10-10T09:00:00Z');
    const later = await add('Later', '2099-10-20T09:00:00Z', { is_done: true, cover_url: 'https://example.com/keep.png' });
    const tie = await add('Same deadline', '2099-10-20T09:00:00Z');
    const noDeadline = await add('No deadline', null);

    await t.test('new and existing states default to false; favorites sort before deadlines with stable ties', async () => {
        assert.ok((await list(db)).every(row => row.is_favorite === false));
        const before = (await db.query('select * from profile_tasks where profile_id=$1 and task_id=$2', ['cran', later.id])).rows[0];
        await favorite(db, 'cran', later.id);
        const after = (await db.query('select * from profile_tasks where profile_id=$1 and task_id=$2', ['cran', later.id])).rows[0];
        assert.deepEqual(after, { ...before, is_favorite: true });
        await favorite(db, 'cran', tie.id);
        await favorite(db, 'cran', noDeadline.id);
        const ids = (await list(db)).filter(row => [early.id, later.id, tie.id, noDeadline.id].includes(row.id)).map(row => row.id);
        assert.deepEqual(ids, [later.id, tie.id, noDeadline.id, early.id]);
        await favorite(db, 'cran', later.id, false);
        assert.equal((await list(db)).find(row => row.id === later.id).is_favorite, false);
    });

    await t.test('invalid actors, foreign/private tasks, null state and removed/hidden tasks reject without restoring anything', async () => {
        await assert.rejects(favorite(db, 'missing', early.id), /Perfil inválido/);
        await assert.rejects(favorite(db, 'demo', early.id), /não encontrada/);
        await assert.rejects(favorite(db, 'cran', 999999), /não encontrada/);
        await assert.rejects(favorite(db, 'cran', early.id, null), /estado/);
        await call(db, 'remove_profile_task', ['cran', early.id]);
        await assert.rejects(favorite(db, 'cran', early.id), /não encontrada/);
        assert.ok(!(await list(db)).some(row => row.id === early.id));
        await call(db, 'set_profile_games', ['cran', []]);
        await assert.rejects(favorite(db, 'cran', tie.id, false), /não encontrada/);
        await call(db, 'set_profile_games', ['cran', [gi.id]]);
        assert.equal((await list(db)).find(row => row.id === tie.id).is_favorite, true);
    });

    await t.test('completion, editing and recurring renewal preserve the preference', async () => {
        await call(db, 'complete_profile_task', ['cran', tie.id, true]);
        await call(db, 'save_profile_task', ['cran', JSON.stringify(payload(gi, 'Renewed weekly', '2099-10-27T09:00:00Z', { is_done: false })), tie.id]);
        const saved = (await list(db)).find(row => row.id === tie.id);
        assert.equal(saved.is_favorite, true);
        assert.equal(saved.is_done, false);
        assert.equal(new Date(saved.expiration_date).toISOString(), '2099-10-27T09:00:00.000Z');
    });

    await t.test('API corrections keep a profile favorite; another edition and another profile start without it', async () => {
        const candidate = async (key, end) => (await db.query(`insert into event_candidates
            (source,external_id,name,game_id,proposed_start_at,proposed_end_at)
            values ('starrailassistant-genshin',$1,'Shared event',$2,'2099-10-01T09:00:00Z',$3) returning id`, [key, gi.id, end])).rows[0].id;
        const first = await candidate('favorite-edition-1', '2099-10-12T09:00:00Z');
        await call(db, 'import_event_candidates', ['starrailassistant-genshin']);
        const firstTask = (await db.query('select task_id from event_candidates where id=$1', [first])).rows[0].task_id;
        await favorite(db, 'cran', firstTask);
        assert.equal((await list(db, 'demo')).find(row => row.id === firstTask).is_favorite, false);
        await db.query('update event_candidates set proposed_end_at=$1 where id=$2', ['2099-10-15T09:00:00Z', first]);
        await call(db, 'import_event_candidates', ['starrailassistant-genshin']);
        assert.equal((await list(db)).find(row => row.id === firstTask).is_favorite, true);
        const second = await candidate('favorite-edition-2', '2099-11-15T09:00:00Z');
        await call(db, 'import_event_candidates', ['starrailassistant-genshin']);
        const nextTask = (await db.query('select task_id from event_candidates where id=$1', [second])).rows[0].task_id;
        assert.equal((await list(db)).find(row => row.id === nextTask).is_favorite, false);
        await call(db, 'cleanup_expired_imported_events', ['starrailassistant-genshin', '2099-10-15T09:00:00Z']);
        assert.ok(!(await list(db)).some(row => row.id === firstTask), 'Favorite cannot keep an expired import alive');
    });
});

test('incremental favorite migration preserves all existing personal state', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    const sql = await readProjectFile('db/migrations/2026-10-06-favorite-tasks.sql');
    assert.ok((await readProjectFile('db/schema.sql')).replace(/\r\n/g, '\n').includes(sql.replace(/\r\n/g, '\n')));
    assert.ok(migrations.includes('2026-10-06-favorite-tasks.sql'));
    assert.ok(migrations.indexOf('2026-10-06-favorite-tasks.sql') < migrations.indexOf('2026-10-08-endgame-batch.sql'));
    await db.exec(`insert into tasks (description,game_id,expiration_date,is_done,refresh_type,repeat_days,cover_url)
        select 'Existing personal weekly',id,'2099-10-10T09:00:00Z',true,2,7,'https://example.com/keep.png' from games where abbreviation='GI';
        update profile_tasks set event_deadline_manual=true;`);
    await db.exec('drop function set_profile_task_favorite(text,bigint,boolean); alter table profile_tasks drop column is_favorite;');
    const before = (await db.query('select * from profile_tasks order by profile_id,task_id')).rows;
    assert.ok(before.length > 0);
    await db.exec(sql);
    assert.deepEqual((await db.query('select * from profile_tasks order by profile_id,task_id')).rows, before.map(row => ({ ...row, is_favorite: false })));
});
