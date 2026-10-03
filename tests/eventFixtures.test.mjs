import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EVENT_GAME_CATALOG, EVENT_GAMES, getCatalogGame, getEventGame } from '../js/events/eventGames.js';
import { normalizeStarRailAssistantActivities as normalize, activityKey } from '../js/events/starRailAssistant.js';
import { syncGameEvents } from '../scripts/eventSync.js';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url)));
const expectations = {
    genshin: { count: 8, skipped: 0, missingCovers: 0, future: 0,
        name: 'Silverwing in Pursuit of the Moon', end: '2026-10-12T08:59:59.000Z' },
    hsr: { count: 15, skipped: 0, missingCovers: 10, future: 4,
        name: 'Apocalyptic Shadow: Dominance of Oblivion', end: '2026-11-16T08:59:59.000Z' },
    zzz: { count: 10, skipped: 2, missingCovers: 6, future: 2,
        name: 'All-New Program', end: '2026-10-20T08:59:59.000Z' },
};

for (const game of EVENT_GAME_CATALOG) test(`${game.abbreviation} has a traceable real API fixture`, () => {
    const meta = manifest[game.key];
    assert.ok(meta, `Missing fixture metadata for ${game.key}`);
    assert.equal(meta.url, game.url);
    assert.equal(meta.locale, 'en-US');
    assert.ok(Number.isFinite(Date.parse(meta.referenceTime)));
    const raw = readFileSync(new URL(`./fixtures/${meta.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(raw).digest('hex'), meta.sha256);
    const calendar = JSON.parse(raw);
    assert.equal(calendar.activities.length, meta.activityCount);
    assert.ok(calendar.activities.every(row => typeof row.name === 'string' && row.name.trim()));
    const keys = calendar.activities.map(row => activityKey(row.name));
    assert.equal(new Set(keys).size, keys.length, 'Repeated names require an identity decision before enabling this source');
});

for (const game of EVENT_GAMES) test(`${game.abbreviation} normalizes its fixture and dry-runs with a fixed clock`, async t => {
    const meta = manifest[game.key];
    const calendar = JSON.parse(readFileSync(new URL(`./fixtures/${meta.file}`, import.meta.url)));
    const now = Date.parse(meta.referenceTime);
    const expected = expectations[game.key];
    assert.ok(expected, 'An enabled game requires reviewed normalization expectations');
    const { events, skipped } = normalize(calendar, now);
    assert.equal(events.length, expected.count);
    assert.equal(skipped, expected.skipped);
    assert.equal(events.filter(row => !row.coverUrl).length, expected.missingCovers);
    assert.equal(events.filter(row => Date.parse(row.proposedStartAt) > now).length, expected.future);
    assert.equal(events.find(row => row.name === expected.name).proposedEndAt, expected.end);
    t.mock.method(console, 'table', () => {});
    t.mock.method(console, 'log', () => {});
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(String(url), game.url);
        calls++;
        return new Response(JSON.stringify(calendar));
    });
    const result = await syncGameEvents(game, { dryRun: true, now });
    assert.equal(calls, 1);
    assert.equal(result.candidates.length, expected.count);
    assert.ok(result.candidates.every(row => row.source === game.source && !Object.hasOwn(row, 'game_id')));
});

test('Planned games are excluded from routes and sync until their policies and SQL are ready', async t => {
    assert.deepEqual(EVENT_GAMES.map(game => game.key), ['genshin', 'hsr', 'zzz']);
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Planned games must not make requests'); });
    for (const key of ['wuwa', 'nte']) {
        assert.throws(() => getEventGame(key), /Unsupported event game/);
        await assert.rejects(syncGameEvents(getCatalogGame(key)), /Unsupported event game/);
    }
});
