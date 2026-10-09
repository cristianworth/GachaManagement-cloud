import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createTestDatabase, readProjectFile } from './helpers/testDatabase.mjs';
import { WEEKLY_BATCHES as CURRENT_WEEKLY_BATCHES } from '../js/data/weeklyTasks.js';
import { getNextRecurringDeadline } from '../js/utils/dateUtils.js';

// The global legacy RPC keeps its original three-game contract. New groups use profile RPCs.
const WEEKLY_BATCHES = CURRENT_WEEKLY_BATCHES.filter(b=>['HSR','WuWa','ZZZ'].includes(b.abbreviation));
const clock = '2026-10-04T12:00:00Z';
const definitions = JSON.stringify(WEEKLY_BATCHES.find(batch => batch.abbreviation === 'ZZZ').definitions);
async function createBatch(db, { abbreviation = 'ZZZ', explicit = true, now = clock, items = definitions, id } = {}) {
    id ??= (await db.query('select id from games where abbreviation=$1', [abbreviation])).rows[0]?.id;
    return (await db.query('select create_weekly_batch($1,$2,$3::jsonb,$4,$5) as result',
        [abbreviation, id, items, explicit, now])).rows[0].result;
}

async function applicationSnapshot(db) {
    return (await db.query(`select jsonb_build_object(
        'games',(select coalesce(jsonb_agg(g order by id),'[]') from games g),
        'tasks',(select coalesce(jsonb_agg(t order by id),'[]') from tasks t),
        'candidates',(select coalesce(jsonb_agg(c order by id),'[]') from event_candidates c),
        'batches',(select coalesce(jsonb_agg(b order by abbreviation),'[]') from weekly_batches b),
        'items',(select coalesce(jsonb_agg(i order by abbreviation,definition_key),'[]') from weekly_batch_items i)
    ) as data`)).rows[0].data;
}

