import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Unified batch UI loads automatically without requesting dates', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('No network in batch tests'); });
    const ui = await import('../js/ui/taskUI.js');
    const { selectProfile, clearProfile } = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const calls = () => state.rpcCalls.filter(c => c.name === 'create_profile_task_batch');
    const settled = () => waitFor(() => el('loadingOverlay').hidden);
    state.games = [
        { id: 42, abbreviation: 'HSR', description: 'HSR' },
        { id: 11, abbreviation: 'GI', description: 'Genshin' },
        { id: 88, abbreviation: 'NTE', description: 'NTE' },
    ];
    state.tasks = [{ id: 90, description: 'Keep my task', refresh_type: 8, repeat_days: 19,
        game_id: 11, game_description: 'Genshin', is_done: true, is_favorite: true,
        cover_url: 'https://example.com/custom.jpg', expiration_date: '2099-02-02T12:30:00Z' }];
    await ui.displayAllTasks();

    await t.test('One click loads all enabled games with only the actor; double clicks send one request', async () => {
        for (const id of ['createWeekliesBtn', 'createEndgameBatchBtn', 'taskBatchDeadlineDialog', 'nteBatchDeadline']) {
            assert.equal(el(id), null);
        }
        assert.equal(el('loadTaskBatchBtn').disabled, false);
        el('taskGameFilter').value = '11';
        el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = ({ name }) => name === 'create_profile_task_batch' ? gate : undefined;
        state.rpcResults.create_profile_task_batch = { status: 'created', created: 4, preserved: 1, registered: 3 };
        const before = calls().length;
        el('loadTaskBatchBtn').click(); el('loadTaskBatchBtn').click();
        assert.equal(el('loadTaskBatchBtn').disabled, true);
        assert.equal(el('loadingOverlay').hidden, false);
        release();
        await settled();
        assert.equal(calls().length, before + 1);
        assert.deepEqual(calls().at(-1).payload, { p_profile_id: 'cran' }, 'Calendar and clock belong to the server');
        assert.equal(el('taskGameFilter').value, '11');
        assert.match(el('taskListMessage').textContent, /4 criada.*1 existente/);
        assert.ok(!state.rpcCalls.some(c => ['create_profile_weekly_batch', 'create_profile_endgame_batch'].includes(c.name)));
        state.beforeQuery = null;
    });

    await t.test('Failure preserves rows and filter; retry needs no additional input', async () => {
        const rows = structuredClone(state.tasks);
        state.rpcErrors.create_profile_task_batch = 'Batch failed';
        el('loadTaskBatchBtn').click();
        await settled();
        assert.deepEqual(state.tasks, rows);
        assert.equal(el('taskGameFilter').value, '11');
        assert.equal(el('loadTaskBatchBtn').disabled, false);
        assert.match(el('taskListMessage').textContent, /preservadas/);
        delete state.rpcErrors.create_profile_task_batch;
        state.rpcResults.create_profile_task_batch = { status: 'created', created: 0, preserved: 0, registered: 0 };
        el('loadTaskBatchBtn').click();
        await settled();
        assert.match(el('taskListMessage').textContent, /já registrado.*Nenhuma tarefa foi recriada/);
    });

    await t.test('Changing profile during a request retains the original actor and skips refreshing another profile', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = ({ name }) => name === 'create_profile_task_batch' ? gate : undefined;
        el('loadTaskBatchBtn').click();
        const before = state.rpcCalls.length;
        selectProfile('demo');
        release();
        await settled();
        assert.deepEqual(calls().at(-1).payload, { p_profile_id: 'cran' });
        assert.equal(state.rpcCalls.length, before);
        assert.match(el('taskListMessage').textContent, /Não foi possível carregar/);
        state.beforeQuery = null;
        selectProfile('cran');
        clearProfile();
        const count = calls().length;
        el('loadTaskBatchBtn').click();
        assert.equal(calls().length, count);
        assert.match(el('taskListMessage').textContent, /Selecione um perfil/);
        selectProfile('cran');
    });

    await t.test('Saved batch plus failed refresh reports saved status; list retry never creates again', async () => {
        state.rpcResults.create_profile_task_batch = { status: 'created', created: 14, preserved: 0, registered: 10 };
        state.beforeQuery = ({ name }) => { if (name === 'create_profile_task_batch') state.readError = 'Refresh failed'; };
        el('loadTaskBatchBtn').click();
        await settled();
        assert.match(el('taskListMessage').textContent, /Lote registrado.*não foi possível atualizar/);
        assert.equal(el('loadTaskBatchBtn').disabled, true);
        assert.equal(el('taskListRetry').hidden, false);
        const before = calls().length;
        state.beforeQuery = null; state.readError = null;
        el('taskListRetry').click();
        await settled();
        assert.equal(calls().length, before);
        assert.equal(el('loadTaskBatchBtn').disabled, false);
    });

    await t.test('A missing future phase is reported without requesting a deadline or hiding other activities', async () => {
        state.rpcResults.create_profile_task_batch = { status: 'created', created: 13, preserved: 0, registered: 9, deferred: 1 };
        el('loadTaskBatchBtn').click();
        await settled();
        assert.match(el('taskListMessage').textContent, /13 criada.*Endstate Matrix aguarda o calendário/);
        assert.equal(el('taskBatchDeadlineDialog'), null);
    });

    await t.test('No supported enabled game disables loading', async () => {
        state.games = [{ id: 99, abbreviation: 'OTHER', description: 'Other game' }];
        await ui.displayAllTasks();
        assert.equal(el('loadTaskBatchBtn').disabled, true);
    });
});
