import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStarRailAssistantGenshin } from '../js/events/starRailAssistantGenshin.js';
import { compareGenshinEvents } from '../scripts/previewStarRailAssistantGenshin.js';

test('converts the known America deadline and otherwise keeps the Asia instant as a usable proposal', () => {
    const { events } = normalizeStarRailAssistantGenshin({ activities: [
        {
            name: 'Silverwing in Pursuit of the Moon',
            startTime: '2026-09-24T10:00:00',
            endTime: '2026-10-12T03:59:59',
            cover: 'https://example.com/silverwing.png',
        },
        {
            name: 'Tabletop Troupe: A Gathering on Adventure\'s Eve',
            startTime: '2026-09-23T11:00:00',
            endTime: '2026-11-03T14:59:59',
        },
    ] }, Date.parse('2026-09-30T00:00:00Z'));

    assert.equal(events[0].sourceEndAt, '2026-10-11T19:59:59.000Z');
    assert.equal(events[0].proposedEndAt, '2026-10-12T08:59:59.000Z');
    assert.equal(events[0].coverUrl, 'https://example.com/silverwing.png');
    assert.equal(events[1].proposedEndAt, '2026-11-03T06:59:59.000Z');
    assert.equal(new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(events[1].proposedEndAt)), '03:59:59');
    assert.match(events[1].reviewReason, /horário informado para Ásia/);
});

test('prefills the end even when the start is missing, but leaves an absent end for manual review', () => {
    const { events } = normalizeStarRailAssistantGenshin({ activities: [
        { name: 'End only', endTime: '2026-11-03T14:59:59' },
        { name: 'Missing end', startTime: '2026-10-01T10:00:00' },
    ] }, Date.parse('2026-09-30T00:00:00Z'));
    assert.equal(events[0].proposedEndAt, '2026-11-03T06:59:59.000Z');
    assert.match(events[0].reviewReason, /início ausente/);
    assert.equal(events[1].proposedEndAt, null);
    assert.match(events[1].reviewReason, /final ausente/);
});

test('recognizes an approved task through its candidate link without creating a new suggestion', () => {
    const event = {
        name: 'Silverwing in Pursuit of the Moon',
        sourceEndAt: '2026-10-11T19:59:59.000Z',
        proposedEndAt: '2026-10-12T08:59:59.000Z',
    };
    const result = compareGenshinEvents([event], [{
        id: 12,
        name: event.name,
        task_id: 31,
        status: 'approved',
        source_end_at: event.sourceEndAt,
    }], [{
        id: 31,
        description: 'Pursuit of the Moon',
        expiration_date: event.proposedEndAt,
    }])[0];

    assert.equal(result.classification, 'tarefa já cadastrada');
    assert.deepEqual(result.taskIds, [31]);
    assert.deepEqual(result.candidateStatuses, ['12:approved']);
});

test('shows a source deadline disagreement for review', () => {
    const result = compareGenshinEvents([{
        name: 'Silverwing',
        sourceEndAt: '2026-10-11T19:59:59.000Z',
        proposedEndAt: '2026-10-12T08:59:59.000Z',
    }], [{ id: 1, name: 'Silverwing', source_end_at: '2026-10-12T19:59:59Z' }], [])[0];

    assert.equal(result.classification, 'revisar diferença de prazo');
});
