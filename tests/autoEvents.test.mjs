import test from 'node:test';
import assert from 'node:assert/strict';
import { syncGameEvents } from '../scripts/eventSync.js';
import { getEventGame } from '../js/events/eventGames.js';

test('sync delegates task writes to the transactional importer and never overwrites a concurrent ignore', async t => {
    const requests = [];
    const activities = ['Imported', 'Ignored', 'Missing end'].map(name => ({
        name, startTime: '2099-01-01T04:00:00',
        endTime: name === 'Missing end' ? '' : '2099-02-01T03:59:59',
    }));
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
        const url = new URL(input);
        const body = options.body ? JSON.parse(options.body) : null;
        requests.push({ path: url.pathname, method: options.method ?? 'GET', body });
        let result;
        if (url.hostname === 'starrailassistant.top') result = { activities };
        else if (url.pathname.endsWith('/games')) result = [{ id: 1 }];
        else if (url.pathname.endsWith('/event_candidates') && !options.method) result = [
            { id: 1, source: 'starrailassistant-genshin', external_id: 'imported', status: 'approved', is_active: true },
            { id: 2, source: 'starrailassistant-genshin', external_id: 'ignored', status: 'ignored', is_active: true },
        ];
        else if (url.pathname.endsWith('/rpc/import_event_candidates')) result = { imported: 1, review: 1 };
        else if (url.pathname.endsWith('/rpc/cleanup_expired_hsr_events')) result = 0;
        else if (url.pathname.endsWith('/event_candidates')) result = null;
        else throw new Error(`Unexpected request: ${url}`);
        return new Response(JSON.stringify(result), { status: 200 });
    });
    await syncGameEvents(getEventGame('genshin'));
    const patches = requests.filter(request => request.method === 'PATCH');
    assert.equal(patches.length, 2);
    assert.ok(patches.every(request => !Object.hasOwn(request.body, 'status')));
    const imports = requests.filter(request => request.path.endsWith('/rpc/import_event_candidates'));
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].body, { p_source: 'starrailassistant-genshin' });
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
