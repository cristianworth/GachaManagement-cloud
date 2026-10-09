import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Calendar edits and renewal preserve profile choices', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Tests must remain offline'); });
    const ui = await import('../js/ui/taskUI.js');
    const forms = await import('../js/ui/formHandler.js');
    const dropdowns = await import('../js/ui/dropdownHandler.js');
    const { default: Router } = await import('../js/utils/router.js');
    t.mock.method(Router, 'navigateTo', () => {});
    const el = id => document.getElementById(id);
    state.games = [{ id: 42, abbreviation: 'GI', description: 'Genshin' }, { id: 88, abbreviation: 'NTE', description: 'NTE' }];
    state.tasks = [{ id: 5, description: 'Imaginarium Theater', refresh_type: 9, repeat_days: null,
        game_id: 42, game_description: 'Genshin', is_done: true, is_favorite: true, expiration_date: '2099-01-01T09:00:00Z',
        shared_key: 'endgame:GI:imaginarium-theater', cover_url: 'https://example.com/custom.jpg' }];
    await ui.displayAllTasks();
    await dropdowns.populateGameDropDown();
    dropdowns.populateRefreshTypeDropDown();
    forms.initializeTaskForm();

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

    await t.test('Added fixed challenges renew in UTC while the Endstate phase remains nonrecurring', async () => {
        const RealDate = globalThis.Date;
        class FixedDate extends RealDate {
            constructor(...args) { super(...(args.length ? args : ['2026-12-31T12:00:00Z'])); }
            static now() { return RealDate.parse('2026-12-31T12:00:00Z'); }
        }
        t.mock.method(globalThis, 'Date', FixedDate);
        state.tasks = [
            { id: 21, description: 'Deadly Assault', refresh_type: 3, repeat_days: 14, expiration_date: '2026-10-09T09:00:00Z', shared_key: 'endgame:ZZZ:deadly-assault' },
            { id: 22, description: 'Shiyu Defense', refresh_type: 3, repeat_days: 14, expiration_date: '2026-10-16T09:00:00Z', shared_key: 'endgame:ZZZ:shiyu-defense' },
            { id: 23, description: 'Tower of Adversity', refresh_type: 5, repeat_days: 28, expiration_date: '2026-10-12T09:00:00Z', shared_key: 'endgame:WuWa:tower-of-adversity' },
            { id: 24, description: 'Whimpering Wastes', refresh_type: 5, repeat_days: 28, expiration_date: '2026-10-26T09:00:00Z', shared_key: 'endgame:WuWa:whimpering-wastes' },
            { id: 25, description: 'Endstate Matrix', refresh_type: 0, repeat_days: null, expiration_date: '2026-11-10T20:00:00Z', shared_key: 'endgame:WuWa:endstate-matrix:3.7' },
        ].map(t => ({ ...t, game_id: 42, is_done: true, is_favorite: true, cover_url: 'https://example.com/cover.jpg' }));
        const { updateExpiratedTasksRoutine } = await import('../js/database/dbInit.js');
        await updateExpiratedTasksRoutine();
        assert.deepEqual(state.tasks.map(t => t.expiration_date), [
            '2027-01-01T09:00:00.000Z', '2027-01-08T09:00:00.000Z',
            '2027-01-04T09:00:00.000Z', '2027-01-18T09:00:00.000Z', '2026-11-10T20:00:00Z',
        ]);
        assert.ok(state.tasks.slice(0, 4).every(t => !t.is_done));
        assert.equal(state.tasks[4].is_done, true);
        assert.ok(state.tasks.every(t => t.is_favorite && t.cover_url === 'https://example.com/cover.jpg'));
    });
});
