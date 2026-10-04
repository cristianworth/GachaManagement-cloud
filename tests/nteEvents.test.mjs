import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStarRailAssistantActivities as normalize } from '../js/events/starRailAssistant.js';
import { resolveNteTimes } from '../js/events/nte.js';
import { getEventGame } from '../js/events/eventGames.js';
import { syncGameEvents } from '../scripts/eventSync.js';
import { createTestDatabase } from './helpers/testDatabase.mjs';
import { mockDatabaseFetch } from './helpers/databaseFetch.mjs';

const calendar = JSON.parse(readFileSync(new URL('./fixtures/nte-en-US.json', import.meta.url)));
const contract = JSON.parse(readFileSync(new URL('./fixtures/nte-source-contract.json', import.meta.url)));
const now = Date.parse('2026-10-04T12:00:00Z');
const game = getEventGame('nte');
const convert = (data = calendar, clock = now) => normalize(data, clock, { resolveTimes: resolveNteTimes });
const expectations = [
    ['Circle Gifts', '2026-09-30T03:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Pukaland Travelogue', '2026-09-30T03:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Born to Race', '2026-09-30T03:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Everdriving', '2026-09-30T03:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Terminal Depths', '2026-09-30T03:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Circle Bounty', '2026-09-30T03:00:00.000Z', '2026-11-10T15:59:59.000Z'],
    ['Stamina Recharge', '2026-10-05T10:00:00.000Z', '2026-10-19T09:59:59.000Z'],
    ["Coal Lump's Treasure", '2026-10-08T02:00:00.000Z', '2026-11-10T21:59:59.000Z'],
    ['Pixel Surge', '2026-10-19T10:00:00.000Z', '2026-10-26T09:59:59.000Z'],
];

for (const [name, start, end] of expectations) test(`NTE ${name} matches the global notice and its explicit field offsets`, () => {
    const source = calendar.activities.find(row => row.name === name);
    const evidence = contract.events.find(row => row.name === name);
    assert.equal(calendar.version, contract.version);
    assert.equal(source.startTime.slice(0, 16), evidence.start);
    assert.equal(source.endTime.slice(0, 16), evidence.end);
    const event = convert().events.find(row => row.name === name);
    assert.equal(event.proposedStartAt, start);
    assert.equal(event.proposedEndAt, end);
    assert.equal(event.reviewReason, null);
});

test('Fixed UTC+8 NTE deadlines expire immediately, without the 13-hour America grace period', () => {
    const data = { activities: [calendar.activities[0]] };
    const deadline = Date.parse('2026-11-10T21:59:59Z');
    assert.equal(convert(data, deadline - 1).events.length, 1);
    assert.equal(convert(data, deadline).events.length, 0);
});

test('Server-time NTE deadlines remain until the exact America reset boundary', () => {
    const data = { activities: [calendar.activities[6]] };
    const deadline = Date.parse('2026-10-19T09:59:59Z');
    assert.equal(convert(data, deadline - 1).events.length, 1);
    assert.equal(convert(data, deadline).events.length, 0);
});

test('New NTE editions and unverified date corrections cannot inherit a clock silently', () => {
    for (const changes of [{ name: 'Unknown event' }, { endTime: '2026-11-12T05:59:59' },
        { startTime: '2027-01-01T11:00:00', endTime: '2027-02-01T05:59:59' }]) {
        const event = convert({ activities: [{ ...calendar.activities[0], ...changes }] }).events[0];
        assert.equal(event.proposedStartAt, null);
        assert.equal(event.proposedEndAt, null);
        assert.match(event.reviewReason, /Game8/);
    }
});

test('Missing, invalid and inconsistent NTE periods stay in review', () => {
    for (const changes of [{ startTime: null }, { endTime: null }, { endTime: '2026-02-30T05:59:59' },
        { endTime: 42 }, { startTime: {} }, { startTime: '2026-11-15T11:00:00' }]) {
        const event = convert({ activities: [{ ...calendar.activities[0], ...changes }] }).events[0];
        assert.equal(event.proposedEndAt, null);
        assert.ok(event.reviewReason);
    }
});

test('NTE real sync and PostgreSQL preserve completion, manual corrections, ignore and game isolation', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    t.mock.method(console, 'log', () => {});
    let data = structuredClone(calendar);
    mockDatabaseFetch(t, db, game, () => data);
    const preservedTasks = (await db.query('select * from public.tasks order by id')).rows;
    const sync = () => syncGameEvents(game, { now });
    assert.equal((await sync()).tasks.imported, 9);
    const first = (await db.query("select * from public.event_candidates where name='Circle Gifts'")).rows[0];
    await db.query('update public.tasks set is_done=true where id=$1', [first.task_id]);
    data.version = 'same-activity-next-version';
    assert.equal((await sync()).new, 0);
    assert.equal((await db.query('select is_done from public.tasks where id=$1', [first.task_id])).rows[0].is_done, true);
    await db.query("update public.tasks set expiration_date='2026-11-12T12:00:00Z' where id=$1", [first.task_id]);
    assert.equal((await sync()).tasks.manual, 1);
    assert.equal((await db.query('select expiration_date from public.tasks where id=$1', [first.task_id])).rows[0].expiration_date.toISOString(), '2026-11-12T12:00:00.000Z');
    const other = (await db.query("select * from public.event_candidates where name='Pukaland Travelogue'")).rows[0];
    data.activities.find(row => row.name === other.name).endTime = '2026-11-12T05:59:59';
    assert.equal((await sync()).new, 0, 'Correction keeps the persisted edition key');
    const unverified = (await db.query('select * from public.event_candidates where id=$1', [other.id])).rows[0];
    assert.equal(unverified.status, 'pending');
    assert.equal(unverified.task_id, other.task_id);
    assert.equal((await db.query('select expiration_date from public.tasks where id=$1', [other.task_id])).rows[0].expiration_date.toISOString(), '2026-11-10T21:59:59.000Z');
    await db.query('select public.ignore_imported_task($1)', [first.task_id]);
    assert.equal((await sync()).new, 0);
    assert.equal((await db.query('select status from public.event_candidates where id=$1', [first.id])).rows[0].status, 'ignored');
    const before = (await db.query('select count(*)::integer as count from public.event_candidates')).rows[0].count;
    data.activities = [{ ...calendar.activities[0], startTime: '2027-01-01T11:00:00', endTime: '2027-02-01T05:59:59' }];
    assert.equal((await sync()).new, 1, 'New disjoint edition gets a separate candidate');
    assert.equal((await db.query('select count(*)::integer as count from public.event_candidates')).rows[0].count, before + 1);
    const next = (await db.query('select * from public.event_candidates order by id desc limit 1')).rows[0];
    assert.equal(next.status, 'pending');
    assert.equal(next.task_id, null, 'Unverified future edition is not auto-imported');
    await db.query('select public.approve_event_candidate($1,$2)', [next.id, '2027-02-01T12:00:00Z']);
    const linked = (await db.query('select t.* from public.tasks t join public.event_candidates c on c.task_id=t.id where c.id=$1', [next.id])).rows[0];
    assert.equal(linked.is_done, false, 'New edition does not inherit previous completion');
    assert.notEqual(linked.id, first.task_id);
    assert.deepEqual((await db.query('select * from public.tasks where refresh_type <> 0 order by id')).rows, preservedTasks);
});
