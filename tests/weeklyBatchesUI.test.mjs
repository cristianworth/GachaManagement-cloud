import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Legacy weekly repository retains boot and explicit creation contracts', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('No network in weekly tests'); });
    const tasks = await import('../js/ui/taskUI.js');
    const repository = await import('../js/database/taskDB.js');
    const el = id => document.getElementById(id);
    const createCalls = () => state.rpcCalls.filter(call => call.name === 'create_profile_weekly_batch');
    state.games = [
        { id: 42, abbreviation: 'HSR', description: 'HSR custom ID' },
        { id: 11, abbreviation: 'WuWa', description: 'WuWa custom ID' },
        { id: 88, abbreviation: 'ZZZ', description: 'ZZZ custom ID' },
        { id: 1, abbreviation: 'GI', description: 'Genshin' },
    ];
    state.tasks = [{ id: 90, description: 'Keep my task', refresh_type: 8, repeat_days: 19,
        game_id: 1, game_description: 'Genshin', is_done: true, cover_url: 'https://example.com/cover.jpg',
        expiration_date: '2099-02-02T12:30:00Z' }];
    await tasks.displayAllTasks();

    await t.test('Boot reads games once, resolves nonstandard IDs and skips absent games', async () => {
        let reads = 0;
        state.beforeQuery = ({ table, operation }) => { if (table === 'games' && operation === 'select') reads++; };
        const games = state.games;
        state.games = games.filter(game => game.abbreviation !== 'WuWa');
        const before = createCalls().length;
        const rows = structuredClone(state.tasks);
        await repository.populateInitialTasks({ now: '2026-10-04T12:00:00Z' });
        const calls = createCalls().slice(before);
        assert.equal(reads, 1);
        assert.deepEqual(calls.map(call => [call.payload.p_abbreviation, call.payload.p_game_id]), [['HSR', 42], ['ZZZ', 88], ['GI', 1]]);
        assert.ok(calls.every(call => !call.payload.p_explicit && call.payload.p_now === '2026-10-04T12:00:00.000Z'));
        assert.deepEqual(state.tasks, rows);
        state.games = games;
        state.beforeQuery = null;
    });

    await t.test('Ambiguous or failed reads reject before any batch RPC', async () => {
        const before = createCalls().length;
        state.readError = 'Read failed';
        await assert.rejects(repository.populateInitialTasks(), /Read failed/);
        await assert.rejects(repository.createWeeklyTasksForGame('HSR'), /Read failed/);
        state.readError = null;
        state.games.push({ id: 43, abbreviation: 'ZZZ' });
        await assert.rejects(repository.populateInitialTasks(), /ambígua/);
        await assert.rejects(repository.createWeeklyTasksForGame('ZZZ'), /ambígua/);
        state.games.pop();
        state.games = state.games.filter(game => game.abbreviation !== 'HSR');
        await assert.rejects(repository.createWeeklyTasksForGame('HSR'), /não cadastrado/);
        state.games.push({ id: 42, abbreviation: 'HSR', description: 'HSR custom ID' });
        await assert.rejects(repository.createWeeklyTasksForGame('UNKNOWN'), /sem lote/);
        assert.equal(createCalls().length, before);
    });

});
