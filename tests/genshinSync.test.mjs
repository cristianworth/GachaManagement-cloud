import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidate } from '../scripts/syncGenshinEvents.js';

const candidate = {
    source: 'ennead-genshin-calendar', external_id: '446', name: 'Silverwing',
    type_name: 'ActTypeOther', source_start_at: '2026-09-24T02:00:00.000Z',
    source_end_at: '2026-10-11T19:59:59.000Z',
    proposed_end_at: '2026-10-12T08:59:59.000Z', review_reason: null,
};

test('a new candidate is pending and keeps its source identity', () => {
    const result = reconcileCandidate(null, candidate, '2026-09-29T00:00:00Z');
    assert.equal(result.status, 'pending');
    assert.equal(result.external_id, '446');
});

test('a changed deadline reopens an approved candidate without replacing its task link', () => {
    const previous = { ...candidate, id: 1, task_id: 9, status: 'approved', is_active: true };
    const result = reconcileCandidate(previous, {
        ...candidate,
        source_end_at: '2026-10-12T19:59:59.000Z',
        proposed_end_at: '2026-10-13T08:59:59.000Z',
    }, '2026-09-30T00:00:00Z');
    assert.equal(result.status, 'pending');
    assert.match(result.review_reason, /prazo mudou/);
    assert.equal(result.task_id, undefined);
});

test('an unchanged approved candidate remains approved', () => {
    const result = reconcileCandidate({
        ...candidate,
        source_end_at: '2026-10-11T19:59:59+00:00',
        proposed_end_at: '2026-10-12T08:59:59+00:00',
        status: 'approved',
        is_active: true,
    }, candidate, '2026-09-30T00:00:00Z');
    assert.equal(result.status, 'approved');
    assert.equal(result.changed, false);
});
