import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/testDatabase.mjs';
import { mockDatabaseFetch } from './helpers/databaseFetch.mjs';
import { getEventGame } from '../js/events/eventGames.js';
import { assignEditionKeys, candidateFromActivity, syncGameEvents } from '../scripts/eventSync.js';
import { buildDatabaseReset } from '../scripts/buildDatabaseReset.js';
import { readProjectFile } from './helpers/testDatabase.mjs';
import { seedPreviewEventFixtures } from '../scripts/previewEventFixtures.js';

const profiles = ['cran', 'demo', 'guest'];
const json = value => JSON.stringify(value);
const iso = value => new Date(value).toISOString();
const call = async (db, name, params) => (await db.query(`select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) as result`, params)).rows[0].result;
const list = (db, profile) => call(db, 'list_profile_tasks', [profile]);
const cleanup = (db, source, now) => call(db, 'cleanup_expired_imported_events', [source, now]);
async function addCandidate(db, game, key, deadline) {
    return (await db.query(`insert into event_candidates (source, external_id, name, game_id, proposed_start_at, source_start_at, source_end_at, proposed_end_at)
        values ($1,$2,$2,$3,'2099-01-01T09:00:00Z','2099-01-01T04:00:00Z',$4,$4) returning *`,
        [game.source, key, game.id, deadline])).rows[0];
}

for (const migrated of [false, true]) test(`expired imports are deleted per profile and source (${migrated ? 'upgrade' : 'fresh'})`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query('select * from games')).rows;
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, games.map(game => game.id)]);
    const candidates = [];
    for (const key of ['genshin', 'hsr', 'zzz', 'wuwa', 'nte']) {
        const registered = getEventGame(key);
        const game = { ...registered, ...games.find(game => game.abbreviation === registered.abbreviation) };
        const c = await addCandidate(db, game, `${key}-expired`, '2099-01-10T09:00:00Z');
        await call(db, 'import_event_candidates', [game.source]);
        c.task_id = (await db.query('select task_id from event_candidates where id=$1', [c.id])).rows[0].task_id;
        candidates.push(c);
    }
    const gi = candidates[0];
    const owner = (await list(db, 'cran')).find(task => task.id === gi.task_id);
    await call(db, 'save_profile_task', ['cran', json({ ...owner, expiration_date: '2099-01-20T09:00:00Z' }), owner.id]);
    const guest = (await list(db, 'guest')).find(task => task.id === gi.task_id);
    await call(db, 'save_profile_task', ['guest', json({ ...guest, refresh_type: 8, repeat_days: 3 }), guest.id]);
    const manual = await call(db, 'save_profile_task', ['cran', json({ ...owner, description: 'Unlinked manual event', expiration_date: '2099-01-05T09:00:00Z' })]);

    assert.equal(await cleanup(db, gi.source, '2099-01-10T08:59:59.999Z'), 0);
    assert.equal(await cleanup(db, gi.source, '2099-01-10T09:00:00Z'), 1);
    assert.ok(!(await list(db, 'demo')).some(task => task.id === gi.task_id));
    assert.ok((await list(db, 'cran')).some(task => task.id === gi.task_id));
    assert.ok((await list(db, 'guest')).some(task => task.id === gi.task_id && task.refresh_type === 8));
    assert.equal((await db.query('select count(*)::integer n from profile_tasks where profile_id=$1 and task_id=$2', ['demo', gi.task_id])).rows[0].n, 0);
    assert.deepEqual((await db.query('select status,task_id from profile_event_decisions where profile_id=$1 and candidate_id=$2', ['demo', gi.id])).rows,
        [{ status: 'expired', task_id: null }]);
    assert.ok((await list(db, 'demo')).some(task => task.id === candidates[1].task_id), 'GI cleanup cannot remove HSR');

    await db.query('update event_candidates set proposed_end_at=$1 where id=$2', ['2099-01-25T09:00:00Z', gi.id]);
    await call(db, 'import_event_candidates', [gi.source]);
    await call(db, 'set_profile_games', ['demo', []]);
    await call(db, 'set_profile_games', ['demo', games.map(game => game.id)]);
    assert.ok(!(await list(db, 'demo')).some(task => task.id === gi.task_id), 'A corrected feed does not restore a deleted expired edition');
    assert.equal(iso((await list(db, 'cran')).find(task => task.id === gi.task_id).expiration_date), '2099-01-20T09:00:00.000Z');
    assert.equal(iso((await list(db, 'guest')).find(task => task.id === gi.task_id).expiration_date), '2099-01-10T09:00:00.000Z', 'Custom recurrence is not overwritten by API corrections');
    await assert.rejects(call(db, 'approve_profile_candidate', ['demo', gi.id, '2099-02-01T09:00:00Z']), /encerrada/);

    assert.equal(await cleanup(db, null, '2099-01-20T09:00:00Z'), 13, 'One CRAN GI state and three states for each of HSR/ZZZ/WuWa/NTE expire');
    assert.ok((await list(db, 'cran')).some(task => task.id === manual.id));
    for (const c of candidates.slice(1)) {
        assert.equal((await db.query('select count(*)::integer n from tasks where id=$1', [c.task_id])).rows[0].n, 0);
        const retained = (await db.query('select task_id,status from event_candidates where id=$1', [c.id])).rows[0];
        assert.deepEqual(retained, { task_id: null, status: 'ignored' });
    }
    await assert.rejects(cleanup(db, 'unsupported-source', '2099-01-20T09:00:00Z'), /sem política/);
    await assert.rejects(cleanup(db, null, null), /Relógio/);
    assert.equal(await cleanup(db, null, '2099-01-20T09:00:00Z'), 0, 'Cleanup is idempotent');
});

