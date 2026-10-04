import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStarRailAssistantActivities as normalize } from '../js/events/starRailAssistant.js';
import { resolveWuwaTimes } from '../js/events/wuwa.js';
import { getEventGame } from '../js/events/eventGames.js';
import { assignEditionKeys, candidateFromActivity, syncGameEvents } from '../scripts/eventSync.js';
import { createTestDatabase } from './helpers/testDatabase.mjs';
import { mockDatabaseFetch } from './helpers/databaseFetch.mjs';

const calendar = JSON.parse(readFileSync(new URL('./fixtures/ww-en-US.json', import.meta.url)));
const now = Date.parse('2026-10-03T12:00:00Z');
const game = getEventGame('wuwa');
const convert = (data = calendar, clock = now) => normalize(data, clock, { resolveTimes: resolveWuwaTimes });
const candidate = (name, start, end) => candidateFromActivity({ name, sourceStartAt: start, sourceEndAt: end }, game, 4);

for (const [name, start, end] of [
    ['Cubie Wars', '2026-09-30T03:00:00.000Z', '2026-11-11T16:59:59.000Z'],
    ['Dreams in the Capsule', '2026-09-30T03:00:00.000Z', '2026-11-11T08:59:59.000Z'],
    ['Gifts of Waking Moon', '2026-09-30T03:00:00.000Z', '2026-11-11T08:59:59.000Z'],
    ["Artisan's Search", '2026-10-08T09:00:00.000Z', '2026-10-26T08:59:59.000Z'],
    ['Bountiful Crescendo', '2026-10-15T09:00:00.000Z', '2026-10-22T08:59:59.000Z'],
    ['Echo Erase', '2026-10-22T15:00:00.000Z', '2026-11-09T08:59:59.000Z'],
    ['Gifts of Singing Drizzle', '2026-10-22T15:00:00.000Z', '2026-11-11T08:59:59.000Z'],
    ['Beyond the Waves: Land of Xuanfang', '2026-10-29T09:00:00.000Z', '2026-11-11T08:59:59.000Z'],
    ['Chord Cleansing', '2026-11-04T09:00:00.000Z', '2026-11-11T08:59:59.000Z'],
]) test(`WuWa ${name} converts each field using its verified clock`, () => {
    const event = convert().events.find(row => row.name === name);
    assert.equal(event.proposedStartAt, start);
    assert.equal(event.proposedEndAt, end);
    assert.equal(event.reviewReason, null);
});

test('Moonlit Path uses the America reset estimate explicitly accepted by Cristian', () => {
    const event = convert().events.find(row => row.name === 'Moonlit Path');
    assert.equal(event.proposedStartAt, '2026-09-30T03:00:00.000Z');
    assert.equal(event.proposedEndAt, '2026-11-11T08:59:59.000Z');
    assert.equal(event.reviewReason, null);
});

test('Unverified WuWa editions keep raw dates but cannot auto-import guessed deadlines', () => {
    const event = convert({ activities: [{ ...calendar.activities[3], name: 'Unknown event' }] }).events[0];
    assert.equal(event.sourceEndAt, '2026-11-10T19:59:59.000Z');
    assert.equal(event.proposedStartAt, null);
    assert.equal(event.proposedEndAt, null);
    assert.match(event.reviewReason, /Game8/);
    assert.equal(candidateFromActivity(event, game).proposed_start_at, null);
    const future = structuredClone(calendar);
    future.activities = [{ ...calendar.activities[0], startTime: '2027-01-01T11:00:00', endTime: '2027-02-01T11:59:59' }];
    assert.equal(convert(future).events[0].proposedEndAt, null, 'A future version is not implicitly validated');
});

test('A validated non-reset deadline expires precisely at the America boundary', () => {
    const data = { activities: [calendar.activities[0]] };
    const deadline = Date.parse('2026-11-11T16:59:59Z');
    assert.equal(convert(data, deadline - 1).events.length, 1);
    assert.equal(convert(data, deadline).events.length, 0);
});

test('Missing, impossible and reversed dates cannot become WuWa tasks', () => {
    for (const changes of [{ endTime: null }, { startTime: null }, { endTime: 42 }, { startTime: {} }, { endTime: '2026-02-30T03:59:59' },
        { startTime: '2026-11-20T04:00:00', endTime: '2026-11-11T03:59:59' }]) {
        const data = { activities: [{ ...calendar.activities[9], ...changes }] };
        const event = convert(data).events[0];
        assert.equal(event.proposedEndAt, null);
        assert.ok(event.reviewReason);
    }
});

test('Overlapping date corrections reuse the persisted edition key', () => {
    const old = candidate('Chord Cleansing', '2026-11-04T00:00:00Z', '2026-11-11T00:00:00Z');
    const edited = candidate(' Chord Cleansing ', '2026-11-05T00:00:00Z', '2026-11-12T00:00:00Z');
    assert.notEqual(edited.external_id, old.external_id);
    assignEditionKeys([edited], [{ ...old, id: 1, task_id: 2, status: 'ignored' }]);
    assert.equal(edited.external_id, old.external_id);
});

