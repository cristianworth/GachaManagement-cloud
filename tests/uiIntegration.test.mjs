import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';
import { EVENT_GAMES } from '../js/events/eventGames.js';

test('Real forms and task lists preserve user data and integration controls', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('DOM tests must never access the network'); });
    const { default: Router } = await import('../js/utils/router.js');
    const navigation = [];
    t.mock.method(Router, 'navigateTo', route => navigation.push(route));
    const forms = await import('../js/ui/formHandler.js');
    const dropdowns = await import('../js/ui/dropdownHandler.js');
    const tasks = await import('../js/ui/taskUI.js');
    const games = await import('../js/ui/gameUI.js');
    const review = await import('../js/ui/eventReviewUI.js');
    t.after(() => review.stopEventReviewTimer());
    const element = id => document.getElementById(id);
    const change = id => element(id).dispatchEvent(new dom.window.Event('change'));
    state.games = [
        { id: 4, description: 'Zenless Zone Zero', abbreviation: 'ZZZ', img: 'img/zzz-icon.png', current_stamina: 80,
            pending_tasks: 'Keep notes', color: '#e6ccff', cap_stamina: 240, stamina_per_minute: 6, date_max_stamina: '2026-10-20T12:00:00Z' },
        { id: 9, description: 'Honkai Star Rail', abbreviation: 'HSR' },
    ];
    await dropdowns.populateGameDropDown();
    dropdowns.populateRefreshTypeDropDown();
    forms.initializeTaskForm();
    forms.initializeGameForm();

    await t.test('Preset and custom days use real inputs and browser validation', () => {
        forms.resetTaskForm();
        for (const [value, days] of [['1', '1'], ['2', '7'], ['6', '30']]) {
            element('refreshType').value = value;
            change('refreshType');
            assert.equal(element('taskRepeatDays').value, days);
            assert.equal(element('taskRepeatDaysFields').hidden, false);
        }
        element('taskRepeatDays').value = '12';
        element('taskRepeatDays').dispatchEvent(new dom.window.Event('input'));
        assert.equal(element('refreshType').value, '8');
        for (const invalid of ['0', '-1', '1.5']) {
            element('taskRepeatDays').value = invalid;
            assert.equal(element('taskRepeatDays').checkValidity(), false);
        }
        forms.resetTaskForm();
        assert.equal(element('taskRepeatDays').disabled, true);
        for (const id of ['taskCoverUrl', 'gameImageUrl']) {
            element(id).value = 'http://example.com/image.png';
            assert.equal(element(id).checkValidity(), false);
            element(id).value = 'https://example.com/image.png';
            assert.equal(element(id).checkValidity(), true);
            element(id).value = '';
            assert.equal(element(id).checkValidity(), true);
        }
    });

    await t.test('Manual task saves the image and custom days through the actual mapper', async () => {
        forms.resetTaskForm();
        element('taskGameId').value = '4';
        element('taskDescription').value = 'Manual task';
        element('taskCoverUrl').value = ' https://example.com/manual.png ';
        forms.setTaskRecurrence(12);
        await tasks.handleAddTask();
        const row = state.tasks[0];
        assert.equal(row.cover_url, 'https://example.com/manual.png');
        assert.equal(row.repeat_days, 12);
        assert.equal(row.refresh_type, 8);
        assert.equal(row.game_id, 4);
        assert.equal(element('taskDescription').value, '');
        await tasks.displayAllTasks();
        assert.equal(element('gameScheduleBody').rows.length, 1);
    });

    await t.test('Imported editing locks image, game and recurrence and preserves completion', async () => {
        state.tasks = [{ id: 21, description: 'API task', expiration_date: '2099-10-20T08:59:59Z', is_done: true,
            refresh_type: 0, game_id: 4, game_description: 'Zenless Zone Zero', cover_url: 'https://example.com/api.png',
            event_candidates: [{ id: 31, source: 'starrailassistant-zzz' }] }];
        await tasks.displayAllTasks();
        element('edit-task-21').click();
        await waitFor(() => element('taskId').value === '21' && element('taskCoverUrl').disabled);
        for (const id of ['taskCoverUrl', 'taskGameId', 'refreshType', 'taskRepeatDays']) assert.equal(element(id).disabled, true);
        element('taskDescription').value = 'My title';
        await tasks.handleAddTask();
        const write = state.writes.at(-1).payload;
        assert.equal(write.is_done, true);
        assert.equal(write.repeat_days, null);
        assert.equal(Object.hasOwn(write, 'cover_url'), false);
        assert.equal(state.tasks[0].cover_url, 'https://example.com/api.png');
        assert.equal(element('taskCoverUrl').disabled, false);
    });

    await t.test('Failed task submission keeps inputs, displays the error and stays on the form', async () => {
        forms.resetTaskForm();
        element('taskGameId').value = '4';
        element('taskDescription').value = 'Keep this title';
        element('taskCoverUrl').value = 'https://example.com/keep.png';
        forms.setTaskRecurrence(7);
        state.error = 'Database unavailable';
        const navigations = navigation.length;
        element('task-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
        await waitFor(() => !element('taskFormStatus').hidden);
        assert.match(element('taskFormStatus').textContent, /Não foi possível salvar a tarefa/);
        assert.equal(element('taskDescription').value, 'Keep this title');
        assert.equal(element('taskCoverUrl').value, 'https://example.com/keep.png');
        assert.equal(element('taskRepeatDays').value, '7');
        assert.equal(navigation.length, navigations);
        state.error = null;
    });

    await t.test('Game editing saves image while preserving stamina, notes and color', async () => {
        await games.displayAllGames();
        element('edit-game-4').click();
        await waitFor(() => element('gameDescription').value === 'Zenless Zone Zero');
        element('gameImageUrl').value = 'https://example.com/game.png';
        await games.handleAddGame();
        const row = state.games[0];
        assert.equal(row.img, 'https://example.com/game.png');
        assert.equal(row.current_stamina, 80);
        assert.equal(row.pending_tasks, 'Keep notes');
        assert.equal(row.color, '#e6ccff');
    });

    await t.test('Failed game submission keeps inputs and displays the error', async () => {
        forms.resetGameForm();
        element('gameDescription').value = 'Keep game';
        element('abbreviation').value = 'KEEP';
        element('gameImageUrl').value = 'https://example.com/keep-game.png';
        state.error = 'Could not save game';
        const navigations = navigation.length;
        element('game-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
        await waitFor(() => !element('gameFormStatus').hidden);
        assert.match(element('gameFormStatus').textContent, /Não foi possível salvar o jogo/);
        assert.equal(element('gameDescription').value, 'Keep game');
        assert.equal(element('gameImageUrl').value, 'https://example.com/keep-game.png');
        assert.equal(navigation.length, navigations);
        state.error = null;
    });

    await t.test('Task filters combine and reset without dropping placeholders or changing actions', async () => {
        state.tasks = [
            { id: 1, description: 'Manual', refresh_type: 2, repeat_days: 7, game_id: 4, is_done: false },
            { id: 2, description: 'Imported', refresh_type: 0, game_id: 4, is_done: true, cover_url: 'https://example.com/cover.png', event_candidates: [{ id: 32 }] },
            { id: 3, description: 'Other game', refresh_type: 1, repeat_days: 1, game_id: 9, is_done: false },
        ].map(row => ({ expiration_date: '2099-10-20T08:59:59Z', ...row }));
        await tasks.displayAllTasks();
        assert.equal(element('gameScheduleBody').rows.length, 3);
        assert.equal(document.querySelectorAll('.task-cover').length, 3);
        assert.match(element('delete-task-2').textContent, /Ignorar/);
        assert.match(element('delete-task-1').textContent, /Delete/);
        const cover = document.querySelector('#task-checkbox-2').closest('tr').querySelector('img');
        cover.dispatchEvent(new dom.window.Event('error'));
        assert.match(cover.src, /event-placeholder.svg$/);
        element('taskGameFilter').value = '4'; change('taskGameFilter');
        assert.equal(element('gameScheduleBody').rows.length, 2);
        element('taskHideCompleted').checked = true; change('taskHideCompleted');
        assert.equal(element('gameScheduleBody').rows.length, 1);
        element('taskRefreshTypeFilter').value = '1'; change('taskRefreshTypeFilter');
        assert.equal(element('gameScheduleBody').rows.length, 0);
        await tasks.displayAllTasks();
        assert.equal(element('taskGameFilter').value, '4');
        assert.equal(element('taskHideCompleted').checked, true);
        element('taskGameFilter').value = ''; change('taskGameFilter');
        assert.equal(element('gameScheduleBody').rows.length, 1);
        element('taskRefreshTypeFilter').value = ''; change('taskRefreshTypeFilter');
        element('taskHideCompleted').checked = false; change('taskHideCompleted');
        assert.equal(element('gameScheduleBody').rows.length, 3);
    });

    for (const game of EVENT_GAMES) await t.test(`${game.abbreviation} review displays only its pending source`, async () => {
        state.candidates = EVENT_GAMES.map((item, index) => ({ id: index + 1, source: item.source,
            name: `${item.abbreviation} needs a deadline`, status: 'pending', is_active: true, proposed_end_at: null }));
        await review.displayEventCandidates(game.key);
        assert.equal(element('eventReviewTitle').textContent, `Eventos encontrados: ${game.name}`);
        assert.match(element('eventReviewList').textContent, new RegExp(`${game.abbreviation} needs a deadline`));
        assert.equal(element('eventReviewList').children.length, 1);
        review.stopEventReviewTimer();
    });
});
