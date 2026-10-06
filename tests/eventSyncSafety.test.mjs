import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVENT_GAMES } from '../js/events/eventGames.js';
import { normalizeStarRailAssistantActivities as normalize } from '../js/events/starRailAssistant.js';
import { syncGameEvents } from '../scripts/eventSync.js';
import { runSync } from '../scripts/syncEvents.js';

const now = Date.parse('2026-10-03T12:00:00Z');
const event = { name: 'Current', startTime: '2026-10-01T04:00:00', endTime: '2026-10-20T03:59:59' };
const failures = [
    ['HTTP failure', () => new Response('Unavailable', { status: 503 }), /HTTP 503/],
    ['invalid JSON', () => new Response('{'), /JSON/],
    ['invalid calendar', () => new Response('{}'), /activities array/],
    ['empty calendar', () => new Response('{"activities":[]}'), /no current events/],
    ['expired calendar', () => new Response(JSON.stringify({ activities: [{ ...event, endTime: '2020-01-01T03:59:59' }] })), /no current events/],
    ['ambiguous names', () => new Response(JSON.stringify({ activities: [event, { ...event, name: ' Current ' }] })), /repeated activity names/],
];

for (const game of EVENT_GAMES) for (const rows of [[], [{ id: 1 }, { id: 2 }]]) {
    test(`${game.abbreviation} refuses ${rows.length} registered matches without writes`, async t => {
        t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
            assert.equal(options.method, undefined);
            const url = new URL(input);
            if (url.href === game.url) return new Response(JSON.stringify({ activities: [event] }));
            assert.equal(url.pathname, '/rest/v1/games');
            return new Response(JSON.stringify(rows));
        });
        await assert.rejects(syncGameEvents(game, { now }), /Expected one registered game/);
    });
}

for (const game of EVENT_GAMES) for (const [label, response, message] of failures) {
    test(`${game.abbreviation} ${label} cannot mutate candidates or tasks`, async t => {
        const mutations = [];
        t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
            if (options.method && options.method !== 'GET') mutations.push(input);
            const url = new URL(input);
            if (url.href === game.url) return response();
            assert.equal(url.pathname, '/rest/v1/games');
            return new Response('[{"id":7}]');
        });
        await assert.rejects(syncGameEvents(game, { now }), message);
        assert.deepEqual(mutations, []);
    });
}

test('Missing candidates become inactive without deleting tasks; sync shares one clock', async t => {
    const game = EVENT_GAMES[2];
    const writes = [];
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
        const url = new URL(input);
        if (url.href === game.url) return new Response(JSON.stringify({ activities: [event] }));
        if (url.pathname.endsWith('/games')) return new Response('[{"id":7}]');
        if (url.pathname.endsWith('/event_candidates') && !options.method) {
            return new Response(JSON.stringify([{ id: 99, source: game.source, external_id: 'absent', name: 'Absent', is_active: true, task_id: 55 }]));
        }
        const body = JSON.parse(options.body);
        writes.push({ path: url.pathname, id: url.searchParams.get('id'), method: options.method, body });
        assert.notEqual(options.method, 'DELETE');
        assert.ok(!url.pathname.endsWith('/tasks'));
        return new Response(JSON.stringify(url.pathname.endsWith('/cleanup_expired_imported_events') ? 0 : {}));
    });
    const result = await syncGameEvents(game, { now });
    assert.equal(result.new, 1);
    assert.equal(result.inactive, 1);
    assert.equal(writes.find(row => row.method === 'POST' && row.path.endsWith('/event_candidates')).body.last_seen_at,
        '2026-10-03T12:00:00.000Z');
    assert.deepEqual(writes.find(row => row.id === 'eq.99').body, { is_active: false });
});

test('One failed game does not stop other games or conceal the failure', async t => {
    t.mock.method(console, 'error', () => {});
    const calls = [];
    const results = await runSync([], async game => {
        calls.push(game.key);
        if (game.key === 'hsr') throw new Error('Source unavailable');
        return { gameKey: game.key };
    });
    assert.deepEqual(calls, ['genshin', 'hsr', 'zzz', 'wuwa', 'nte']);
    assert.deepEqual(results.map(row => row.ok), [true, false, true, true, true]);
    assert.equal(results[1].error.message, 'Source unavailable');
});

test('CLI validates targets and propagates dry-run without activating planned sources', async () => {
    const calls = [];
    const sync = async (game, options) => calls.push([game.key, options]);
    for (const args of [['--game=not-supported'], ['--unknown'], ['--game=hsr', '--game=zzz']]) {
        await assert.rejects(runSync(args, sync));
    }
    assert.deepEqual(calls, []);
    await runSync(['--game=zzz', '--dry-run'], sync);
    assert.deepEqual(calls, [['zzz', { dryRun: true }]]);
});

test('The command-line entry point exits with failure for invalid or planned targets', () => {
    for (const argument of ['--game=not-supported', '--unknown']) {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/syncEvents.js', import.meta.url)), argument], { encoding: 'utf8' });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Unsupported event game|Unknown sync argument/);
    }
});

test('Impossible calendar dates stay in review instead of rolling into the next month', () => {
    for (const value of ['2026-02-30T03:59:59', '2026-02-29T03:59:59', '2026-04-31T03:59:59', '2026-01-01T24:00:00']) {
        const { events } = normalize({ activities: [{ ...event, endTime: value }] }, now);
        assert.equal(events[0].sourceEndAt, null);
        assert.equal(events[0].proposedEndAt, null);
        assert.match(events[0].reviewReason, /final ausente/);
    }
    const { events } = normalize({ activities: [{ ...event, startTime: '2028-02-01T04:00:00', endTime: '2028-02-29T03:59:59' }] }, now);
    assert.equal(events[0].proposedEndAt, '2028-02-29T08:59:59.000Z');
});

test('Expiration retains the America reset until its precise boundary', () => {
    const calendar = { activities: [event] };
    const deadline = Date.parse('2026-10-20T08:59:59Z');
    assert.equal(normalize(calendar, deadline - 1).events.length, 1);
    assert.equal(normalize(calendar, deadline).events.length, 0);
});
