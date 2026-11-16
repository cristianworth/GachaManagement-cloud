import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Tasks opens in Month with shared filters, day actions and undated tasks', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.timers.enable({ apis:['Date'], now:+new Date(2026, 11, 31, 12) });
    const { displayAllTasks } = await import('../js/ui/taskUI.js');
    const { selectProfile } = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const change = id => el(id).dispatchEvent(new dom.window.Event('change'));
    const days = () => [...el('taskMonthDays').children];
    const names = id => [...el(id).querySelectorAll('.task-summary > span')].map(span => span.textContent);
    state.games = [{ id:1, abbreviation:'GI', description:'Genshin' }, { id:2, abbreviation:'HSR', description:'Star Rail' }];
    const deadline = new Date(2026, 11, 31, 23, 30).toISOString();
    state.tasks = [
        { id:1, description:'First deadline', game_id:1, refresh_type:0, expiration_date:deadline },
        { id:2, description:'Done deadline', game_id:1, refresh_type:0, expiration_date:deadline, is_done:true },
        { id:3, description:'Favorite deadline', game_id:2, refresh_type:0, expiration_date:deadline, is_favorite:true },
        { id:4, description:'Undated', game_id:1, refresh_type:0 },
        { id:5, description:'Next month', game_id:2, refresh_type:0, expiration_date:new Date(2027, 0, 1, 1).toISOString() },
        { id:6, description:'Hidden game deadline', game_id:3, refresh_type:0, expiration_date:deadline },
        { id:7, description:'Hidden game undated', game_id:3, refresh_type:0 },
    ];
    await displayAllTasks();
    assert.equal(el('taskMonthView').getAttribute('aria-pressed'), 'true');
    assert.equal(el('taskPagination').hidden, true);
    assert.equal(days()[30].getAttribute('aria-current'), 'date');
    assert.equal(days()[30].querySelector('.agenda-day-extra').textContent, '+1');
    assert.deepEqual(names('gameScheduleBody'), ['Favorite deadline', 'First deadline', 'Done deadline']);
    assert.deepEqual(names('taskUndatedBody'), ['Undated']);
    assert.equal(el('taskUndated').open, false);
    el('taskUndatedTitle').click();
    assert.equal(el('taskUndated').open, true);
    let reads = 0;
    state.beforeQuery = () => { reads++; };
    days()[30].focus();
    days()[30].dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true,cancelable:true}));
    assert.equal(document.activeElement, days()[29]);
    assert.equal(days()[30].getAttribute('aria-pressed'), 'true');
    document.activeElement.click();
    assert.equal(el('taskDayEmpty').hidden, false);
    assert.deepEqual(names('taskUndatedBody'), ['Undated']);
    assert.equal(el('taskUndated').open, true);

    el('taskNextMonth').click();
    assert.equal(el('taskMonthTitle').textContent, 'janeiro de 2027');
    assert.equal(el('taskDayTitle').textContent, '1 de janeiro');
    assert.deepEqual(names('gameScheduleBody'), ['Next month']);
    el('taskToday').click();
    el('taskGameFilter').value = '1'; change('taskGameFilter');
    el('taskHideCompleted').checked = true; change('taskHideCompleted');
    assert.deepEqual(names('gameScheduleBody'), ['First deadline']);
    el('taskListView').click();
    assert.equal(el('taskPagination').hidden, false);
    assert.deepEqual(names('gameScheduleBody'), ['First deadline', 'Undated']);
    el('taskMonthView').click();
    assert.equal(el('taskDayTitle').textContent, '31 de dezembro');
    assert.equal(document.querySelectorAll('#favorite-task-4').length, 1);
    assert.equal(reads, 0);

    el('favorite-task-4').click();
    await waitFor(() => el('loadingOverlay').hidden && el('favorite-task-4').getAttribute('aria-pressed') === 'true');
    assert.equal(state.tasks.find(task => task.id === 4).is_favorite, true);
    selectProfile('demo');
    state.tasks = [];
    await displayAllTasks();
    assert.equal(el('taskUndated').hidden, true);
    assert.equal(el('taskUndated').open, false);
    assert.equal(el('taskDayEmpty').hidden, false);
});
