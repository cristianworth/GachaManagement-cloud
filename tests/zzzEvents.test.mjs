import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventGame } from '../js/events/eventGames.js';
import { normalizeStarRailAssistantActivities } from '../js/events/starRailAssistant.js';
import { candidateFromActivity, syncGameEvents } from '../scripts/eventSync.js';

// Snapshot of the English endpoint retrieved on 2026-10-02.
const calendar = JSON.parse(readFileSync(new URL('./fixtures/zzz-en-US.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-02T12:00:00Z');
const game = getEventGame('zzz');

test('ZZZ source snapshot keeps current and upcoming events with distinct keys', () => {
    const { events, skipped } = normalizeStarRailAssistantActivities(calendar, now);
    const candidates = events.map(event => candidateFromActivity(event, game, 42));
    assert.equal(skipped, 2);
    assert.equal(candidates.length, 10);
    assert.equal(new Set(candidates.map(row => row.external_id)).size, 10);
    assert.ok(candidates.every(row => row.source === 'starrailassistant-zzz' && row.game_id === 42));
    assert.equal(candidates.filter(row => Date.parse(row.proposed_start_at) > now).length, 2);
    assert.equal(candidates.filter(row => row.cover_url === null).length, 6);
});

test('ZZZ reset deadlines use the America proposal and other times retain the Asia instant', () => {
    const { events } = normalizeStarRailAssistantActivities(calendar, now);
    const reset = events.find(event => event.name === 'All-New Program');
    assert.equal(reset.sourceEndAt, '2026-10-19T19:59:59.000Z');
    assert.equal(reset.proposedEndAt, '2026-10-20T08:59:59.000Z');
    const fallback = events.find(event => event.name === 'Potential Hypothesis: Reforged in Fire');
    assert.equal(fallback.proposedEndAt, '2026-10-20T22:00:00.000Z');
    assert.match(fallback.reviewReason, /Ásia/);
    const upcoming = events.find(event => event.name === 'Data Bounty: Combat Simulation');
    assert.equal(upcoming.proposedStartAt, '2026-10-14T09:00:00.000Z');
});

test('ZZZ can be inspected without reading or writing the database', async t => {
    let requests = 0;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'table', () => {});
    t.mock.method(globalThis, 'fetch', async input => {
        assert.equal(String(input), game.url);
        requests++;
        return new Response(JSON.stringify(calendar));
    });
    await syncGameEvents(game, { dryRun: true });
    assert.equal(requests, 1);
});

test('ZZZ refuses ambiguous repeated names before writing to the database', async t => {
    const activity = { name: 'Repeated event', startTime: '', endTime: '2099-10-20T03:59:59' };
    t.mock.method(globalThis, 'fetch', async input => {
        assert.equal(String(input), game.url);
        return new Response(JSON.stringify({ activities: [activity, { ...activity }] }));
    });
    await assert.rejects(syncGameEvents(game, { dryRun: true }), /repeated activity names/);
});
