import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStarRailAssistantActivities } from '../js/events/starRailAssistant.js';
import { resolveWuwaTimes } from '../js/events/wuwa.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const calendar = fixture('ww-en-US.json');
const contract = fixture('wuwa-source-contract.json');
const now = Date.parse(fixture('manifest.json').wuwa.referenceTime);

for (const expected of contract.events) test(`WuWa ${expected.name} source dates match the official announcement`, () => {
    const activity = calendar.activities.find(row => row.name === expected.name);
    assert.ok(activity, 'Reviewed event must exist in the captured calendar');
    assert.equal(calendar.version, contract.version);
    // Official notices specify minutes; the API supplies the last second of that minute.
    assert.equal(activity.startTime.slice(0, 16), expected.start);
    assert.equal(activity.endTime.slice(0, 16), expected.end);
});

test('WuWa version-update starts retain the fixed UTC+8 instant', () => {
    const { events } = normalizeStarRailAssistantActivities(calendar, now, { resolveTimes: resolveWuwaTimes });
    const expectedStart = Date.parse(contract.release.maintenanceEnd);
    for (const expected of contract.events.filter(event => event.startBasis === 'version-update')) {
        assert.equal(Date.parse(events.find(event => event.name === expected.name).proposedStartAt), expectedStart);
    }
});

for (const expected of contract.userProvidedSchedules) test(`WuWa ${expected.name} retains the dates supplied by Cristian without claiming verified hours`, () => {
    const activity = calendar.activities.find(row => row.name === expected.name);
    assert.equal(activity.startTime.slice(0, 10), expected.startDate);
    assert.equal(activity.endTime.slice(0, 10), expected.endDate);
    assert.equal(expected.precision, 'dates-only');
    assert.match(expected.clockDecision, /not independently verified/);
});