for (const key of ['genshin', 'hsr', 'zzz']) test(`${key} actual sync preserves a corrected edition and starts the next one independently`, async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    t.mock.method(console, 'log', () => {});
    const game = getEventGame(key);
    const row = (await db.query('select * from games where abbreviation=$1', [game.abbreviation])).rows[0];
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, [row.id]]);
    let calendar = { activities: [{ name: 'Recurring event', startTime: '2099-01-01T04:00:00', endTime: '2099-01-20T03:59:59' }] };
    mockDatabaseFetch(t, db, game, () => calendar);
    const run = () => syncGameEvents(game, { now: Date.parse('2099-01-05T12:00:00Z') });
    assert.equal((await run()).new, 1);
    const first = (await db.query('select * from event_candidates where source=$1', [game.source])).rows[0];
    await call(db, 'complete_profile_task', ['cran', first.task_id, true]);
    await call(db, 'ignore_profile_task', ['demo', first.task_id]);
    const owner = (await list(db, 'cran')).find(task => task.id === first.task_id);
    await call(db, 'save_profile_task', ['cran', json({ ...owner, expiration_date: '2099-01-28T09:00:00Z' }), first.task_id]);
    calendar.activities[0].endTime = '2099-01-21T03:59:59';
    assert.equal((await run()).new, 0);
    const corrected = (await db.query('select * from event_candidates where id=$1', [first.id])).rows[0];
    assert.equal(corrected.external_id, first.external_id);
    assert.equal(corrected.task_id, first.task_id);
    assert.equal((await list(db, 'cran')).find(task => task.id === first.task_id).is_done, true);
    assert.equal(iso((await list(db, 'cran')).find(task => task.id === first.task_id).expiration_date), '2099-01-28T09:00:00.000Z');
    assert.ok(!(await list(db, 'demo')).some(task => task.id === first.task_id));
    assert.equal(iso((await list(db, 'guest')).find(task => task.id === first.task_id).expiration_date), '2099-01-21T08:59:59.000Z');

    calendar.activities = [{ name: 'Recurring event', startTime: '2099-02-01T04:00:00', endTime: '2099-02-20T03:59:59' }];
    assert.equal((await run()).new, 1);
    assert.equal((await run()).new, 0);
    const next = (await db.query('select * from event_candidates where source=$1 order by id desc', [game.source])).rows[0];
    assert.notEqual(next.external_id, first.external_id);
    assert.notEqual(next.task_id, first.task_id);
    for (const profile of profiles) assert.equal((await list(db, profile)).find(task => task.id === next.task_id).is_done, false);
});

