import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventGame } from '../js/events/eventGames.js';
import { normalizeStarRailAssistantActivities } from '../js/events/starRailAssistant.js';
import { candidateFromActivity, reconcileCandidate } from '../scripts/syncGenshinEvents.js';

const now = Date.parse('2026-10-02T12:00:00Z');
const edition = (name, startTime, endTime, cover = '') => ({ name, startTime, endTime, cover });

test('HSR keeps current and upcoming editions of the same mode separate', () => {
    const { events } = normalizeStarRailAssistantActivities({ activities: [
        edition('Apocalyptic Shadow: Celestial Lupine', '2026-08-31T04:00:00', '2026-10-05T03:59:59'),
        edition('Apocalyptic Shadow: Dominance of Oblivion', '2026-10-05T04:00:00', '2026-11-16T03:59:59'),
        edition('Pure Fiction: Domain Genesis', '2026-09-14T04:00:00', '2026-10-19T03:59:59'),
        edition('Memory of Chaos: Crossing the Afterlife', '2026-09-28T11:00:00', '2026-11-02T03:59:59'),
    ] }, now);
    const candidates = events.map(event => candidateFromActivity(event, getEventGame('hsr'), 2));
    assert.equal(candidates.length, 4);
    assert.equal(new Set(candidates.map(row => row.external_id)).size, 4);
    assert.ok(candidates.every(row => row.game_id === 2 && row.source === 'starrailassistant-hsr'));
    assert.equal(candidates[1].proposed_start_at, '2026-10-05T09:00:00.000Z');
    assert.equal(candidates[1].proposed_end_at, '2026-11-16T08:59:59.000Z');
});

test('Asia fallback prefills HSR deadlines and empty covers remain optional', () => {
    const { events } = normalizeStarRailAssistantActivities({ activities: [
        edition('Astral Slammers Squad!', '2026-09-28T11:00:00', '2026-11-11T05:59:59'),
    ] }, now);
    assert.equal(events[0].proposedEndAt, '2026-11-10T21:59:59.000Z');
    assert.equal(events[0].coverUrl, null);
    assert.match(events[0].reviewReason, /Ásia/);
});

test('expired Asia dates are kept until the America deadline passes', () => {
    const { events, skipped } = normalizeStarRailAssistantActivities({ activities: [
        edition('America still open', '2026-09-01T04:00:00', '2026-10-02T03:59:59'),
        edition('Expired edition', '2026-08-01T04:00:00', '2026-09-30T03:59:59'),
    ] }, Date.parse('2026-10-02T07:00:00Z'));
    assert.equal(events.length, 1);
    assert.equal(skipped, 1);
});

test('HSR sync updates the same edition and preserves an ignored status', () => {
    const event = normalizeStarRailAssistantActivities({ activities: [
        edition('Pure Fiction: Domain Genesis', '2026-09-14T04:00:00', '2026-10-19T03:59:59'),
    ] }, now).events[0];
    const candidate = candidateFromActivity(event, getEventGame('hsr'), 2);
    const result = reconcileCandidate({ ...candidate, status: 'ignored', is_active: true },
        { ...candidate, cover_url: 'https://example.com/new.jpg' }, new Date(now).toISOString());
    assert.equal(result.status, 'ignored');
    assert.equal(result.external_id, candidate.external_id);
    assert.equal(result.game_id, 2);
});