for (const migrated of [false, true]) test(`${migrated ? 'Upgrade' : 'Fresh install'} weekly batch contract as anon`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    const scenario = (name, fn) => t.test(name, async () => {
        await db.exec('begin; set local role anon;');
        try { await fn(); } finally { await db.exec('rollback'); }
    });

    await scenario('Boot creates only new lots and preserves upgrade decisions', async () => {
        await db.exec(`insert into tasks(description,game_id,refresh_type,expiration_date)
            select 'Unrelated manual event',id,0,'2099-01-01T09:00:00Z' from games where abbreviation='GI';`);
        const before = (await db.query('select * from tasks order by id')).rows;
        for (const batch of WEEKLY_BATCHES) {
            const result = await createBatch(db, { abbreviation: batch.abbreviation, items: JSON.stringify(batch.definitions), explicit: false });
            assert.equal(result.created, migrated ? 0 : { HSR: 2, WuWa: 2, ZZZ: 2 }[batch.abbreviation]);
        }
        const rows = (await db.query('select * from tasks order by id')).rows;
        assert.deepEqual(rows.slice(0, before.length), before);
        const created = rows.slice(before.length);
        assert.ok(created.every(row => row.refresh_type === 2 && row.repeat_days === 7
            && row.expiration_date.toISOString() === '2026-10-05T09:00:00.000Z' && !row.is_done));
        assert.ok(!created.some(row => row.description === 'Illusive Realm'));
        assert.equal(created.filter(row => row.description === 'Simulated Universe').length, migrated ? 0 : 1);
    });

    await scenario('Explicit lots work with unrelated tasks, reassigned IDs and repeated requests', async () => {
        const oldId = (await db.query("select id from games where abbreviation='ZZZ'")).rows[0].id;
        await db.exec(`delete from games where abbreviation='ZZZ';
            insert into games(description, abbreviation) values ('ZZZ re-added', 'ZZZ');
            insert into tasks(description,game_id,refresh_type,expiration_date)
            select 'Other game event',id,0,'2099-01-01T09:00:00Z' from games where abbreviation='GI';`);
        const result = await createBatch(db);
        assert.equal(result.created, 2);
        assert.equal((await createBatch(db)).created, 0);
        const rows = (await db.query(`select t.*,g.abbreviation from tasks t join games g on g.id=t.game_id
            where g.abbreviation='ZZZ'`)).rows;
        assert.equal(rows.length, 2);
        assert.ok(rows.every(row => row.game_id !== oldId && row.game_description === 'ZZZ re-added'));
        assert.equal((await db.query("select count(*)::int as n from tasks where description='Other game event'")).rows[0].n, 1);
    });

    await scenario('Homonyms are preserved without assuming seed ownership, including duplicate manual names', async () => {
        await db.exec(`insert into tasks(description,game_id,refresh_type,repeat_days,expiration_date,is_done,cover_url)
            select 'Hollow Zero',id,8,19,'2099-02-02T14:30:00Z',true,'https://example.com/manual.jpg'
            from games where abbreviation='ZZZ';
            insert into tasks(description,game_id,refresh_type,expiration_date)
            select 'Hollow Zero',id,0,'2099-03-03T09:00:00Z' from games where abbreviation='ZZZ';`);
        const before = (await db.query('select * from tasks order by id')).rows;
        assert.deepEqual(await createBatch(db), { status: 'created', created: 1, preserved: 1 });
        assert.deepEqual((await db.query('select * from tasks order by id')).rows.slice(0, before.length), before);
        const item = (await db.query("select task_id from weekly_batch_items where definition_key='hollow-zero'")).rows[0];
        assert.equal(item.task_id, null);
    });

    await scenario('Deletion, rename, boot and explicit repetition never restore registered definitions', async () => {
        await createBatch(db);
        await db.exec(`update tasks set description='My renamed weekly',is_done=true,cover_url='https://example.com/cover.jpg',
            expiration_date='2099-12-12T15:30:00Z' where id=(select task_id from weekly_batch_items where definition_key='hollow-zero');
            delete from tasks where id=(select task_id from weekly_batch_items where definition_key='notorious-hunt');`);
        const before = (await db.query('select * from tasks order by id')).rows;
        assert.equal((await createBatch(db, { explicit: false })).created, 0);
        assert.equal((await createBatch(db)).created, 0);
        assert.deepEqual((await db.query('select * from tasks order by id')).rows, before);
        assert.equal((await db.query("select task_id from weekly_batch_items where definition_key='notorious-hunt'")).rows[0].task_id, null);
        await db.exec("delete from games where abbreviation='ZZZ'; insert into games(description,abbreviation) values ('Again','ZZZ');");
        assert.equal((await createBatch(db, { explicit: false })).created, 0);
    });

    await scenario('Overlapping RPC requests produce one batch in the disposable database', async () => {
        const results = await Promise.all([createBatch(db), createBatch(db)]);
        assert.deepEqual(results.map(result => result.created).sort(), [0, 2]);
        assert.equal((await db.query("select count(*)::int as n from weekly_batch_items where abbreviation='ZZZ'")).rows[0].n, 2);
    });

    await scenario('Explicit full reset clears every application table and allows initial weeklies again', async () => {
        await createBatch(db);
        await db.exec(`delete from tasks where id=(select task_id from weekly_batch_items where definition_key='hollow-zero');
            insert into event_candidates(source,external_id,name,status) values ('starrailassistant-hsr','reset-orphan','Orphan candidate','ignored');
            select reset_application_data();`);
        assert.deepEqual(await applicationSnapshot(db), { games: [], tasks: [], candidates: [], batches: [], items: [] });
        await db.exec(await readProjectFile('db/seed.sql'));
        for (const batch of WEEKLY_BATCHES) {
            const result = await createBatch(db, { abbreviation: batch.abbreviation, items: JSON.stringify(batch.definitions), explicit: false });
            assert.equal(result.created, { HSR: 2, WuWa: 2, ZZZ: 2 }[batch.abbreviation]);
        }
        assert.equal((await db.query('select count(*)::int as n from tasks')).rows[0].n, 6);
    });

    await scenario('Failure at the end of a full reset rolls back all deleted data and weekly decisions', async () => {
        await createBatch(db);
        await db.exec(`insert into event_candidates(source,external_id,name,status) values ('starrailassistant-hsr','reset-rollback','Preserved candidate','ignored');
            reset role;
            create function fail_game_reset() returns trigger language plpgsql as $$ begin
                raise exception 'Injected full reset failure'; end; $$;
            create trigger fail_game_reset before delete on games for each row execute function fail_game_reset();
            set local role anon; savepoint failed_reset;`);
        const before = await applicationSnapshot(db);
        await assert.rejects(db.query('select reset_application_data()'), /Injected full reset failure/);
        await db.exec('rollback to savepoint failed_reset');
        assert.deepEqual(await applicationSnapshot(db), before);
    });

    for (const [now, expected] of [
        ['2026-10-05T08:59:59.999Z', '2026-10-05T09:00:00.000Z'],
        ['2026-10-05T09:00:00Z', '2026-10-12T09:00:00.000Z'],
        ['2026-10-05T09:00:00.001Z', '2026-10-12T09:00:00.000Z'],
        ['2027-02-28T12:00:00Z', '2027-03-01T09:00:00.000Z'],
    ]) await scenario(`First deadline at ${now} is fixed UTC in any database timezone`, async () => {
        await db.exec("set local timezone='Pacific/Auckland';");
        assert.equal((await db.query('select next_weekly_deadline($1) as deadline', [now])).rows[0].deadline.toISOString(), expected);
    });

    for (const [name, setup, args, pattern] of [
        ['Missing game', "delete from games where abbreviation='ZZZ'", {}, /ausente ou ambígua/],
        ['Ambiguous game', "insert into games(abbreviation) values ('ZZZ')", {}, /ausente ou ambígua/],
        ['Wrong game ID', '', { id: 1 }, /não corresponde/],
        ['Repeated identity', '', { items: '[{"key":"x","description":"A"},{"key":"x","description":"B"}]' }, /inválidas ou repetidas/],
    ]) await scenario(`${name} rejects before task writes`, async () => {
        if (setup) await db.exec(setup);
        const before = (await db.query('select * from tasks order by id')).rows;
        await db.exec('savepoint rejected');
        await assert.rejects(createBatch(db, args), pattern);
        await db.exec('rollback to savepoint rejected');
        assert.deepEqual((await db.query('select * from tasks order by id')).rows, before);
    });

    await scenario('Second task failure rolls back the first task and batch; retry completes once', async () => {
        // The test injects a database failure after one real task insert.
        await db.exec(`reset role;
            create function fail_second_weekly() returns trigger language plpgsql as $$ begin
                if new.description='Notorious Hunt' then raise exception 'Injected second task failure'; end if;
                return new; end; $$;
            create trigger fail_second_weekly before insert on tasks for each row execute function fail_second_weekly();
            set local role anon; savepoint retry;`);
        const before = (await db.query('select * from tasks order by id')).rows;
        await assert.rejects(createBatch(db), /Injected second task failure/);
        await db.exec('rollback to savepoint retry');
        assert.deepEqual((await db.query('select * from tasks order by id')).rows, before);
        assert.equal((await db.query('select count(*)::int as n from weekly_batch_items')).rows[0].n, 0);
        await db.exec('reset role; drop trigger fail_second_weekly on tasks; set local role anon;');
        assert.equal((await createBatch(db)).created, 2);
        assert.equal((await createBatch(db)).created, 0);
    });

    await scenario('Denied task reads are errors, and roll back the batch decision without seeding', async () => {
        const before = (await db.query('select * from tasks order by id')).rows;
        const batches = (await db.query('select * from weekly_batches order by abbreviation')).rows;
        await db.exec('reset role; revoke select on tasks from anon; set local role anon; savepoint denied_read;');
        await assert.rejects(createBatch(db), /permission denied/);
        await db.exec('rollback to savepoint denied_read; reset role; grant select on tasks to anon; set local role anon;');
        assert.deepEqual((await db.query('select * from tasks order by id')).rows, before);
        assert.deepEqual((await db.query('select * from weekly_batches order by abbreviation')).rows, batches);
    });

    await scenario('HSR cleanup does not delete weeklies, and event decisions/links survive creation', async () => {
        await db.exec(`insert into event_candidates(source,external_id,name,game_id,proposed_end_at)
            select 'starrailassistant-hsr','preserved','Future event',id,'2099-01-01T09:00:00Z' from games where abbreviation='HSR';
            select import_event_candidates('starrailassistant-hsr');
            update tasks set is_done=true,cover_url='https://example.com/event.jpg',expiration_date='2099-02-02T09:00:00Z'
            where id in (select task_id from event_candidates where external_id='preserved');
            insert into event_candidates(source,external_id,name,game_id,status)
            select 'starrailassistant-hsr','ignored','Ignored',id,'ignored' from games where abbreviation='HSR';`);
        const candidates = (await db.query('select * from event_candidates order by id')).rows;
        const tasks = (await db.query('select * from tasks order by id')).rows;
        await createBatch(db, { abbreviation: 'HSR', items: JSON.stringify(WEEKLY_BATCHES[0].definitions) });
        await db.exec("update tasks set expiration_date='2025-01-01T09:00:00Z' where id in (select task_id from weekly_batch_items);");
        assert.equal((await db.query('select cleanup_expired_hsr_events() as n')).rows[0].n, 0);
        assert.deepEqual((await db.query('select * from event_candidates order by id')).rows, candidates);
        assert.deepEqual((await db.query('select * from tasks order by id')).rows.slice(0, tasks.length), tasks);
    });

    await t.test('Migration rerun preserves batch state, identities and all existing rows', async () => {
        for (const batch of WEEKLY_BATCHES) await createBatch(db, {
            abbreviation: batch.abbreviation, items: JSON.stringify(batch.definitions),
        });
        const snapshot = async () => (await db.query(`select jsonb_build_object('tasks',(select jsonb_agg(t order by id) from tasks t),
            'batches',(select jsonb_agg(b order by abbreviation) from weekly_batches b),
            'items',(select jsonb_agg(i order by abbreviation,definition_key) from weekly_batch_items i)) as data`)).rows[0].data;
        const before = await snapshot();
        await db.exec(await readProjectFile('db/migrations/2026-10-04-weekly-batches.sql'));
        assert.deepEqual(await snapshot(), before);
    });
});