test('name-only keys are reused by period, while missing/ambiguous history blocks all mutations', () => {
    const game = getEventGame('genshin');
    const candidate = candidateFromActivity({ name: 'Same name', sourceStartAt: '2099-01-01T04:00:00Z', sourceEndAt: '2099-01-20T04:00:00Z' }, game);
    const legacy = { ...candidate, external_id: 'same-name', source_end_at: '2099-01-19T04:00:00Z' };
    assert.equal(assignEditionKeys([{ ...candidate }], [legacy])[0].external_id, 'same-name');
    assert.throws(() => assignEditionKeys([{ ...candidate }], [{ ...legacy, source_start_at: null, source_end_at: null }]), /Ambiguous/);
    assert.throws(() => assignEditionKeys([{ ...candidate }], [legacy, { ...legacy, external_id: 'other-key' }]), /Ambiguous/);
    assert.throws(() => assignEditionKeys([{ ...candidate }], [legacy, { ...legacy, external_id: 'incomplete', source_start_at: null, source_end_at: null }]), /Ambiguous/);
});

test('live reset starts every profile empty, is repeatable and rolls back a failed installation', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    const [schema, seed] = await Promise.all([readProjectFile('db/schema.sql'), readProjectFile('db/seed.sql')]);
    assert.ok(schema.replace(/\r\n/g, '\n').includes((await readProjectFile('db/migrations/2026-10-05-event-editions-expiry.sql')).replace(/\r\n/g, '\n')), 'Fresh schema and incremental contract must agree, regardless of checkout line endings');
    const reset = buildDatabaseReset(schema, seed);
    await db.exec(`create table public.unrelated_data (value text); insert into public.unrelated_data values ('Keep me');
        create function public.unrelated_function() returns text language sql as $$ select 'Keep me'::text $$;`);
    await call(db, 'set_profile_games', ['cran', (await db.query('select id from games')).rows.map(row => row.id)]);
    await call(db, 'save_profile_task', ['cran', json({ description: 'Discarded', refresh_type: 0, game_id: 1, expiration_date: '2099-01-01T09:00:00Z' })]);
    await db.exec(reset);
    await db.exec(reset);
    assert.equal((await db.query('select count(*)::int n from games')).rows[0].n, 5);
    assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n, 3);
    for (const table of ['tasks', 'event_candidates', 'profile_tasks', 'profile_games', 'profile_event_decisions', 'profile_weekly_batches', 'profile_endgame_batches', 'profile_task_batch_items']) {
        assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0, table);
    }
    assert.equal((await db.query('select value from unrelated_data')).rows[0].value, 'Keep me');
    assert.equal((await db.query('select unrelated_function() as value')).rows[0].value, 'Keep me');
    await assert.rejects(db.exec(buildDatabaseReset(schema, 'select missing_reset_function();')), /missing_reset_function/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from games')).rows[0].n, 5, 'Failure must restore the previous installation');
    await db.exec('set role anon');
    assert.equal((await call(db, 'profile_game_catalogue', ['demo'])).length, 5);
    assert.equal(await cleanup(db, null, '2099-01-01T09:00:00Z'), 0);
});

test('cleanup rolls back every profile if a later delete fails', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    const game = { ...getEventGame('hsr'), ...(await db.query("select * from games where abbreviation='HSR'")).rows[0] };
    await db.exec('set role anon');
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, [game.id]]);
    const c = await addCandidate(db, game, 'Rollback event', '2099-01-10T09:00:00Z');
    await call(db, 'import_event_candidates', [game.source]);
    const taskId = (await db.query('select task_id from event_candidates where id=$1', [c.id])).rows[0].task_id;
    await db.exec('reset role');
    await db.exec(`alter table profile_event_decisions add constraint late_cleanup_failure check (not (profile_id='guest' and candidate_id=${c.id} and status='expired'))`);
    await db.exec('set role anon');
    await assert.rejects(cleanup(db, game.source, '2099-01-10T09:00:00Z'), /late_cleanup_failure/);
    assert.equal((await db.query('select count(*)::integer n from profile_tasks where task_id=$1', [taskId])).rows[0].n, 3);
    assert.equal((await db.query('select count(*)::integer n from profile_event_decisions where candidate_id=$1', [c.id])).rows[0].n, 0);
    assert.equal((await db.query('select task_id from event_candidates where id=$1', [c.id])).rows[0].task_id, taskId);
});

