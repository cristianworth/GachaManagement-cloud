import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, migrations, readProjectFile } from './helpers/testDatabase.mjs';
const clock = '2026-10-09T08:00:00Z';
const identity = (abbreviation, definition_key, calendar_key = '') => ({ abbreviation, definition_key, calendar_key });
const echo = identity('HSR', 'echo-of-war');
const rpc = async (db, name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result;
const tasks = (db, profile = 'cran') => rpc(db, 'list_profile_tasks', [profile]);
const offers = (db, profile = 'cran', now = clock) => rpc(db, 'list_profile_task_batch', [profile, now]);
const request = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const choose = (db, items, id = request(1), profile = 'cran', now = clock) => rpc(db, 'choose_profile_task_batch', [profile, JSON.stringify(items), now, id]);
const replacement = offer => ({ abbreviation:offer.abbreviation, definition_key:offer.definition_key, calendar_key:offer.calendar_key,
    expected_task_id:offer.task_id, expected_version:offer.task_version });
async function snapshot(db) {
    const data = {};
    for (const table of ['tasks','profile_tasks','profile_task_batch_decisions','profile_task_batch_items','profile_weekly_batches','profile_endgame_batches','profile_task_batch_requests'])
        data[table] = (await db.query(`select to_jsonb(t) row from ${table} t order by to_jsonb(t)::text`)).rows;
    return data;
}
for (const migrated of [false, true]) test(`Batch replacement as anon: ${migrated ? 'upgrade' : 'fresh'}`, async t => {
    const db = await createTestDatabase({ migrated }); t.after(() => db.close()); await db.exec('set role anon');
    const games = (await db.query('select id,abbreviation from games')).rows;
    const gameId = abbr => games.find(g => g.abbreviation === abbr).id;
    for (const profile of ['cran','demo']) await rpc(db, 'set_profile_games', [profile, games.map(g => g.id), false]);
    const scenario = (name, run) => t.test(name, async () => {
        await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); }
    });
    const rejectUnchanged = async (run, pattern) => {
        const before = await snapshot(db); await db.exec('savepoint rejected');
        await assert.rejects(run(), pattern); await db.exec('rollback to savepoint rejected');
        assert.deepEqual(await snapshot(db), before);
    };
    await scenario('Active replacement removes all old personal data and creates a private fresh task; other profiles are unchanged', async () => {
        for (const profile of ['cran','demo']) await rpc(db, 'create_profile_task_batch', [profile, null, clock]);
        const old = (await tasks(db)).find(x => x.description === 'Echo of War');
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({...old, description:'Personal Echo', is_done:true, refresh_type:8,
            repeat_days:19, expiration_date:'2099-02-02T14:30Z', cover_url:'https://example.com/custom.png'}), old.id]);
        await rpc(db, 'set_profile_task_favorite', ['cran', old.id, true]);
        const cran = await tasks(db); const demo = await tasks(db, 'demo');
        const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        assert.equal(offer.state, 'created'); assert.equal(offer.can_replace, true);
        const result = await choose(db, [replacement(offer)]);
        assert.equal(result.created, 1); assert.equal(result.replaced, 1);
        const fresh = (await tasks(db)).find(x => x.description === 'Echo of War');
        assert.notEqual(fresh.id, old.id); assert.equal(fresh.is_done, false); assert.equal(fresh.is_favorite, false);
        assert.equal(new Date(fresh.expiration_date).toISOString(), '2026-10-12T09:00:00.000Z');
        assert.equal(fresh.refresh_type, 2); assert.equal(fresh.repeat_days, 7); assert.equal(fresh.cover_url, offer.cover_url);
        const personal = (await db.query('select * from profile_tasks where profile_id=$1 and task_id=$2', ['cran', fresh.id])).rows[0];
        assert.equal(personal.event_deadline_manual, false); assert.equal(personal.deleted, false);
        assert.equal((await db.query('select count(*)::int n from profile_tasks where profile_id=$1 and task_id=$2', ['cran', old.id])).rows[0].n, 0);
        assert.equal((await db.query('select owner_profile_id,shared_key from tasks where id=$1', [fresh.id])).rows[0].owner_profile_id, 'cran');
        assert.deepEqual((await tasks(db)).filter(x => x.id !== fresh.id), cran.filter(x => x.id !== old.id));
        assert.deepEqual(await tasks(db, 'demo'), demo);
        const before = await snapshot(db);
        assert.equal((await rpc(db, 'create_profile_task_batch', ['cran', null, clock])).created, 0);
        assert.deepEqual(await snapshot(db), before);
    });
    await scenario('An excluded item is recreated with a new ID and reset state only by explicit selection', async () => {
        await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
        const old = (await tasks(db)).find(x => x.description === 'Simulated Universe');
        await rpc(db, 'complete_profile_task', ['cran', old.id, true]); await rpc(db, 'set_profile_task_favorite', ['cran', old.id, true]);
        await rpc(db, 'remove_profile_task', ['cran', old.id]);
        assert.equal((await rpc(db, 'create_profile_task_batch', ['cran', null, clock])).created, 0);
        assert.ok(!(await tasks(db)).some(x => x.id === old.id));
        const offer = (await offers(db)).find(x => x.definition_key === 'simulated-universe');
        assert.equal(offer.state, 'excluded'); assert.equal(offer.can_replace, true);
        await choose(db, [replacement(offer)]);
        const fresh = (await tasks(db)).find(x => x.description === 'Simulated Universe');
        assert.notEqual(fresh.id, old.id); assert.equal(fresh.is_done, false); assert.equal(fresh.is_favorite, false); assert.equal(fresh.cover_url, offer.cover_url);
        // A later deliberate replacement is another fresh task, and private obsolete rows are removed.
        const again = (await offers(db)).find(x => x.definition_key === 'simulated-universe');
        await choose(db, [replacement(again)], request(2));
        assert.equal((await db.query('select count(*)::int n from tasks where id=$1', [fresh.id])).rows[0].n, 0);
    });
    await scenario('A lost successful response retries exactly once, even after subsequent personal edits', async () => {
        await choose(db, [echo]);
        const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        const selection = [replacement(offer)]; const result = await choose(db, selection, request(2));
        const fresh = (await tasks(db)).find(x => x.description === 'Echo of War');
        await rpc(db, 'complete_profile_task', ['cran', fresh.id, true]);
        const before = await snapshot(db);
        assert.deepEqual(await choose(db, selection, request(2)), result); assert.deepEqual(await snapshot(db), before);
        await rejectUnchanged(() => choose(db, [], request(2)), /outra seleção/);
        await rejectUnchanged(() => choose(db, selection, request(3)), /alterada/);
    });
    await scenario('Stale personal edits, stale deletion, malformed IDs and missing request identity reject without erasing anything', async () => {
        await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
        const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        await rejectUnchanged(() => choose(db, [{...replacement(offer), expected_task_id:99999}]), /alterada/);
        await rejectUnchanged(() => choose(db, [{...replacement(offer), expected_version:null}]), /alterada/);
        await rejectUnchanged(() => choose(db, [replacement(offer)], null), /alterada/);
        await rpc(db, 'set_profile_task_favorite', ['cran', offer.task_id, true]);
        await rejectUnchanged(() => choose(db, [replacement(offer)]), /alterada/);
        const active = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        await rpc(db, 'remove_profile_task', ['cran', active.task_id]);
        await rejectUnchanged(() => choose(db, [replacement(active)]), /alterada/);
    });
    await scenario('Manual and imported homonyms remain protected even when recorded as preserved', async () => {
        for (const imported of [false, true]) {
            const definition = imported ? 'simulated-universe' : 'echo-of-war';
            const description = imported ? 'Simulated Universe' : 'Echo of War';
            const saved = await rpc(db, 'save_profile_task', ['cran', JSON.stringify({description, game_id:gameId('HSR'),
                refresh_type:0, expiration_date:'2099-10-09T12:00Z', is_done:true, cover_url:'https://example.com/manual.png'})]);
            if (imported) await db.query("insert into event_candidates(source,external_id,name,game_id,task_id,status,proposed_end_at) values ('starrailassistant-hsr','replacement-alias','Simulated Universe',$1,$2,'approved','2099-10-09T12:00Z')", [gameId('HSR'), saved.id]);
            await choose(db, [identity('HSR', definition)], request(imported ? 2 : 1));
            const offer = (await offers(db)).find(x => x.definition_key === definition);
            assert.equal(offer.state, 'preserved'); assert.equal(offer.can_replace, false);
            await rejectUnchanged(() => choose(db, [replacement(offer)], request(3)), /protegido/);
            await rpc(db, 'remove_profile_task', ['cran', saved.id]);
            const excluded = (await offers(db)).find(x => x.definition_key === definition);
            assert.equal(excluded.state, 'excluded'); assert.equal(excluded.can_replace, false);
            await rejectUnchanged(() => choose(db, [replacement(excluded)], request(4)), /protegido/);
        }
    });
    await scenario('All sixteen definitions support fresh replacement; custom covers reset to catalogue defaults', async () => {
        await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
        const oldIds = (await tasks(db)).map(x => x.id);
        const hollow = (await tasks(db)).find(x => x.description === 'Hollow Zero');
        await rpc(db, 'save_profile_task', ['cran', JSON.stringify({...hollow, cover_url:'https://example.com/custom.png'}), hollow.id]);
        const catalogue = await offers(db); assert.ok(catalogue.every(x => x.can_replace));
        const result = await choose(db, catalogue.map(replacement)); assert.equal(result.replaced, 16);
        const fresh = (await tasks(db)).filter(x => !oldIds.includes(x.id)); assert.equal(fresh.length, 16);
        assert.equal(fresh.filter(x => x.cover_url).length, 16);
        assert.equal(fresh.find(x => x.description === 'Hollow Zero').cover_url, catalogue.find(x=>x.definition_key==='hollow-zero').cover_url);
        const endstate = fresh.find(x => x.description === 'Endstate Matrix');
        assert.equal(endstate.refresh_type, 0); assert.equal(endstate.repeat_days, null);
        assert.equal(new Date(endstate.expiration_date).toISOString(), '2026-11-10T20:00:00.000Z');
    });
    await scenario('Expired Endstate cannot be replaced or restored; its prior state survives', async () => {
        await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
        const offer = (await offers(db)).find(x => x.definition_key === 'endstate-matrix');
        const late = '2026-11-10T20:00:00Z';
        assert.equal((await offers(db, 'cran', late)).find(x => x.definition_key === 'endstate-matrix').can_replace, false);
        await rejectUnchanged(() => choose(db, [replacement(offer)], request(1), 'cran', late), /calendário/);
        await rpc(db, 'remove_profile_task', ['cran', offer.task_id]);
        const excluded = (await offers(db)).find(x => x.definition_key === 'endstate-matrix');
        await rejectUnchanged(() => choose(db, [replacement(excluded)], request(1), 'cran', late), /calendário/);
    });
    await scenario('One selected replacement and one new item do not close partial groups or reset unchecked tasks', async () => {
        await choose(db, [echo]); const before = (await tasks(db)).find(x => x.description === 'Echo of War');
        const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        const result = await choose(db, [replacement(offer), identity('GI','spiral-abyss')], request(2));
        assert.equal(result.replaced, 1); assert.equal(result.created, 2);
        assert.ok(!(await tasks(db)).some(x => x.id === before.id));
        assert.equal((await offers(db)).find(x => x.definition_key === 'simulated-universe').state, 'deferred');
        assert.equal((await db.query("select count(*)::int n from profile_weekly_batches where profile_id='cran' and status='created'")).rows[0].n, 0);
        assert.equal((await db.query("select count(*)::int n from profile_endgame_batches where profile_id='cran'")).rows[0].n, 0);
    });
    await scenario('Unknown identities, invalid actors, disabled games and repeated definitions reject atomically', async () => {
        await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
        const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        for (const items of [[identity('HSR','pure-fiction')], [replacement(offer), replacement(offer)], [{abbreviation:'HSR'}], [identity('WuWa','endstate-matrix','3.8')]])
            await rejectUnchanged(() => choose(db, items), /Seleção/);
        await rejectUnchanged(() => choose(db, [replacement(offer)], request(1), 'missing'), /Perfil inválido/);
        await rejectUnchanged(() => choose(db, [replacement(offer)], request(1), 'demo'), /alterada/);
        await rpc(db, 'set_profile_games', ['cran', [gameId('GI')], false]);
        await rejectUnchanged(() => choose(db, [replacement(offer)]), /desabilitada/);
    });
    await scenario('Failure after deleting old state rolls back replacements, creations, deferrals and the receipt', async () => {
        await choose(db, [echo]); const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
        await db.exec(`reset role; create function reject_batch_new() returns trigger language plpgsql as $$ begin
            if new.description='Shiyu Defense' then raise exception 'Injected create failure'; end if; return new; end $$;
            create trigger reject_batch_new before insert on tasks for each row execute function reject_batch_new(); set local role anon;`);
        const selection = [replacement(offer), identity('ZZZ','shiyu-defense')];
        await rejectUnchanged(() => choose(db, selection, request(2)), /Injected create/);
        await db.exec('reset role; drop trigger reject_batch_new on tasks; set local role anon');
        assert.equal((await choose(db, selection, request(2))).created, 2);
    });
    await scenario('Reset removes retry receipts as well as per-item state', async () => {
        await choose(db, [echo]); assert.equal((await db.query('select count(*)::int n from profile_task_batch_requests')).rows[0].n, 1);
        await rpc(db, 'reset_application_data'); assert.equal((await db.query('select count(*)::int n from profile_task_batch_requests')).rows[0].n, 0);
    });
});

