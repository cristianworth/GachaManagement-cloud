import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import RefreshTypeEnum from '../js/enums/RefreshTypeEnum.js';
import { getNextMonthlyDeadline } from '../js/utils/dateUtils.js';
import { filterTasks } from '../js/utils/taskFilters.js';

const cases = [
    [1, '2025-06-01T09:00:00Z', '2026-10-08T12:00:00Z', '2026-11-01T09:00:00.000Z'],
    [15, '2026-09-15T09:00:00Z', '2026-10-08T12:00:00Z', '2026-10-15T09:00:00.000Z'],
    [1, '2028-02-01T09:00:00Z', '2028-02-29T12:00:00Z', '2028-03-01T09:00:00.000Z'],
    [15, '2027-02-15T09:00:00Z', '2027-02-28T12:00:00Z', '2027-03-15T09:00:00.000Z'],
    [1, '2026-12-01T09:00:00Z', '2026-12-31T12:00:00Z', '2027-01-01T09:00:00.000Z'],
    [15, '2026-10-15T09:00:00Z', '2026-10-15T09:00:00Z', '2026-11-15T09:00:00.000Z'],
    [15, '2026-09-15T14:30:15.123Z', '2026-10-15T14:30:15.122Z', '2026-10-15T14:30:15.123Z'],
];
for (const [day, previous, now, expected] of cases) test(`Calendar day ${day} follows months at ${now}`, () => {
    const original = new Date(previous);
    assert.equal(getNextMonthlyDeadline(original, day, now).toISOString(), expected);
    assert.equal(original.toISOString(), new Date(previous).toISOString());
});

test('Calendar cycles retain UTC time in different host timezones, including DST', () => {
    for (const TZ of ['America/New_York', 'Pacific/Auckland']) {
        const code = `import { getNextMonthlyDeadline } from './js/utils/dateUtils.js';
            console.log(getNextMonthlyDeadline('2026-10-01T09:00:00Z',1,'2026-11-02T12:00:00Z').toISOString());`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ }, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), '2026-12-01T09:00:00.000Z');
    }
});

test('Calendar labels and filters stay distinct from legacy fixed-day Monthly and nonrecurring events', () => {
    const rows = [{ id: 1, refreshType: 9, repeatDays: null }, { id: 2, refreshType: 10, repeatDays: null },
        { id: 3, refreshType: 6, repeatDays: 30 }, { id: 4, refreshType: 6, repeatDays: 31 }, { id: 5, refreshType: 0 }];
    assert.equal(RefreshTypeEnum.describe(rows[0]), 'Monthly — day 1');
    assert.equal(RefreshTypeEnum.describe(rows[1]), 'Monthly — day 15');
    assert.equal(RefreshTypeEnum.describe(rows[2]), 'Every 30 days');
    assert.equal(RefreshTypeEnum.describe(rows[3]), 'Every 31 days');
    for (const [interval, ids] of [['9', [1]], ['10', [2]], ['6', [3]], ['8', [4]], ['0', [5]]]) {
        assert.deepEqual(filterTasks(rows, { interval }).map(t => t.id), ids);
    }
    assert.throws(() => getNextMonthlyDeadline('bad', 1), /Invalid/);
    assert.throws(() => getNextMonthlyDeadline('2026-01-01', 31), /Invalid/);
});
