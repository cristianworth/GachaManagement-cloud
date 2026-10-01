import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTimeUntil } from '../js/utils/dateUtils.js';

test('shows days and hours remaining for the deadline being approved', () => {
    const now = Date.parse('2026-09-30T00:00:00Z');
    assert.equal(formatTimeUntil('2026-10-02T05:30:00Z', now), 'Faltam 2 dias e 5 horas.');
    assert.equal(formatTimeUntil('2026-09-30T00:30:00Z', now), 'Falta menos de 1 hora.');
    assert.equal(formatTimeUntil('2026-09-29T23:00:00Z', now), 'Prazo encerrado.');
});