test('Legacy upgrade exposes only verifiable batch tasks without backfill or guessed ownership', async t => {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(`create role anon; create role authenticated; create role service_role; grant usage on schema public to anon;
        alter default privileges in schema public grant select,insert,update,delete on tables to anon;
        alter default privileges in schema public grant usage,select on sequences to anon;`);
    await db.exec(await readProjectFile('tests/fixtures/pre-events-schema.sql')); await db.exec(await readProjectFile('db/seed.sql'));
    const selectionIndex = migrations.indexOf('2026-10-09-task-batch-selection.sql');
    for (const file of migrations.slice(0, selectionIndex)) await db.exec(await readProjectFile('db/migrations/' + file));
    await db.exec('set role anon'); const ids = (await db.query('select id from games')).rows.map(x => x.id);
    await rpc(db, 'set_profile_games', ['cran', ids, false]); await rpc(db, 'create_profile_task_batch', ['cran', null, clock]);
    const old = (await tasks(db)).find(x => x.description === 'Echo of War'); await rpc(db, 'remove_profile_task', ['cran', old.id]);
    const before = await tasks(db);
    await db.exec('reset role'); for (const file of migrations.slice(selectionIndex)) await db.exec(await readProjectFile('db/migrations/' + file));
    await db.exec('set role anon'); assert.deepEqual(await tasks(db), before);
    const offer = (await offers(db)).find(x => x.definition_key === echo.definition_key);
    assert.equal(offer.state, 'excluded'); assert.equal(offer.can_replace, true);
    await choose(db, [replacement(offer)]); assert.ok(!(await tasks(db)).some(x => x.id === old.id));
    await db.exec("delete from profile_tasks where profile_id='cran' and task_id in (select id from tasks where shared_key='weekly:HSR:simulated-universe')");
    const absent = (await offers(db)).find(x => x.definition_key === 'simulated-universe');
    assert.equal(absent.state, 'legacy'); assert.equal(absent.can_replace, false);
});
