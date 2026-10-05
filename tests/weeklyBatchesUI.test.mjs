import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';
import { WEEKLY_BATCHES } from '../js/data/weeklyTasks.js';

test('Weekly batch UI and repository protect user choices and recover from errors', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('No network in weekly tests'); });
    const tasks = await import('../js/ui/taskUI.js');
    const repository = await import('../js/database/taskDB.js');
    const el = id => document.getElementById(id);
    const createCalls = () => state.rpcCalls.filter(call => call.name === 'create_profile_weekly_batch');
    const changeGame = id => {
        el('taskGameFilter').value = String(id);
        el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
    };
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
        assert.deepEqual(calls.map(call => [call.payload.p_abbreviation, call.payload.p_game_id]), [['HSR', 42], ['ZZZ', 88]]);
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
        await assert.rejects(repository.createWeeklyTasksForGame('GI'), /sem lote/);
        assert.equal(createCalls().length, before);
    });

    await t.test('All games and unsupported games disable creation; selection enables it', async () => {
        assert.equal(el('createWeekliesBtn').disabled, true);
        changeGame(1);
        assert.equal(el('createWeekliesBtn').disabled, true);
        changeGame(88);
        assert.equal(el('createWeekliesBtn').disabled, false);
    });

    await t.test('Double click sends one explicit batch and reports preserved tasks', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = ({ name }) => name === 'create_profile_weekly_batch' ? gate : undefined;
        state.rpcResults.create_profile_weekly_batch = { status: 'created', created: 1, preserved: 1 };
        const before = createCalls().length;
        el('createWeekliesBtn').click(); el('createWeekliesBtn').click();
        assert.equal(el('createWeekliesBtn').disabled, true);
        assert.equal(el('loadingOverlay').hidden, false);
        release();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(createCalls().length, before + 1);
        const payload = createCalls().at(-1).payload;
        assert.equal(payload.p_game_id, 88);
        assert.equal(payload.p_abbreviation, 'ZZZ');
        assert.equal(payload.p_explicit, true);
        assert.equal(payload.p_now, undefined, 'Production uses the server clock');
        assert.deepEqual(payload.p_definitions, WEEKLY_BATCHES.find(batch => batch.abbreviation === 'ZZZ').definitions);
        assert.match(el('taskListMessage').textContent, /1 criada.*1 existente/);
        state.beforeQuery = null;
    });

    await t.test('RPC failure retains filters/tasks and allows retry without stale loading', async () => {
        state.rpcErrors.create_profile_weekly_batch = 'Batch failed';
        const rows = structuredClone(state.tasks);
        el('createWeekliesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.deepEqual(state.tasks, rows);
        assert.equal(el('taskGameFilter').value, '88');
        assert.equal(el('createWeekliesBtn').disabled, false);
        assert.equal(el('taskListMessage').getAttribute('role'), 'alert');
        assert.match(el('taskListMessage').textContent, /existentes foram preservadas/);
        state.rpcErrors = {};
        state.rpcResults.create_profile_weekly_batch = { status: 'created', created: 0, preserved: 0 };
        el('createWeekliesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.match(el('taskListMessage').textContent, /criação é única por jogo; nenhuma tarefa foi recriada/);
    });

    await t.test('Saved batch with failed refresh reports saved status; list retry never creates again', async () => {
        state.beforeQuery = ({ name }) => { if (name === 'create_profile_weekly_batch') state.readError = 'Refresh failed'; };
        el('createWeekliesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.match(el('taskListMessage').textContent, /Lote inicial já registrado.*não foi possível atualizar/);
        assert.equal(el('taskListRetry').hidden, false);
        assert.equal(el('createWeekliesBtn').disabled, true);
        const before = createCalls().length;
        state.readError = null; state.beforeQuery = null;
        el('taskListRetry').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(createCalls().length, before);
        assert.equal(el('createWeekliesBtn').disabled, false);
    });
});
