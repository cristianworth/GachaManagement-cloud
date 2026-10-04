import test from 'node:test';
import assert from 'node:assert/strict';
import { syncGameEvents } from '../scripts/eventSync.js';
import { EVENT_GAMES, getEventGame } from '../js/events/eventGames.js';

for (const game of EVENT_GAMES) test(`${game.abbreviation} sync delegates task writes to the transactional importer and never overwrites a concurrent ignore`, async t => {
    const requests = [];
    const activities = ['Imported', 'Ignored', 'Missing end'].map(name => ({
        name, startTime: '2099-01-01T04:00:00',
        endTime: name === 'Missing end' ? '' : '2099-02-01T03:59:59',
    }));
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
        const url = new URL(input);
        const body = options.body ? JSON.parse(options.body) : null;
        requests.push({ path: url.pathname, search: url.searchParams, method: options.method ?? 'GET', body });
        let result;
        if (url.hostname === 'starrailassistant.top') {
            assert.equal(url.href, game.url);
            result = { activities };
        }
        else if (url.pathname.endsWith('/games')) result = [{ id: 1 }];
        else if (url.pathname.endsWith('/event_candidates') && !options.method) result = [
            { id: 1, source: game.source, external_id: 'imported', name: 'Imported',
                source_start_at: '2098-12-31T20:00:00Z', source_end_at: '2099-01-31T19:59:59Z', status: 'approved', is_active: true },
            { id: 2, source: game.source, external_id: 'ignored', name: 'Ignored',
                source_start_at: '2098-12-31T20:00:00Z', source_end_at: '2099-01-31T19:59:59Z', status: 'ignored', is_active: true },
        ];
        else if (url.pathname.endsWith('/rpc/import_event_candidates')) result = { imported: 1, review: 1 };
        else if (url.pathname.endsWith('/rpc/cleanup_expired_hsr_events')) result = 0;
        else if (url.pathname.endsWith('/event_candidates')) result = null;
        else throw new Error(`Unexpected request: ${url}`);
        return new Response(JSON.stringify(result), { status: 200 });
    });
    await syncGameEvents(game);
    assert.equal(requests.find(request => request.path.endsWith('/games')).search.get('abbreviation'), `eq.${game.abbreviation}`);
    const candidateRead = requests.find(request => request.path.endsWith('/event_candidates') && request.method === 'GET');
    assert.equal(candidateRead.search.get('source'), game.key === 'genshin'
        ? `in.(${game.source},ennead-genshin-calendar)` : `eq.${game.source}`);
    const patches = requests.filter(request => request.method === 'PATCH');
    assert.equal(patches.length, 2);
    assert.ok(patches.every(request => !Object.hasOwn(request.body, 'status')));
    assert.ok(patches.every(request => request.body.source === game.source && request.body.game_id === 1));
    const imports = requests.filter(request => request.path.endsWith('/rpc/import_event_candidates'));
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].body, { p_source: game.source });
    assert.equal(requests.filter(request => request.path.endsWith('/rpc/cleanup_expired_hsr_events')).length,
        game.key === 'hsr' ? 1 : 0, 'Syncing one game must not clean tasks belonging to another');
    assert.ok(!requests.some(request => request.path.endsWith('/tasks')));
});

test('dry run reads the source but never imports or writes candidates', async t => {
    let calls = 0;
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'table', () => {});
    t.mock.method(globalThis, 'fetch', async input => {
        assert.equal(new URL(input).hostname, 'starrailassistant.top');
        calls++;
        return new Response(JSON.stringify({ activities: [{
            name: 'Upcoming', startTime: '', endTime: '2099-02-01T03:59:59',
        }] }));
    });
    await syncGameEvents(getEventGame('hsr'), { dryRun: true });
    assert.equal(calls, 1);
});