test('Upgrade with only another game also persists explicit-only decisions for games added later', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    await db.exec("delete from games where abbreviation in ('HSR','WuWa','ZZZ');");
    await db.exec(await readProjectFile('db/migrations/2026-10-04-weekly-batches.sql'));
    await db.exec("insert into games(description,abbreviation) values ('Added later','ZZZ'); set role anon;");
    assert.deepEqual(await createBatch(db, { explicit: false }), { status: 'skipped', created: 0, preserved: 0 });
    assert.equal((await createBatch(db)).created, 2);
});

test('Managed weekly renewal skips missed cycles across DST independently of browser timezone', () => {
    for (const timezone of ['America/New_York', 'America/Sao_Paulo', 'Asia/Tokyo']) {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import { getNextRecurringDeadline } from './js/utils/dateUtils.js';
            console.log(getNextRecurringDeadline('2026-10-26T09:00:00Z',7,new Date('2026-11-16T09:00:00Z'),{utc:true}).toISOString());
        `], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), '2026-11-23T09:00:00.000Z');
    }
    assert.equal(getNextRecurringDeadline('2026-10-05T15:30:00Z', 7, new Date('2026-10-06T09:00:00Z'), { utc: true }).toISOString(),
        '2026-10-12T15:30:00.000Z', 'A manual deadline retains its chosen time');
});
