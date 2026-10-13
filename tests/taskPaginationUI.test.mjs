import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('task pagination filters and orders the full list before displaying a page', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Pagination tests stay offline'); });
    const tasks = await import('../js/ui/taskUI.js');
    const { selectProfile } = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const change = id => el(id).dispatchEvent(new dom.window.Event('change'));
    const order = () => [...el('gameScheduleBody').querySelectorAll('input[type="checkbox"]')]
        .map(box => Number(box.id.replace('task-checkbox-', '')));
    const range = (start, end) => Array.from({ length: end - start + 1 }, (_, index) => start + index);
    const seed = async (count = 45) => {
        selectProfile('cran');
        state.error = null;
        state.readError = null;
        state.beforeQuery = null;
        state.games = [{ id: 1, description: 'First game', abbreviation: 'GI' }, { id: 2, description: 'Second game', abbreviation: 'HSR' }];
        state.tasks = range(1, count).reverse().map(id => ({ id, description: `Task ${id}`, game_id: id <= 30 ? 1 : 2,
            expiration_date: new Date(Date.UTC(2099, 0, id)).toISOString(), is_favorite: count === 45 && id === 45,
            is_done: id === 3, refresh_type: id % 2 ? 1 : 2, repeat_days: id % 2 ? 1 : 7 }));
        await tasks.displayAllTasks();
        el('taskGameFilter').value = ''; change('taskGameFilter');
        el('taskRefreshTypeFilter').value = ''; change('taskRefreshTypeFilter');
        el('taskHideCompleted').checked = false; change('taskHideCompleted');
        el('taskPageSize').value = '20'; change('taskPageSize');
        state.writes = [];
    };
    const settled = () => waitFor(() => el('loadingOverlay').hidden);

    await t.test('20 by default, complete ordering, ranges, boundaries and no page queries', async () => {
        await seed();
        let calls = 0;
        state.beforeQuery = () => { calls++; };
        assert.deepEqual(order(), [45, ...range(1, 19)]);
        assert.match(el('taskPageStatus').textContent, /^1–20 de 45/);
        assert.equal(el('taskListStatus').textContent, '45 activities');
        assert.equal(el('taskPreviousPage').disabled, true);
        el('taskNextPage').click();
        assert.deepEqual(order(), range(20, 39));
        el('taskNextPage').click();
        assert.deepEqual(order(), range(40, 44));
        assert.match(el('taskPageStatus').textContent, /^41–45 de 45/);
        assert.equal(el('taskNextPage').disabled, true);
        el('taskNextPage').click();
        assert.deepEqual(order(), range(40, 44));
        el('taskPreviousPage').click();
        assert.deepEqual(order(), range(20, 39));
        assert.equal(calls, 0);
        assert.equal(state.writes.length, 0);
    });

    await t.test('size and every filter reset to page one; filters apply across all pages', async () => {
        await seed(); el('taskNextPage').click();
        el('taskPageSize').value = '10'; change('taskPageSize');
        assert.deepEqual(order(), [45, ...range(1, 9)]);
        el('taskNextPage').click();
        el('taskGameFilter').value = '2'; change('taskGameFilter');
        assert.deepEqual(order(), [45, ...range(31, 39)]);
        assert.match(el('taskPageStatus').textContent, /^1–10 de 15/);
        el('taskNextPage').click();
        el('taskRefreshTypeFilter').value = '1'; change('taskRefreshTypeFilter');
        assert.deepEqual(order(), [45, 31, 33, 35, 37, 39, 41, 43]);
        el('taskRefreshTypeFilter').value = ''; change('taskRefreshTypeFilter');
        el('taskGameFilter').value = ''; change('taskGameFilter');
        el('taskNextPage').click();
        el('taskHideCompleted').checked = true; change('taskHideCompleted');
        assert.deepEqual(order(), [45, 1, 2, 4, 5, 6, 7, 8, 9, 10]);
        assert.match(el('taskPageStatus').textContent, /^1–10 de 44/);
    });

    await t.test('favorite action keeps a valid page after reordering and reload', async () => {
        await seed(40); el('taskNextPage').click();
        el('favorite-task-21').focus();
        el('favorite-task-21').click(); await settled();
        assert.equal(state.tasks.find(task => task.id === 21).is_favorite, true);
        assert.deepEqual(order(), [20, ...range(22, 40)]);
        assert.match(el('taskPageStatus').textContent, /Página 2 de 2/);
        assert.equal(document.activeElement, el('taskPageSize'));
    });

    await t.test('removing the filtered game resets the page when the filter falls back', async () => {
        await seed(); el('taskGameFilter').value = '1'; change('taskGameFilter');
        el('taskNextPage').click();
        state.games = state.games.filter(game => game.id !== 1);
        await tasks.displayAllTasks();
        assert.equal(el('taskGameFilter').value, '');
        assert.deepEqual(order(), [45, ...range(1, 19)]);
        assert.match(el('taskPageStatus').textContent, /Página 1 de 3/);
    });

    await t.test('delete, completion and ignore recede when the last page becomes empty', async () => {
        for (const action of ['delete', 'complete', 'ignore']) {
            await seed(41);
            if (action === 'complete') { el('taskHideCompleted').checked = true; change('taskHideCompleted'); }
            // Make the pre-existing completed row visible so the last page has one item.
            state.tasks.find(task => task.id === 3).is_done = false;
            if (action === 'ignore') state.tasks.find(task => task.id === 41).event_candidates = [{ id: 900 }];
            await tasks.displayAllTasks();
            el('taskNextPage').click(); el('taskNextPage').click();
            assert.deepEqual(order(), [41]);
            if (action === 'complete') {
                el('task-checkbox-41').checked = true;
                el('task-checkbox-41').dispatchEvent(new dom.window.Event('change'));
            } else el('delete-task-41').click();
            await settled();
            assert.deepEqual(order(), range(21, 40));
            assert.match(el('taskPageStatus').textContent, /^21–40 de 40.*Página 2 de 2/);
        }
    });

    await t.test('failed action retains page; empty lists and profile changes have valid controls', async () => {
        await seed(40); el('taskNextPage').click();
        state.error = 'Rejected'; el('delete-task-40').click(); await settled();
        assert.deepEqual(order(), range(21, 40));
        selectProfile('demo'); await tasks.displayAllTasks();
        assert.deepEqual(order(), range(1, 20));
        state.tasks = []; await tasks.displayAllTasks();
        assert.deepEqual(order(), []);
        assert.equal(el('taskPageStatus').textContent, '0 atividades');
        assert.equal(el('taskPreviousPage').disabled, true);
        assert.equal(el('taskNextPage').disabled, true);
    });
});
