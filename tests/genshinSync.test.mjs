import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateFromActivity, reconcileCandidate } from '../scripts/syncGenshinEvents.js';

const candidate = {
    source: 'starrailassistant-genshin', external_id: 'silverwing', name: 'Silverwing',
    type_name: 'ActTypeOther', source_start_at: '2026-09-24T02:00:00.000Z',
    source_end_at: '2026-10-11T19:59:59.000Z',
    proposed_end_at: '2026-10-12T08:59:59.000Z', review_reason: null,
};

test('a new candidate is pending and keeps its source identity', () => {
    const result = reconcileCandidate(null, candidate, '2026-09-29T00:00:00Z');
    assert.equal(result.status, 'pending');
    assert.equal(result.external_id, 'silverwing');
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

test('improving a proposal without a new source deadline does not reopen an approved task', () => {
    const result = reconcileCandidate({
        ...candidate,
        proposed_end_at: null,
        status: 'approved',
        is_active: true,
    }, candidate, '2026-09-30T00:00:00Z');
    assert.equal(result.status, 'approved');
    assert.equal(result.changed, true);
});

test('an ignored event stays ignored when its dates change', () => {
    const previous = { ...candidate, status: 'ignored', is_active: true };
    const result = reconcileCandidate(previous, {
        ...candidate,
        source_end_at: '2026-11-03T19:59:59.000Z',
        proposed_end_at: '2026-11-04T08:59:59.000Z',
    }, '2026-09-30T00:00:00Z');
    assert.equal(result.status, 'ignored');
    assert.equal(result.review_reason, null);
});

test('adopts an approved legacy candidate without resetting its status or task link', () => {
    const previous = {
        ...candidate,
        source: 'ennead-genshin-calendar',
        external_id: '446',
        id: 2,
        task_id: 16,
        status: 'approved',
        is_active: true,
    };
    const result = reconcileCandidate(previous, candidate, '2026-09-30T00:00:00Z');
    assert.equal(result.source, 'starrailassistant-genshin');
    assert.equal(result.status, 'approved');
    assert.equal(result.changed, true);
    assert.equal(result.task_id, undefined);
});

test('uses the normalized name as a key so a changed date updates the same candidate', () => {
    const first = candidateFromActivity({
        name: 'Silverwing in Pursuit of the Moon',
        sourceStartAt: '2026-09-24T02:00:00Z',
        sourceEndAt: '2026-10-11T19:59:59Z',
        proposedEndAt: '2026-10-12T08:59:59Z',
        reviewReason: null,
    });
    const changed = candidateFromActivity({
        name: 'Silverwing in Pursuit of the Moon',
        sourceStartAt: '2026-09-24T02:00:00Z',
        sourceEndAt: '2026-10-12T19:59:59Z',
        proposedEndAt: '2026-10-13T08:59:59Z',
        reviewReason: null,
    });
    assert.equal(first.external_id, changed.external_id);
});

test('stores the source cover and updates it without reopening an approved deadline', () => {
    const activity = {
        name: 'Silverwing',
        sourceStartAt: candidate.source_start_at,
        sourceEndAt: candidate.source_end_at,
        proposedEndAt: candidate.proposed_end_at,
        coverUrl: 'https://example.com/cover.png',
        reviewReason: null,
    };
    const next = reconcileCandidate({ ...candidate, status: 'approved', cover_url: null },
        candidateFromActivity(activity), '2026-09-30T00:00:00Z');
    assert.equal(next.cover_url, activity.coverUrl);
    assert.equal(next.status, 'approved');
    assert.equal(next.changed, true);
});