test('GI legacy source is adopted only through matching edition dates', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    t.mock.method(console, 'log', () => {});
    const game = getEventGame('genshin');
    const row = (await db.query("select * from games where abbreviation='GI'")).rows[0];
    await call(db, 'set_profile_games', ['cran', [row.id]]);
    const legacy = (await db.query(`insert into event_candidates (source,external_id,name,game_id,source_start_at,source_end_at,proposed_end_at)
        values ('ennead-genshin-calendar','446','Legacy edition',$1,'2098-12-31T20:00:00Z','2099-01-19T19:59:59Z','2099-01-20T08:59:59Z') returning *`, [row.id])).rows[0];
    await call(db, 'approve_profile_candidate', ['cran', legacy.id, '2099-01-25T09:00:00Z']);
    const original = (await db.query('select task_id from event_candidates where id=$1', [legacy.id])).rows[0].task_id;
    await call(db, 'complete_profile_task', ['cran', original, true]);
    mockDatabaseFetch(t, db, game, () => ({ activities: [{ name: 'Legacy edition', startTime: '2099-01-01T04:00:00', endTime: '2099-01-21T03:59:59' }] }));
    const result = await syncGameEvents(game, { now: Date.parse('2099-01-05T12:00:00Z') });
    assert.equal(result.new, 0);
    assert.equal(result.migrated, 1);
    const adopted = (await db.query('select * from event_candidates where id=$1', [legacy.id])).rows[0];
    assert.equal(adopted.external_id, '446');
    assert.equal(adopted.task_id, original);
    assert.equal(adopted.source, game.source);
    assert.equal((await list(db, 'cran')).find(task => task.id === original).is_done, true);
});

for (const migrated of [false, true]) test(`all five sources respect hidden future, unknown and recurring personal deadlines (${migrated ? 'upgrade' : 'fresh'})`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query('select * from games')).rows;
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, games.map(game => game.id)]);
    for (const key of ['genshin', 'hsr', 'zzz', 'wuwa', 'nte']) {
        const game = { ...getEventGame(key), ...games.find(game => game.abbreviation === getEventGame(key).abbreviation) };
        await call(db, 'set_profile_games', ['demo', games.map(row => row.id)]);
        const c = await addCandidate(db, game, `${key}-protected`, '2099-01-10T09:00:00Z');
        await call(db, 'import_event_candidates', [game.source]);
        const owner = (await list(db, 'cran')).find(task => task.description === c.name);
        const demo = (await list(db, 'demo')).find(task => task.id === owner.id);
        const guest = (await list(db, 'guest')).find(task => task.id === owner.id);
        await call(db, 'save_profile_task', ['demo', json({ ...demo, expiration_date: '2099-02-01T09:00:00Z', is_done: true }), owner.id]);
        await call(db, 'save_profile_task', ['guest', json({ ...guest, expiration_date: null }), owner.id]);
        await call(db, 'set_profile_games', ['demo', []]);
        assert.equal(await cleanup(db, game.source, '2099-01-10T09:00:00Z'), 1, game.abbreviation);
        const state = (await db.query('select * from profile_tasks where profile_id=$1 and task_id=$2', ['demo', owner.id])).rows[0];
        assert.equal(iso(state.expiration_date), '2099-02-01T09:00:00.000Z');
        assert.equal(state.is_done, true);
        assert.equal((await list(db, 'guest')).find(task => task.id === owner.id).expiration_date, null);
        await call(db, 'set_profile_games', ['demo', [game.id]]);
        await call(db, 'save_profile_task', ['demo', json({ ...demo, expiration_date: '2099-01-10T09:00:00Z', refresh_type: 8, repeat_days: 3 }), owner.id]);
        assert.equal(await cleanup(db, game.source, '2099-02-01T09:00:00Z'), 0, 'Recurrence and unknown dates survive');
    }
    await assert.rejects(cleanup(db, 'not-supported', '2099-02-01T09:00:00Z'), /sem política/);
});