test('Disjoint occurrences of the same name retain distinct edition keys', () => {
    const old = candidate('Bountiful Crescendo', '2026-02-19T00:00:00Z', '2026-02-26T00:00:00Z');
    const next = candidate('Bountiful Crescendo', '2026-04-02T00:00:00Z', '2026-04-09T00:00:00Z');
    assignEditionKeys([next], [{ ...old, status: 'ignored' }]);
    assert.notEqual(next.external_id, old.external_id);
});

test('Ambiguous matching editions are rejected before writing', () => {
    const old = candidate('Chord Cleansing', '2026-11-04T00:00:00Z', '2026-11-11T00:00:00Z');
    const other = { ...old, external_id: 'second-key' };
    assert.throws(() => assignEditionKeys([{ ...old }], [old, other]), /Ambiguous edition/);
    assert.throws(() => assignEditionKeys([{ ...old }, { ...old, external_id: 'correction' }], [old]), /ambiguous editions/);
});

test('Two disjoint editions of the same mode can appear in one calendar', async t => {
    t.mock.method(console, 'table', () => {});
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(String(url), game.url);
        return new Response(JSON.stringify({ activities: [
            { name: 'Chord Cleansing', startTime: '2026-11-04T04:00:00', endTime: '2026-11-11T03:59:59' },
            { name: 'Chord Cleansing', startTime: '2026-11-20T04:00:00', endTime: '2026-11-27T03:59:59' },
        ] }));
    });
    const result = await syncGameEvents(game, { now, dryRun: true });
    assert.equal(result.candidates.length, 2);
    assert.notEqual(result.candidates[0].external_id, result.candidates[1].external_id);
});

test('Ambiguous stored editions abort the real sync path without mutations', async t => {
    let writes = 0;
    const activity = calendar.activities[9];
    t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
        if (options.method) writes++;
        const url = new URL(input);
        if (url.href === game.url) return new Response(JSON.stringify({ activities: [activity] }));
        if (url.pathname.endsWith('/games')) return new Response('[{"id":4}]');
        assert.equal(url.pathname, '/rest/v1/event_candidates');
        const normalized = candidateFromActivity(convert({ activities: [activity] }).events[0], game, 4);
        return new Response(JSON.stringify([normalized, { ...normalized, external_id: 'ambiguous-key' }]));
    });
    await assert.rejects(syncGameEvents(game, { now }), /Ambiguous edition/);
    assert.equal(writes, 0);
});

test('WuWa sync preserves decisions across corrections and isolates the next edition in PostgreSQL', async t => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    t.mock.method(console, 'log', () => {});
    const clock = Date.parse('2036-01-01T12:00:00Z');
    let data = { version: 'future', activities: [{ name: 'Bountiful Crescendo', startTime: '2036-01-02T04:00:00', endTime: '2036-01-09T03:59:59' }] };
    mockDatabaseFetch(t, db, game, () => data);
    const sync = () => syncGameEvents(game, { now: clock });
    assert.equal((await sync()).tasks.imported, 1);
    let rows = (await db.query('select * from public.event_candidates')).rows;
    const original = rows[0];
    await db.query('update public.tasks set is_done = true where id=$1', [original.task_id]);
    data.activities[0].startTime = '2036-01-03T04:00:00';
    data.activities[0].endTime = '2036-01-10T03:59:59';
    assert.equal((await sync()).tasks.updated, 1);
    rows = (await db.query('select * from public.event_candidates')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].external_id, original.external_id);
    assert.equal(rows[0].task_id, original.task_id);
    assert.equal((await db.query('select is_done from public.tasks where id=$1', [original.task_id])).rows[0].is_done, true);
    await db.query("update public.tasks set expiration_date='2036-01-11T09:00:00Z' where id=$1", [original.task_id]);
    data.version = 'different-version';
    assert.equal((await sync()).tasks.manual, 1);
    assert.equal((await db.query('select expiration_date from public.tasks where id=$1', [original.task_id])).rows[0].expiration_date.toISOString(), '2036-01-11T09:00:00.000Z');
    await db.query('select public.ignore_imported_task($1)', [original.task_id]);
    assert.equal((await sync()).new, 0);
    data.activities[0].startTime = '2036-02-01T04:00:00';
    data.activities[0].endTime = '2036-02-08T03:59:59';
    assert.equal((await sync()).tasks.imported, 1);
    rows = (await db.query('select * from public.event_candidates order by id')).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, 'ignored');
    assert.equal(rows[0].is_active, false);
    assert.notEqual(rows[1].task_id, original.task_id);
    assert.equal((await db.query('select is_done from public.tasks where id=$1', [rows[1].task_id])).rows[0].is_done, false);
    assert.equal((await sync()).new, 0);
    assert.equal((await db.query('select count(*)::integer as count from public.tasks where refresh_type=0')).rows[0].count, 1);
});
