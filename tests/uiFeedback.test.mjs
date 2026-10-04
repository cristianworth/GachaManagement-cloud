import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Lists report loading and failures without losing saved state or drafts', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('UI tests must stay offline'); });
    const tasks = await import('../js/ui/taskUI.js');
    const games = await import('../js/ui/gameUI.js');
    const taskDB = await import('../js/database/taskDB.js');
    const gameDB = await import('../js/database/gameDB.js');
    const forms = await import('../js/ui/formHandler.js');
    const dropdowns = await import('../js/ui/dropdownHandler.js');
    const { withLoading } = await import('../js/ui/loadingState.js');
    const { default: Router } = await import('../js/utils/router.js');
    const navigations = [];
    t.mock.method(Router, 'navigateTo', (route, options) => navigations.push({ route, options }));
    const element = id => document.getElementById(id);
    const overlay = () => element('loadingOverlay');
    const taskMessage = () => element('taskListMessage').textContent;
    const gameMessage = () => element('gameListMessage').textContent;
    const deferred = () => {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        return { promise, resolve };
    };
    const seed = async () => {
        state.error = null; state.readError = null; state.queryError = null;
        state.beforeQuery = null; state.rpcErrors = {};
        state.games = [{ id: 4, description: 'Test game', abbreviation: 'ZZZ', current_stamina: 80,
            pending_tasks: 'Saved notes', cap_stamina: 240, stamina_per_minute: 6, img: 'img/zzz-icon.png' }];
        state.tasks = [{ id: 21, description: 'Manual task', expiration_date: '2099-10-20T08:59:59Z',
            is_done: false, refresh_type: 0, game_id: 4, game_description: 'Test game' }];
        state.candidates = [];
        element('taskGameFilter').value = '';
        element('taskRefreshTypeFilter').value = '';
        element('taskHideCompleted').checked = false;
        await tasks.displayAllTasks();
        await games.displayAllGames();
    };
    await seed();
    await dropdowns.populateGameDropDown();
    dropdowns.populateRefreshTypeDropDown();
    forms.initializeTaskForm(); forms.initializeGameForm();

    await t.test('Task list stays busy through cleanup and reads, then releases loading', async () => {
        await seed();
        const gate = deferred();
        state.beforeQuery = () => gate.promise;
        const loading = tasks.displayAllTasks();
        assert.equal(overlay().hidden, false);
        assert.equal(overlay().getAttribute('aria-busy'), 'true');
        assert.equal(overlay().querySelector('.loading-message').textContent, 'Carregando tarefas...');
        gate.resolve();
        assert.equal(await loading, true);
        assert.equal(overlay().hidden, true);
        assert.equal(overlay().getAttribute('aria-busy'), 'false');
    });

    await t.test('Nested loading does not disappear while an outer operation remains pending', async () => {
        const gate = deferred();
        const saving = withLoading('Salvando...', () => gate.promise);
        await withLoading('Atualizando...', async () => {});
        assert.equal(overlay().hidden, false);
        assert.equal(overlay().querySelector('.loading-message').textContent, 'Salvando...');
        gate.resolve(); await saving;
        await assert.rejects(withLoading('Falhando...', async () => { throw new Error('Failed'); }));
        assert.equal(overlay().hidden, true);
    });

    for (const target of ['tasks', 'games']) await t.test(`${target} load failure preserves rows and retries without writes`, async () => {
        await seed();
        const display = target === 'tasks' ? tasks.displayAllTasks : games.displayAllGames;
        const body = element(target === 'tasks' ? 'gameScheduleBody' : 'gameListBody');
        const retry = element(target === 'tasks' ? 'taskListRetry' : 'gameListRetry');
        const message = element(target === 'tasks' ? 'taskListMessage' : 'gameListMessage');
        const before = body.innerHTML;
        const writes = state.writes.length;
        state.readError = 'Network failure';
        assert.equal(await display(), false);
        assert.equal(body.innerHTML, before);
        assert.equal(message.getAttribute('role'), 'alert');
        assert.match(message.textContent, /Não foi possível carregar/);
        assert.equal(retry.hidden, false);
        assert.equal(overlay().hidden, true);
        state.readError = null; retry.click();
        await waitFor(() => overlay().hidden && retry.hidden);
        assert.equal(message.hidden, true);
        assert.equal(state.writes.length, writes);
    });

    await t.test('Read failures are not empty tables and never trigger initial seed writes', async () => {
        await seed(); state.readError = 'Read denied';
        const writes = state.writes.length;
        for (const read of [taskDB.fetchAllTasks, () => taskDB.fetchTaskById(21), gameDB.fetchAllGames,
            () => gameDB.fetchGameById(4), taskDB.populateInitialTasks, gameDB.populateInitialGames]) {
            await assert.rejects(read(), /Read denied/);
        }
        assert.equal(state.writes.length, writes);
    });

    for (const previous of [false, true]) await t.test(`Completion failure restores previous checkbox ${previous}`, async () => {
        await seed(); state.tasks[0].is_done = previous;
        await tasks.displayAllTasks();
        const checkbox = element('task-checkbox-21');
        state.error = 'Write rejected';
        checkbox.click();
        await waitFor(() => overlay().hidden && /seleção anterior/.test(taskMessage()));
        assert.equal(checkbox.checked, previous);
        assert.equal(state.tasks[0].is_done, previous);
        assert.equal(checkbox.disabled, false);
        assert.equal(element('gameScheduleBody').rows.length, 1);
    });

    await t.test('Pending completion disables row controls and successful completion respects Hide completed', async () => {
        await seed(); element('taskHideCompleted').checked = true;
        const gate = deferred();
        state.beforeQuery = ({ operation }) => operation === 'update' ? gate.promise : undefined;
        element('task-checkbox-21').click();
        assert.equal(overlay().hidden, false);
        assert.equal(element('task-checkbox-21').disabled, true);
        assert.equal(element('delete-task-21').disabled, true);
        gate.resolve();
        await waitFor(() => overlay().hidden);
        assert.equal(state.tasks[0].is_done, true);
        assert.equal(element('gameScheduleBody').rows.length, 0);
        assert.match(taskMessage(), /Tarefa concluída/);
    });

    await t.test('A successful completion followed by failed refresh is reported as saved and retry never writes again', async () => {
        await seed();
        state.beforeQuery = ({ operation }) => { if (operation === 'update') state.readError = 'Refresh failed'; };
        element('task-checkbox-21').click();
        await waitFor(() => overlay().hidden && !element('taskListRetry').hidden);
        assert.equal(state.tasks[0].is_done, true);
        assert.equal(element('task-checkbox-21').checked, true);
        assert.match(taskMessage(), /Tarefa concluída.*não foi possível atualizar/);
        const writes = state.writes.length;
        state.readError = null; state.beforeQuery = null;
        element('taskListRetry').click();
        await waitFor(() => overlay().hidden);
        assert.equal(state.writes.length, writes);
    });

    for (const imported of [false, true]) await t.test(`${imported ? 'Ignore' : 'Delete'} failure retains the task and reports its action`, async () => {
        await seed();
        if (imported) state.tasks[0].event_candidates = [{ id: 31, source: 'starrailassistant-zzz' }];
        await tasks.displayAllTasks();
        state.error = 'Delete denied'; state.rpcErrors.ignore_imported_task = 'Ignore denied';
        element('delete-task-21').click();
        await waitFor(() => overlay().hidden && /continua na lista/.test(taskMessage()));
        assert.match(taskMessage(), imported ? /ignorar/ : /excluir/);
        assert.equal(state.tasks.length, 1);
        assert.equal(element('gameScheduleBody').rows.length, 1);
        assert.equal(element('delete-task-21').disabled, false);
    });

    await t.test('Manual task deletion succeeds without leaving its row', async () => {
        await seed(); element('delete-task-21').click();
        await waitFor(() => overlay().hidden);
        assert.equal(state.tasks.length, 0);
        assert.equal(element('gameScheduleBody').rows.length, 0);
        assert.match(taskMessage(), /Tarefa excluída/);
    });

    await t.test('Failed API deadline restore retains the manual deadline and re-enables controls', async () => {
        await seed();
        state.tasks[0].event_candidates = [{ id: 31 }]; state.tasks[0].event_deadline_manual = true;
        await tasks.displayAllTasks();
        const before = state.tasks[0].expiration_date;
        state.rpcErrors.sync_event_candidate = 'Invalid API deadline';
        element('restore-deadline-21').click();
        await waitFor(() => overlay().hidden && /restaurar/.test(taskMessage()));
        assert.equal(state.tasks[0].expiration_date, before);
        assert.equal(element('restore-deadline-21').disabled, false);
    });

    for (const target of ['task', 'game']) await t.test(`Failed ${target} edit stays on the list instead of opening an empty form`, async () => {
        await seed(); state.readError = 'Cannot read item';
        const before = navigations.length;
        element(target === 'task' ? 'edit-task-21' : 'edit-game-4').click();
        await waitFor(() => overlay().hidden);
        assert.equal(navigations.length, before);
        assert.match(target === 'task' ? taskMessage() : gameMessage(), /Não foi possível abrir/);
    });

    await t.test('Failed game save preserves edited notes and stamina and successful save reports confirmation', async () => {
        await seed();
        element('currentStamina4').value = '125'; element('pendingTask4').value = 'Keep my draft';
        state.error = 'Update denied'; element('save-game-4').click();
        await waitFor(() => overlay().hidden);
        assert.equal(element('currentStamina4').value, '125');
        assert.equal(element('pendingTask4').value, 'Keep my draft');
        assert.equal(state.games[0].current_stamina, 80);
        assert.match(gameMessage(), /Não foi possível salvar/);
        state.error = null; element('save-game-4').click();
        await waitFor(() => overlay().hidden);
        assert.equal(state.games[0].current_stamina, 125);
        assert.equal(state.games[0].pending_tasks, 'Keep my draft');
        assert.match(gameMessage(), /salvas/);
    });

    await t.test('Failed game deletion retains the row and releases loading', async () => {
        await seed(); state.error = 'Delete denied'; element('delete-game-4').click();
        await waitFor(() => overlay().hidden);
        assert.equal(state.games.length, 1);
        assert.equal(element('gameListBody').rows.length, 1);
        assert.match(gameMessage(), /Não foi possível excluir/);
        assert.equal(element('delete-game-4').disabled, false);
    });

    for (const target of ['task', 'game']) await t.test(`${target} form blocks duplicate submits and preserves drafts when saving fails`, async () => {
        await seed();
        const task = target === 'task';
        if (task) {
            forms.resetTaskForm(); element('taskGameId').value = '4';
            element('taskDescription').value = 'Keep task';
        } else {
            forms.resetGameForm(); element('gameDescription').value = 'Keep game'; element('abbreviation').value = 'KEEP';
        }
        const gate = deferred(); state.beforeQuery = () => gate.promise; state.error = 'Save denied';
        const writes = state.writes.length;
        const form = element(task ? 'task-form' : 'game-form');
        const submit = element(task ? 'submitTaskForm' : 'submitGameForm');
        const status = element(task ? 'taskFormStatus' : 'gameFormStatus');
        form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
        form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
        assert.equal(submit.disabled, true); assert.equal(overlay().hidden, false);
        gate.resolve(); await waitFor(() => overlay().hidden && !status.hidden);
        assert.equal(state.writes.length, writes + 1);
        assert.equal(element(task ? 'taskDescription' : 'gameDescription').value, task ? 'Keep task' : 'Keep game');
        assert.equal(submit.disabled, false);
        assert.match(status.textContent, /Seus dados foram mantidos/);
    });
});