for (const key of ['genshin', 'hsr', 'zzz']) test(`${key} closes an elapsed edition before a corrected feed extends it`, async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    t.mock.method(console, 'log', () => {});
    const game = getEventGame(key);
    const registered = (await db.query('select * from games where abbreviation=$1', [game.abbreviation])).rows[0];
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, [registered.id]]);
    let calendar = { activities: [{ name: 'Elapsed edition', startTime: '2025-01-01T04:00:00', endTime: '2099-01-10T03:59:59' }] };
    mockDatabaseFetch(t, db, game, () => calendar);
    await syncGameEvents(game, { now: Date.parse('2025-01-02T12:00:00Z') });
    const c = (await db.query('select * from event_candidates where source=$1', [game.source])).rows[0];
    await db.query('update tasks set expiration_date=$1 where id=$2', ['2025-01-10T09:00:00Z', c.task_id]);
    calendar.activities[0].endTime = '2099-02-01T03:59:59';
    const result = await syncGameEvents(game, { now: Date.parse('2026-10-05T12:00:00Z') });
    assert.equal(result.expiredTasksRemoved, 3);
    assert.equal((await db.query('select count(*)::int n from profile_tasks where task_id=$1', [c.task_id])).rows[0].n, 0);
    assert.equal((await db.query('select status from event_candidates where id=$1', [c.id])).rows[0].status, 'ignored');
    await syncGameEvents(game, { now: Date.parse('2026-10-05T12:00:00Z') });
    assert.equal((await db.query('select count(*)::int n from tasks where id=$1', [c.task_id])).rows[0].n, 0);
    await assert.rejects(call(db, 'approve_profile_candidate', ['cran', c.id, '2099-03-01T09:00:00Z']), /encerrada/);
});

test('an ambiguous calendar blocks cleanup and every other write', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    const game = getEventGame('hsr');
    const registered = (await db.query("select * from games where abbreviation='HSR'")).rows[0];
    await call(db, 'set_profile_games', ['cran', [registered.id]]);
    const c = await addCandidate(db, { ...game, ...registered }, 'Ambiguous event', '2099-01-10T09:00:00Z');
    await call(db, 'import_event_candidates', [game.source]);
    const state = (await db.query('select * from event_candidates where id=$1', [c.id])).rows[0];
    await db.query('update tasks set expiration_date=$1 where id=$2', ['2025-01-01T09:00:00Z', state.task_id]);
    await db.query(`insert into event_candidates (source,external_id,name,game_id,source_start_at,source_end_at)
        values ($1,'second-key',$2,$3,$4,$5)`, [game.source, c.name, registered.id, c.source_start_at, c.source_end_at]);
    mockDatabaseFetch(t, db, game, () => ({ activities: [{ name: c.name, startTime: '2099-01-01T04:00:00', endTime: '2099-01-11T03:59:59' }] }));
    await assert.rejects(syncGameEvents(game, { now: Date.parse('2099-01-05T12:00:00Z') }), /Ambiguous/);
    assert.equal((await db.query('select count(*)::int n from profile_tasks where task_id=$1', [state.task_id])).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from profile_event_decisions where status=$1', ['expired'])).rows[0].n, 0);
});

