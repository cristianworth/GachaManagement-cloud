import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('six-minute saved-data refresh is silent, read-only and bound to the visible profile view', async t => {
    const { dom, state, close } = createDomHarness();
    const games = await import('../js/ui/gameUI.js');
    const tasks = await import('../js/ui/taskUI.js');
    const { stopSilentRefresh } = await import('../js/ui/silentRefresh.js');
    const { selectProfile } = await import('../js/services/profileSession.js');
    const { withLoading } = await import('../js/ui/loadingState.js');
    const { setFeedback } = await import('../js/ui/feedback.js');
    const { default: Router } = await import('../js/utils/router.js');
    t.after(() => { stopSilentRefresh(); games.stopStaminaEstimateTimer(); close(); });
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Silent refresh tests stay offline'); });
    const start = Date.parse('2026-10-13T12:00:00Z');
    t.mock.timers.enable({ apis: ['Date'], now: start });
    const timers = new Map(); let timerId = 0; let hidden = false;
    t.mock.method(window, 'setTimeout', (callback, delay) => {
        timers.set(++timerId, { callback, dueAt: Date.now() + delay }); return timerId;
    });
    t.mock.method(window, 'clearTimeout', id => timers.delete(id));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const client = window.supabase.createClient();
    const rpc = client.rpc.bind(client); const calls = [];
    t.mock.method(client, 'rpc', (name, payload) => { calls.push({ name, payload }); return rpc(name, payload); });
    const el = id => document.getElementById(id);
    const change = id => el(id).dispatchEvent(new dom.window.Event('change'));
    const visibility = value => { hidden = value; document.dispatchEvent(new dom.window.Event('visibilitychange')); };
    const advance = async milliseconds => {
        t.mock.timers.setTime(Date.now() + milliseconds);
        const due = [...timers].filter(([, timer]) => timer.dueAt <= Date.now());
        for (const [id, timer] of due) { timers.delete(id); await timer.callback(); }
    };
    const seed = async (view = 'games') => {
        stopSilentRefresh(); games.stopStaminaEstimateTimer();
        hidden = false; selectProfile('cran'); t.mock.timers.setTime(start);
        document.activeElement.blur();
        el('taskBatchDialog').close();
        state.readError = null; state.error = null; state.beforeQuery = null;
        state.games = [1, 2].map(id => ({ id, description: `Game ${id}`, abbreviation: id === 1 ? 'GI' : 'HSR',
            current_stamina: 180, pending_tasks: 'Saved notes', cap_stamina: 240, stamina_per_minute: 6,
            max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-13T18:00:00Z' }));
        state.tasks = Array.from({ length: 45 }, (_, index) => ({ id: index + 1, description: `Task ${index + 1}`,
            game_id: index < 25 ? 1 : 2, refresh_type: 2, repeat_days: 7, is_done: false,
            expiration_date: new Date(Date.UTC(2099, 0, index + 1)).toISOString() }));
        for (const page of document.querySelectorAll('[data-page]')) page.style.display = page.dataset.page === view ? 'block' : 'none';
        history.replaceState({}, '', view === 'games' ? '/' : '/tasks');
        if (view === 'games') await games.displayAllGames();
        else {
            await tasks.displayAllTasks();
            el('taskGameFilter').value = ''; change('taskGameFilter');
            el('taskRefreshTypeFilter').value = ''; change('taskRefreshTypeFilter');
            el('taskHideCompleted').checked = false; change('taskHideCompleted');
            el('taskPageSize').value = '20'; change('taskPageSize');
        }
        calls.length = 0; state.writes = []; state.rpcCalls = [];
    };

    await t.test('Games reads once at six minutes, keeps blurred drafts and does not replace feedback', async () => {
        await seed();
        el('currentStamina1').value = '77'; el('pendingTask1').value = 'Unsaved notes';
        setFeedback('gameListMessage', 'Previous save confirmation');
        for (const game of state.games) Object.assign(game, { current_stamina: 40, pending_tasks: 'Remote notes',
            date_max_stamina: '2026-10-14T08:00:00Z' });
        await advance(359_999); assert.equal(calls.length, 0);
        await advance(1);
        assert.equal(calls.length, 1); assert.equal(calls[0].name, 'list_profile_games');
        assert.equal(calls[0].payload.p_profile_id, 'cran');
        assert.equal(el('currentStamina1').value, '77'); assert.equal(el('pendingTask1').value, 'Unsaved notes');
        assert.equal(el('currentStamina2').value, '40'); assert.equal(el('pendingTask2').value, 'Remote notes');
        assert.match(el('estimatedStamina1').textContent, /41\/240/);
        assert.equal(el('gameListMessage').textContent, 'Previous save confirmation');
        assert.equal(el('loadingOverlay').hidden, true); assert.equal(state.writes.length, 0);
        assert.equal(timers.size, 1);
    });

    await t.test('focused editing defers the read and blur preserves the exact draft', async () => {
        await seed(); el('pendingTask1').value = 'Typed draft'; el('pendingTask1').focus();
        el('pendingTask1').setSelectionRange(2, 5);
        await advance(360_000); assert.equal(calls.length, 0);
        assert.deepEqual([el('pendingTask1').selectionStart, el('pendingTask1').selectionEnd], [2, 5]);
        el('pendingTask1').blur(); await advance(15_000);
        assert.equal(calls.length, 1); assert.equal(el('pendingTask1').value, 'Typed draft');
    });

    await t.test('Tasks keeps all filters, page, button focus and updated favorites without cleanup or writes', async () => {
        await seed('taskList');
        el('taskPageSize').value = '10'; change('taskPageSize');
        el('taskGameFilter').value = '1'; change('taskGameFilter');
        el('taskRefreshTypeFilter').value = '2'; change('taskRefreshTypeFilter');
        el('taskHideCompleted').checked = true; change('taskHideCompleted');
        el('taskNextPage').click(); el('taskNextPage').click();
        el('favorite-task-24').focus();
        state.tasks.find(task => task.id === 24).description = 'Changed on another device';
        state.tasks.find(task => task.id === 25).is_favorite = true;
        state.tasks.find(task => task.id === 22).is_done = true;
        state.tasks.push({ ...state.tasks[0], id: 46, description: 'Remote new task', expiration_date: '2099-12-01T12:00:00Z' });
        await advance(360_000);
        assert.deepEqual(calls.map(call => call.name).sort(), ['list_profile_games', 'list_profile_tasks']);
        assert.equal(state.rpcCalls.length, 0); assert.equal(state.writes.length, 0);
        assert.equal(el('taskGameFilter').value, '1'); assert.equal(el('taskRefreshTypeFilter').value, '2');
        assert.equal(el('taskHideCompleted').checked, true); assert.equal(el('taskPageSize').value, '10');
        assert.match(el('taskPageStatus').textContent, /21–25 de 25.*Página 3 de 3/);
        assert.match(el('gameScheduleBody').textContent, /Changed on another device/);
        assert.equal(document.activeElement, el('favorite-task-24'));
        assert.equal(el('loadingOverlay').hidden, true);
    });

    await t.test('hidden tabs pause; a recent return waits and an old return reads immediately once', async () => {
        await seed(); await advance(300_000); visibility(true);
        assert.equal(timers.size, 0); visibility(false); await advance(0); assert.equal(calls.length, 0);
        await advance(60_000); assert.equal(calls.length, 1);
        visibility(true); await advance(420_000); assert.equal(calls.length, 1);
        visibility(false); await advance(0); assert.equal(calls.length, 2);
        visibility(false); await advance(0); assert.equal(calls.length, 2);
    });

    await t.test('an open modal or an active save defers querying until it is safe', async () => {
        await seed('taskList'); el('taskBatchDialog').showModal();
        await advance(360_000); assert.equal(calls.length, 0);
        el('taskBatchDialog').close(); await advance(15_000); assert.equal(calls.length, 2);
        await seed();
        let release; const gate = new Promise(resolve => { release = resolve; });
        const save = withLoading('Pending save', () => gate);
        await advance(360_000); assert.equal(calls.length, 0);
        release(); await save; await advance(15_000); assert.equal(calls.length, 1);
    });

    await t.test('a pending silent read stays without overlay and repeated visibility events do not duplicate it', async () => {
        await seed(); let release; const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = () => gate;
        const pending = advance(360_000); await waitFor(() => calls.length === 1);
        assert.equal(el('loadingOverlay').hidden, true);
        visibility(false); await advance(0); visibility(false); await advance(0);
        assert.equal(calls.length, 1);
        release(); await pending; assert.equal(timers.size, 1);
    });

    await t.test('typing during the read discards the response until a later safe retry', async () => {
        await seed(); let release; const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = () => gate;
        const before = el('gameListBody').innerHTML;
        const pending = advance(360_000); await waitFor(() => calls.length === 1);
        el('pendingTask1').value = 'Typed while reading'; el('pendingTask1').focus();
        state.games[0].description = 'Remote rename'; release(); await pending;
        assert.equal(el('gameListBody').innerHTML, before);
        assert.equal(document.activeElement, el('pendingTask1')); assert.equal(el('pendingTask1').value, 'Typed while reading');
        state.beforeQuery = null; el('pendingTask1').blur(); await advance(15_000);
        assert.match(el('gameListBody').textContent, /Remote rename/);
        assert.equal(el('pendingTask1').value, 'Typed while reading');
    });

    await t.test('route and profile changes cannot apply a late response or leave duplicate timers', async () => {
        await seed(); let release; const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = request => request.table === 'games' && calls.length === 1 ? gate : undefined;
        const before = el('gameListBody').innerHTML;
        const pending = advance(360_000); await waitFor(() => calls.length === 1);
        await Router.navigateTo('/tasks'); state.games[0].description = 'Late rename';
        release(); await pending; assert.equal(el('gameListBody').innerHTML, before); assert.equal(timers.size, 1);
        await Router.navigateTo('/tasks/create'); assert.equal(timers.size, 0); calls.length = 0;
        await advance(360_000); assert.equal(calls.length, 0);
        await seed(); state.beforeQuery = () => selectProfile('demo');
        const original = el('gameListBody').innerHTML; await advance(360_000);
        assert.equal(el('gameListBody').innerHTML, original);
        state.beforeQuery = null; await advance(360_000); assert.equal(timers.size, 0);
    });

    await t.test('a late manual Games read cannot cancel the refresh for the newly visible Tasks view', async () => {
        await seed(); let release; const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = request => request.table === 'games' && calls.length === 1 ? gate : undefined;
        const pending = games.displayAllGames({ preserveDrafts: true });
        await waitFor(() => calls.length === 1);
        await Router.navigateTo('/tasks'); assert.equal(timers.size, 1);
        release(); await pending; assert.equal(timers.size, 1);
        state.beforeQuery = null; calls.length = 0; await advance(360_000);
        assert.deepEqual(calls.map(call => call.name).sort(), ['list_profile_games', 'list_profile_tasks']);
    });

    await t.test('read failures keep rows, drafts and controls; retries wait six minutes', async () => {
        for (const view of ['games', 'taskList']) {
            await seed(view); if (view === 'games') el('pendingTask1').value = 'Keep my draft';
            const body = el(view === 'games' ? 'gameListBody' : 'gameScheduleBody'); const before = body.innerHTML;
            state.readError = 'Offline'; await advance(360_000);
            assert.equal(body.innerHTML, before); assert.equal(el('loadingOverlay').hidden, true);
            assert.equal(el(view === 'games' ? 'gameListRetry' : 'taskListRetry').hidden, true);
            const failedCalls = calls.length;
            await advance(15_000); assert.equal(calls.length, failedCalls);
            state.readError = null; await advance(345_000); assert.ok(calls.length > failedCalls);
            if (view === 'games') assert.equal(el('pendingTask1').value, 'Keep my draft');
            else assert.equal(el('chooseTaskBatchBtn').disabled, false);
            assert.equal(state.writes.length, 0);
        }
    });

    await t.test('a manual Save supersedes an older auto response instead of restoring its old forecast', async () => {
        await seed(); let release; const gate = new Promise(resolve => { release = resolve; });
        const stale = structuredClone(state.games); let hold = true;
        const trackedRpc = client.rpc;
        client.rpc = async (name, payload) => {
            if (name === 'list_profile_games' && hold) { hold = false; calls.push({ name, payload }); await gate; return { data: stale, error: null }; }
            return trackedRpc(name, payload);
        };
        const pending = advance(360_000); await waitFor(() => calls.length === 1);
        el('currentStamina1').value = '200'; el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden && state.writes.length === 1);
        release(); await pending; client.rpc = trackedRpc;
        assert.equal(el('currentStamina1').value, '200'); assert.match(el('estimatedStamina1').textContent, /200\/240/);
        assert.equal(timers.size, 1); assert.equal(state.writes.length, 1);
    });

    await t.test('a remotely removed game with a draft keeps the old list without losing text', async () => {
        await seed(); el('pendingTask1').value = 'Do not lose this';
        const before = el('gameListBody').innerHTML; state.games = state.games.filter(game => game.id !== 1);
        await advance(360_000);
        assert.equal(el('gameListBody').innerHTML, before); assert.equal(el('pendingTask1').value, 'Do not lose this');
        assert.equal(state.writes.length, 0);
    });
});
