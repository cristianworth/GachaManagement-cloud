import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Endgame batch UI, calendar edits and renewal preserve profile choices', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Tests must remain offline'); });
    const ui = await import('../js/ui/taskUI.js');
    const repository = await import('../js/database/taskDB.js');
    const forms = await import('../js/ui/formHandler.js');
    const dropdowns = await import('../js/ui/dropdownHandler.js');
    const { default: Router } = await import('../js/utils/router.js');
    t.mock.method(Router, 'navigateTo', () => {});
    const el = id => document.getElementById(id);
    const calls = () => state.rpcCalls.filter(c => c.name === 'create_profile_endgame_batch');
    const submit = () => el('endgameBatchForm').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    state.games = [{ id: 42, abbreviation: 'GI', description: 'Genshin' }, { id: 88, abbreviation: 'NTE', description: 'NTE' }];
    state.tasks = [{ id: 5, description: 'Imaginarium Theater', refresh_type: 9, repeat_days: null,
        game_id: 42, game_description: 'Genshin', is_done: true, is_favorite: true, expiration_date: '2099-01-01T09:00:00Z',
        shared_key: 'endgame:GI:imaginarium-theater', cover_url: 'https://example.com/custom.jpg' }];
    await ui.displayAllTasks();
    await dropdowns.populateGameDropDown();
    dropdowns.populateRefreshTypeDropDown();
    forms.initializeTaskForm();

    await t.test('Batch works on all enabled games regardless of the list filter, with one request for repeated clicks', async () => {
        assert.equal(el('createEndgameBatchBtn').disabled, false);
        assert.equal(el('nteBatchDeadlineFields').hidden, false);
        el('taskGameFilter').value = '42';
        el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
        el('nteBatchDeadline').value = '2099-01-10T07:00:00';
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        state.beforeQuery = ({ name }) => name === 'create_profile_endgame_batch' ? gate : undefined;
        state.rpcResults.create_profile_endgame_batch = { created: 3, preserved: 0, registered: 2 };
        const before = calls().length;
        submit(); submit();
        assert.equal(el('createEndgameBatchBtn').disabled, true);
        assert.equal(el('nteBatchDeadline').disabled, true);
        release();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(calls().length, before + 1);
        assert.deepEqual(calls().at(-1).payload, { p_profile_id: 'cran', p_nte_deadline: new Date('2099-01-10T07:00:00').toISOString() });
        assert.match(el('taskListMessage').textContent, /3 criada/);
        assert.equal(el('nteBatchDeadline').value, '');
        assert.equal(el('taskGameFilter').value, '42');
        state.beforeQuery = null;
    });

    await t.test('Failure retains the anchor and tasks, then retry succeeds', async () => {
        const before = structuredClone(state.tasks);
        el('nteBatchDeadline').value = '2099-02-10T07:00:00';
        state.rpcErrors.create_profile_endgame_batch = 'Batch failed';
        submit();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.deepEqual(state.tasks, before);
        assert.equal(el('nteBatchDeadline').value, '2099-02-10T07:00');
        assert.match(el('taskListMessage').textContent, /preservadas/);
        assert.equal(el('createEndgameBatchBtn').disabled, false);
        delete state.rpcErrors.create_profile_endgame_batch;
        state.rpcResults.create_profile_endgame_batch = { created: 0, preserved: 0, registered: 0 };
        submit();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.match(el('taskListMessage').textContent, /já registrado/);
    });

    await t.test('Missing NTE anchor surfaces the database explanation and does not leave stale loading', async () => {
        state.rpcErrors.create_profile_endgame_batch = 'Informe o próximo prazo futuro do Beyond the Rails mostrado no jogo. Nenhuma tarefa foi criada.';
        submit();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.match(el('taskListMessage').textContent, /Informe o próximo prazo futuro/);
        assert.equal(el('createEndgameBatchBtn').disabled, false);
        delete state.rpcErrors.create_profile_endgame_batch;
    });

    await t.test('Saved batch plus failed list refresh keeps saved status; read retry never creates again', async () => {
        state.beforeQuery = ({ name }) => { if (name === 'create_profile_endgame_batch') state.readError = 'Read failed'; };
        submit();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.match(el('taskListMessage').textContent, /já registrado.*não foi possível atualizar/);
        assert.equal(el('createEndgameBatchBtn').disabled, true);
        const before = calls().length;
        state.readError = null; state.beforeQuery = null;
        el('taskListRetry').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(calls().length, before);
    });

    await t.test('GI-only skips hidden NTE input; unrelated selection disables the batch', async () => {
        const enabled = state.games;
        state.games = [enabled[0]];
        await ui.displayAllTasks();
        assert.equal(el('nteBatchDeadlineFields').hidden, true);
        el('nteBatchDeadline').value = '2099-03-10T07:00:00';
        submit();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(calls().at(-1).payload.p_nte_deadline, undefined);
        state.games = [{ id: 99, abbreviation: 'HSR', description: 'HSR' }];
        await ui.displayAllTasks();
        assert.equal(el('createEndgameBatchBtn').disabled, true);
        state.games = enabled;
        await ui.displayAllTasks();
        await dropdowns.populateGameDropDown();
    });

    await t.test('Editing and saving a calendar task retains its recurrence, completion and favorite', async () => {
        el('edit-task-5').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(el('refreshType').value, '9');
        assert.equal(el('taskRepeatDaysFields').hidden, true);
        assert.equal(el('taskRepeatDays').required, false);
        assert.equal(el('taskGameId').disabled, true);
        el('taskDescription').value = 'My Theater';
        await ui.handleAddTask();
        const saved = state.tasks.find(t => t.id === 5);
        assert.equal(saved.refresh_type, 9);
        assert.equal(saved.repeat_days, null);
        assert.equal(saved.is_done, true);
        assert.equal(saved.is_favorite, true);
        assert.equal(saved.description, 'My Theater');
        forms.setTaskRecurrence(null, false, 10);
        assert.equal(el('refreshType').value, '10');
        el('refreshType').value = '6';
        el('refreshType').dispatchEvent(new dom.window.Event('change'));
        assert.equal(el('taskRepeatDays').value, '30', 'Legacy Monthly still uses fixed days');
    });

    await t.test('Overdue monthly and NTE tasks reopen at the next future cycle without losing favorites or covers', async () => {
        const RealDate = globalThis.Date;
        class FixedDate extends RealDate {
            constructor(...args) { super(...(args.length ? args : ['2026-10-08T12:00:00Z'])); }
            static now() { return RealDate.parse('2026-10-08T12:00:00Z'); }
        }
        t.mock.method(globalThis, 'Date', FixedDate);
        state.tasks = [
            { id: 1, description: 'Theater', game_id: 42, refresh_type: 9, repeat_days: null, expiration_date: '2025-06-01T09:00:00Z' },
            { id: 2, description: 'Abyss', game_id: 42, refresh_type: 10, repeat_days: null, expiration_date: '2026-09-15T09:00:00Z' },
            { id: 3, description: 'Rails', game_id: 88, refresh_type: 3, repeat_days: 14, expiration_date: '2026-10-07T10:00:00Z', shared_key: 'endgame:NTE:beyond-the-rails' },
            { id: 4, description: 'Event', game_id: 42, refresh_type: 0, expiration_date: '2026-09-01T09:00:00Z' },
        ].map(t => ({ ...t, is_done: true, is_favorite: true, cover_url: 'https://example.com/cover.jpg' }));
        const { updateExpiratedTasksRoutine } = await import('../js/database/dbInit.js');
        await updateExpiratedTasksRoutine();
        assert.deepEqual(state.tasks.slice(0, 3).map(t => t.expiration_date), ['2026-11-01T09:00:00.000Z', '2026-10-15T09:00:00.000Z', '2026-10-21T10:00:00.000Z']);
        assert.ok(state.tasks.slice(0, 3).every(t => !t.is_done && t.is_favorite && t.cover_url === 'https://example.com/cover.jpg'));
        assert.equal(state.tasks[3].is_done, true);
        assert.equal(state.tasks[3].expiration_date, '2026-09-01T09:00:00Z');
    });
});