test('preview fixtures demonstrate expiry in every game without touching future or recurring states', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    await db.exec('set role anon');
    await seedPreviewEventFixtures(db);
    assert.equal(await call(db, 'cleanup_expired_imported_events', []), 5);
    assert.equal((await list(db, 'cran')).length, 5);
    assert.ok((await list(db, 'cran')).every(task => task.description.endsWith('seguinte') && !task.is_done));
    assert.equal((await list(db, 'demo')).length, 10);
    assert.equal((await list(db, 'guest')).length, 10);
    assert.equal((await list(db, 'demo')).filter(task => task.description.endsWith('anterior') && task.is_done && task.event_deadline_manual).length, 5);
    assert.equal((await list(db, 'guest')).filter(task => task.description.endsWith('anterior') && task.refresh_type === 2).length, 5);
});

test('a private reviewed alias survives the shared deadline and is permanently removed only at its own deadline', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    await db.exec('set role anon');
    const game = { ...getEventGame('hsr'), ...(await db.query("select * from games where abbreviation='HSR'")).rows[0] };
    for (const profile of profiles) await call(db, 'set_profile_games', [profile, [game.id]]);
    const c = await addCandidate(db, game, 'Reviewed alias', '2099-01-10T09:00:00Z');
    await call(db, 'import_event_candidates', [game.source]);
    const canonical = (await db.query('select task_id from event_candidates where id=$1', [c.id])).rows[0].task_id;
    const alias = await call(db, 'save_profile_task', ['demo', json({ description: 'Personal alias', game_id: game.id, refresh_type: 0, expiration_date: '2099-02-01T09:00:00Z', cover_url: 'https://example.com/alias.png' })]);
    await call(db, 'approve_profile_candidate', ['demo', c.id, '2099-02-01T09:00:00Z', alias.id]);
    await call(db, 'complete_profile_task', ['demo', alias.id, true]);
    await call(db, 'set_profile_games', ['demo', []]);
    assert.equal(await cleanup(db, game.source, '2099-01-10T09:00:00Z'), 2);
    assert.equal((await db.query('select task_id from event_candidates where id=$1', [c.id])).rows[0].task_id, canonical);
    const kept = (await db.query('select * from profile_tasks where profile_id=$1 and task_id=$2', ['demo', alias.id])).rows[0];
    assert.equal(kept.is_done, true);
    assert.equal(iso(kept.expiration_date), '2099-02-01T09:00:00.000Z');
    assert.equal((await db.query('select cover_url from tasks where id=$1', [alias.id])).rows[0].cover_url, 'https://example.com/alias.png');
    await call(db, 'set_profile_games', ['demo', [game.id]]);
    assert.equal((await list(db, 'demo')).filter(task => task.id === canonical).length, 0, 'Selection cannot duplicate a reviewed alias');
    assert.equal(await cleanup(db, game.source, '2099-02-01T09:00:00Z'), 1);
    assert.equal((await db.query('select count(*)::int n from tasks where id=any($1::bigint[])', [[canonical, alias.id]])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from profile_tasks where task_id=any($1::bigint[])', [[canonical, alias.id]])).rows[0].n, 0);
    assert.deepEqual((await db.query('select status,task_id from profile_event_decisions where profile_id=$1 and candidate_id=$2', ['demo', c.id])).rows[0], { status: 'expired', task_id: null });
});

test('importing before selection creates shared templates without implicit CRAN progress', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    await db.exec('set role anon');
    const games = (await db.query('select * from games')).rows;
    for (const key of ['genshin', 'hsr', 'zzz', 'wuwa', 'nte']) {
        const game = { ...getEventGame(key), ...games.find(game => game.abbreviation === getEventGame(key).abbreviation) };
        await addCandidate(db, game, `${key}-unselected`, '2099-01-20T09:00:00Z');
        await call(db, 'import_event_candidates', [game.source]);
    }
    assert.equal((await db.query('select count(*)::int n from profile_tasks')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from tasks where owner_profile_id is null')).rows[0].n, 5);
    await call(db, 'set_profile_games', ['demo', [games.find(game => game.abbreviation === 'HSR').id]]);
    assert.equal((await list(db, 'demo')).length, 1);
    assert.equal((await db.query("select count(*)::int n from profile_tasks where profile_id='cran'")).rows[0].n, 0);
});
