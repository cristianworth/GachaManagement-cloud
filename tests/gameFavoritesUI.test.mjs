import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Games reads profile favorites without changing notes or the daily workflow', async t => {
    const { dom, state, close } = createDomHarness();
    const games = await import('../js/ui/gameUI.js');
    const { selectProfile } = await import('../js/services/profileSession.js');
    const { stopSilentRefresh } = await import('../js/ui/silentRefresh.js');
    const { default: Router } = await import('../js/utils/router.js');
    const client = window.supabase.createClient();
    const rpc = client.rpc.bind(client);
    const calls = [];
    let respond = null;
    t.mock.method(client, 'rpc', (name, payload) => {
        calls.push({ name, payload });
        return respond?.(name, payload) ?? rpc(name, payload);
    });
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Favorites tests stay offline'); });
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-31T12:00:00Z') });
    t.after(() => { games.stopGameUpdates(); stopSilentRefresh(); close(); });
    const el = id => document.getElementById(id);
    const titles = id => [...document.querySelectorAll(`tr[data-game-id="${id}"] .game-favorite-title`)].map(item => item.textContent);
    const favorite = (id, description, extra = {}) => ({ id, description, game_id: 1,
        is_favorite: true, is_done: false, refresh_type: 0, expiration_date: null, ...extra });
    const fixtures = [1, 2, 3].map(id => ({ id, abbreviation: id === 1 ? 'GI' : 'HSR',
        description: `Game ${id}`, current_stamina: 80, cap_stamina: 240, stamina_per_minute: 6,
        pending_tasks: 'Saved notes', max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-31T18:00:00Z' }));
    const deferred = () => {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        return { promise, resolve };
    };
    const seed = async (initialTasks = [favorite(1, 'Original favorite')]) => {
        games.stopGameUpdates(); stopSilentRefresh(); respond = null;
        selectProfile('cran'); document.activeElement.blur();
        history.replaceState({}, '', '/');
        for (const page of document.querySelectorAll('[data-page]')) page.style.display = page.dataset.page === 'games' ? 'block' : 'none';
        state.games = structuredClone(fixtures); state.tasks = initialTasks;
        el('taskGameFilter').value = '';
        state.writes = []; state.rpcCalls = []; state.readError = null;
        assert.equal(await games.displayAllGames(), true);
        calls.length = 0;
    };

    await t.test('one task read groups selected games, limits pending favorites and uses deadline then ID order', async () => {
        await seed([]);
        const longTitle = 'A very long favorite <img src=x> with a title that remains complete in accessible text';
        state.tasks = [
            favorite(50, 'No deadline'),
            favorite(30, 'Same deadline, higher ID', { expiration_date: '2026-11-02T12:00:00Z' }),
            favorite(20, longTitle, { expiration_date: '2026-11-02T12:00:00Z', start_at: '2026-11-01T12:00:00Z' }),
            favorite(40, 'Overdue', { expiration_date: '2026-10-30T12:00:00Z' }),
            favorite(60, 'Later deadline', { expiration_date: '2026-11-03T12:00:00Z' }),
            favorite(70, 'Other game, no deadline', { game_id: 2 }),
            favorite(3, 'Completed', { is_done: true }),
            favorite(4, 'Not favorite', { is_favorite: false }),
            favorite(5, 'Unselected game', { game_id: 999 }),
        ];
        assert.equal(await games.displayAllGames(), true);
        assert.deepEqual(calls.map(call => call.name).sort(), ['list_profile_games', 'list_profile_tasks']);
        assert.ok(calls.every(call => call.payload.p_profile_id === 'cran'));
        assert.deepEqual(titles(1), ['Overdue', longTitle, 'Same deadline, higher ID']);
        assert.deepEqual(titles(2), ['Other game, no deadline']);
        assert.equal(el('game-favorites-tasks-1').textContent, 'Ver em Tasks (+2)');
        assert.equal(el('game-favorites-tasks-2').textContent, 'Ver em Tasks');
        assert.match(document.querySelector('tr[data-game-id="2"] .game-favorite-deadline').textContent, /Sem prazo/);
        assert.equal(document.querySelectorAll('.game-favorites').length, 2);
        assert.equal(document.querySelector('.game-favorites img'), null, 'Titles are text, never interpreted HTML');
        assert.equal(document.querySelectorAll('.game-favorites button, .game-favorites input').length, 0);
        assert.equal(el('pendingTask1').value, 'Saved notes');
        assert.equal(el('daily-state-1').value, 'pending');
        assert.equal(state.writes.length, 0); assert.equal(state.rpcCalls.length, 0);
        const navigations = [];
        const navigationMock = t.mock.method(Router, 'navigateTo', path => navigations.push(path));
        el('game-favorites-tasks-1').click();
        assert.deepEqual(navigations, ['/tasks?game=1']);
        assert.equal(el('game-favorites-tasks-1').getAttribute('href'), `${Router.BASE_PATH}/tasks?game=1`);
        navigationMock.mock.restore();
    });

    await t.test('favorites stays first, but games with zero pending favorites open notes by default', async () => {
        await seed();
        const tabs = [...el('pendingTask1').closest('tr').querySelectorAll('[role="tab"]')];
        assert.deepEqual(tabs.map(tab => tab.textContent), ['Favoritas (1)', 'Anotações']);
        assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
        assert.equal(el('game-favorites-panel-1').hidden, false);
        assert.equal(el('game-notes-panel-1').hidden, true);
        assert.equal(el('game-favorites-tab-2').textContent, 'Favoritas (0)');
        assert.equal(el('game-favorites-tab-2').getAttribute('aria-selected'), 'false');
        assert.equal(el('game-favorites-panel-2').hidden, true);
        assert.equal(el('game-notes-panel-2').hidden, false);
        assert.match(el('game-favorites-panel-2').textContent, /Nenhuma favorita pendente/);
        assert.equal(el('game-favorites-tasks-2').hidden, true);
    });

    await t.test('only a confirmed empty read opens notes; pending or failed reads do not count as zero', async () => {
        await seed(); selectProfile('demo'); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const load = games.displayAllGames();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(el('game-favorites-tab-1').getAttribute('aria-selected'), 'true');
        gate.resolve({ data: [], error: null }); await load;
        assert.equal(el('game-notes-tab-1').getAttribute('aria-selected'), 'true');
        selectProfile('guest');
        respond = name => name === 'list_profile_tasks' ? Promise.resolve({ data: null, error: new Error('Offline') }) : undefined;
        await games.displayAllGames();
        assert.equal(el('game-favorites-tab-1').getAttribute('aria-selected'), 'true');
        assert.match(el('game-favorites-panel-1').textContent, /indisponíveis/);
    });

    await t.test('an explicit tab choice during the read and notes already being edited are never overridden', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const load = games.displayAllGames();
        await waitFor(() => el('loadingOverlay').hidden);
        el('game-favorites-tab-1').click();
        gate.resolve({ data: [], error: null }); await load;
        assert.equal(el('game-favorites-tab-1').getAttribute('aria-selected'), 'true');
        respond = null; state.tasks = []; await games.displayAllGames();
        assert.equal(el('game-notes-tab-1').getAttribute('aria-selected'), 'true');
        const nextGate = deferred();
        respond = name => name === 'list_profile_tasks' ? nextGate.promise : undefined;
        const nextLoad = games.displayAllGames();
        await waitFor(() => el('loadingOverlay').hidden);
        const notes = el('pendingTask1'); notes.focus(); notes.value = 'Keep this editor visible';
        nextGate.resolve({ data: [favorite(3, 'New favorite')], error: null }); await nextLoad;
        assert.equal(el('game-notes-panel-1').hidden, false); assert.equal(document.activeElement, notes);
        assert.equal(notes.value, 'Keep this editor visible');
    });

    await t.test('the Games link opens Tasks filtered by that game and a direct URL restores the same filter', async () => {
        await seed([favorite(1, 'First game'), favorite(2, 'Second game', { game_id: 2 })]);
        state.tasks.push(...Array.from({length:24}, (_, index) => favorite(index + 3, `Extra ${index}`, {is_favorite:false})));
        await Router.navigateTo('/tasks');
        el('taskGameFilter').value = '1'; el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
        el('taskPageSize').value = '10'; el('taskPageSize').dispatchEvent(new dom.window.Event('change'));
        el('taskNextPage').click(); assert.match(el('taskPageStatus').textContent, /Página 2/);
        await Router.navigateTo('/'); el('game-favorites-tasks-2').click();
        await waitFor(() => el('loadingOverlay').hidden && el('taskGameFilter').value === '2');
        assert.equal(window.location.pathname, '/tasks'); assert.equal(window.location.search, '?game=2');
        assert.match(el('gameScheduleBody').textContent, /Second game/);
        assert.doesNotMatch(el('gameScheduleBody').textContent, /First game|Extra/);
        assert.match(el('taskPageStatus').textContent, /Página 1 de 1/);
        el('taskGameFilter').value = '1'; el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
        await Router.route();
        assert.equal(el('taskGameFilter').value, '2', 'Reloading the URL reapplies its explicit game filter');
        await Router.navigateTo('/tasks?game=999'); assert.equal(el('taskGameFilter').value, '');
        assert.equal(state.writes.length, 0);
    });

    await t.test('failed filtered navigation retains its requested game for retry', async () => {
        await seed([favorite(1, 'First game'), favorite(2, 'Second game', { game_id: 2 })]);
        state.readError = 'Offline'; await Router.navigateTo('/tasks?game=2');
        assert.equal(el('taskListRetry').hidden, false);
        state.readError = null; el('taskListRetry').click();
        await waitFor(() => el('loadingOverlay').hidden && el('taskGameFilter').value === '2');
        assert.match(el('gameScheduleBody').textContent, /Second game/);
        assert.doesNotMatch(el('gameScheduleBody').textContent, /First game/);
        assert.equal(state.writes.length, 0);
    });

    await t.test('the GitHub Pages redirect preserves the game query through Router initialization', async () => {
        await seed([favorite(1, 'First game'), favorite(2, 'Second game', { game_id: 2 })]);
        const html = await readFile(new URL('../404.html', import.meta.url), 'utf8');
        let redirected;
        new Function('window', html.match(/<script>([\s\S]*?)<\/script>/)[1])({ location: {
            pathname: '/GachaManagement-cloud/tasks', hostname: 'cristianworth.github.io', search: '?game=2',
            replace: url => { redirected = url; },
        } });
        assert.equal(redirected, '/GachaManagement-cloud/?game=2#/tasks');
        const originalBase = Router.BASE_PATH;
        try {
            Router.BASE_PATH = '/GachaManagement-cloud';
            history.replaceState({}, '', redirected);
            await Router.init();
            assert.equal(window.location.pathname, '/GachaManagement-cloud/tasks');
            assert.equal(window.location.search, '?game=2'); assert.equal(el('taskGameFilter').value, '2');
            assert.match(el('gameScheduleBody').textContent, /Second game/);
        } finally { Router.BASE_PATH = originalBase; }
    });

    await t.test('tabs support keyboard navigation and keep the same unsaved notes and cursor when switching', async () => {
        await seed();
        const favoritesTab = el('game-favorites-tab-1');
        const notesTab = el('game-notes-tab-1');
        favoritesTab.focus();
        favoritesTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal(document.activeElement, notesTab); assert.equal(notesTab.tabIndex, 0);
        assert.equal(favoritesTab.tabIndex, -1); assert.equal(el('game-notes-panel-1').hidden, false);
        assert.equal(el('game-favorites-panel-1').hidden, true); assert.equal(el('game-favorites-tasks-1').hidden, false);
        const notes = el('pendingTask1'); notes.value = 'Draft kept between tabs'; notes.setSelectionRange(3, 8, 'backward');
        notesTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        assert.equal(document.activeElement, favoritesTab); assert.equal(el('game-favorites-tasks-1').hidden, false);
        favoritesTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.equal(document.activeElement, notesTab); assert.equal(el('pendingTask1'), notes);
        assert.equal(notes.value, 'Draft kept between tabs');
        assert.deepEqual([notes.selectionStart, notes.selectionEnd, notes.selectionDirection], [3, 8, 'backward']);
        notesTab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        assert.equal(document.activeElement, favoritesTab);
        assert.equal(state.writes.length, 0);
    });

    await t.test('refreshes keep the selected tab per game and a late favorites read never hides an active notes editor', async () => {
        await seed();
        el('game-notes-tab-1').click();
        el('pendingTask1').value = 'Draft through refresh';
        const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const load = games.displayAllGames({ preserveDrafts: true });
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(el('game-notes-panel-1').hidden, false);
        assert.equal(el('game-notes-panel-2').hidden, false);
        const notes = el('pendingTask1'); notes.focus(); notes.setSelectionRange(1, 4);
        gate.resolve({ data: [favorite(2, 'Arrived while editing')], error: null });
        await load;
        assert.equal(el('game-notes-panel-1').hidden, false); assert.equal(el('game-favorites-panel-1').hidden, true);
        assert.equal(el('pendingTask1'), notes); assert.equal(document.activeElement, notes);
        assert.equal(notes.value, 'Draft through refresh');
        assert.deepEqual([notes.selectionStart, notes.selectionEnd], [1, 4]);
        respond = null;
        await games.displayAllGames({ preserveDrafts: true, silent: true });
        assert.equal(el('game-notes-panel-1').hidden, false); assert.equal(el('pendingTask1').value, notes.value);
        el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden && state.writes.length === 1);
        assert.equal(el('game-notes-panel-1').hidden, false); assert.equal(state.games[0].pending_tasks, notes.value);
        selectProfile('demo'); await games.displayAllGames();
        assert.equal(el('game-favorites-tab-1').getAttribute('aria-selected'), 'true');
    });

    await t.test('slow favorites keep the previous snapshot through card rebuilding and preserve edits and cursor', async () => {
        await seed();
        const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        el('pendingTask1').value = 'Draft before rebuilding';
        const load = games.displayAllGames({ preserveDrafts: true });
        await waitFor(() => el('loadingOverlay').hidden);
        assert.deepEqual(titles(1), ['Original favorite']);
        const notes = el('pendingTask1'); notes.value = 'Draft while favorites are pending';
        notes.focus(); notes.setSelectionRange(2, 9, 'backward');
        el('currentStamina1').value = '17';
        gate.resolve({ data: [favorite(2, 'Fresh favorite')], error: null });
        assert.equal(await load, true);
        assert.deepEqual(titles(1), ['Fresh favorite']);
        assert.equal(el('pendingTask1'), notes); assert.equal(document.activeElement, notes);
        assert.equal(notes.value, 'Draft while favorites are pending');
        assert.deepEqual([notes.selectionStart, notes.selectionEnd, notes.selectionDirection], [2, 9, 'backward']);
        assert.equal(el('currentStamina1').value, '17');
        assert.equal(state.writes.length, 0);
    });

    await t.test('tasks arriving before games wait for the corresponding cards and preserve edits made during the games read', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_games' ? gate.promise
            : name === 'list_profile_tasks' ? Promise.resolve({ data: [favorite(2, 'Early tasks')], error: null }) : undefined;
        const notes = el('pendingTask1');
        const load = games.displayAllGames({ preserveDrafts: true });
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(titles(1), ['Original favorite']);
        notes.value = 'Edited while games were pending'; notes.focus(); notes.setSelectionRange(3, 8);
        gate.resolve({ data: structuredClone(fixtures), error: null });
        assert.equal(await load, true);
        assert.deepEqual(titles(1), ['Early tasks']);
        assert.equal(el('pendingTask1').value, notes.value); assert.equal(document.activeElement, el('pendingTask1'));
        assert.deepEqual([el('pendingTask1').selectionStart, el('pendingTask1').selectionEnd], [3, 8]);
    });

    await t.test('partial failure keeps favorites and drafts, reports unavailability and retries without writing', async () => {
        await seed();
        respond = name => name === 'list_profile_tasks' ? Promise.resolve({ data: null, error: new Error('Offline') }) : undefined;
        el('pendingTask1').value = 'Keep this draft';
        assert.equal(await games.displayAllGames({ preserveDrafts: true }), false);
        assert.deepEqual(titles(1), ['Original favorite']);
        assert.equal(el('pendingTask1').value, 'Keep this draft');
        assert.match(el('gameFavoritesMessage').textContent, /últimas disponíveis foram mantidas/);
        assert.equal(el('gameListRetry').hidden, false); assert.equal(el('save-game-1').disabled, false);
        respond = null; state.tasks = [];
        el('gameListRetry').click();
        await waitFor(() => el('gameListRetry').disabled === false && el('gameFavoritesMessage').hidden);
        assert.equal(document.querySelector('.game-favorites'), null, 'An empty successful read removes the old snapshot');
        assert.equal(el('pendingTask1').value, 'Keep this draft'); assert.equal(state.writes.length, 0);
        selectProfile('demo');
        respond = name => name === 'list_profile_tasks' ? Promise.resolve({ data: null, error: new Error('Offline') }) : undefined;
        assert.equal(await games.displayAllGames(), false);
        assert.equal(document.querySelector('.game-favorites'), null);
        assert.match(el('gameFavoritesMessage').textContent, /favoritas estão indisponíveis/);
    });

    await t.test('a silent partial failure keeps the old snapshot and manual feedback, while canApply defers favorites', async () => {
        await seed();
        el('gameListMessage').textContent = 'Manual save confirmation';
        respond = name => name === 'list_profile_tasks' ? Promise.resolve({ data: null, error: new Error('Offline') }) : undefined;
        assert.equal(await games.displayAllGames({ silent: true, preserveDrafts: true }), false);
        assert.deepEqual(titles(1), ['Original favorite']);
        assert.equal(el('gameListMessage').textContent, 'Manual save confirmation');
        assert.equal(el('gameFavoritesMessage').hidden, true); assert.equal(el('gameListRetry').hidden, true);
        const gate = deferred(); let applicable = true;
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const load = games.displayAllGames({ silent: true, preserveDrafts: true, canApply: () => applicable });
        await new Promise(resolve => setImmediate(resolve));
        applicable = false; gate.resolve({ data: [favorite(2, 'Deferred favorite')], error: null });
        assert.equal(await load, null); assert.deepEqual(titles(1), ['Original favorite']);
    });

    await t.test('a games failure cannot apply early favorites and a failed new profile load cannot expose the old snapshot', async () => {
        await seed();
        respond = name => name === 'list_profile_games' ? Promise.resolve({ data: null, error: new Error('Games offline') })
            : name === 'list_profile_tasks' ? Promise.resolve({ data: [favorite(2, 'Not applied')], error: null }) : undefined;
        assert.equal(await games.displayAllGames(), false);
        assert.deepEqual(titles(1), ['Original favorite']);
        selectProfile('demo');
        assert.equal(await games.displayAllGames(), false);
        assert.equal(document.querySelector('.game-favorites'), null);
    });

    await t.test('a successful Save completes the daily state without waiting for a slow favorites read', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        el('pendingTask1').value = 'Saved during this operation';
        el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden && el('daily-state-1').value === 'done');
        assert.equal(state.writes.length, 1); assert.equal(state.games[0].pending_tasks, 'Saved during this operation');
        assert.deepEqual(titles(1), ['Original favorite']);
        gate.resolve({ data: [favorite(2, 'After saving')], error: null });
        await waitFor(() => titles(1)[0] === 'After saving');
        assert.equal(el('daily-state-1').value, 'done');
    });

    await t.test('a newer load wins over an older favorites response even for the same game and profile', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const older = games.displayAllGames({ preserveDrafts: true });
        await waitFor(() => el('loadingOverlay').hidden);
        respond = null; state.tasks = [favorite(3, 'Newer load')];
        await games.displayAllGames({ preserveDrafts: true });
        const row = el('pendingTask1').closest('tr');
        gate.resolve({ data: [favorite(2, 'Obsolete')], error: null });
        assert.equal(await older, false); assert.deepEqual(titles(1), ['Newer load']);
        assert.equal(el('pendingTask1').closest('tr'), row);
    });

    await t.test('profile changes never reuse the previous favorites or accept its pending response', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const older = games.displayAllGames({ preserveDrafts: true });
        await waitFor(() => el('loadingOverlay').hidden);
        selectProfile('demo'); const demoGate = deferred();
        respond = name => name === 'list_profile_tasks' ? demoGate.promise : undefined;
        const newer = games.displayAllGames();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(document.querySelector('.game-favorites'), null);
        gate.resolve({ data: [favorite(2, 'CRAN only')], error: null });
        assert.equal(await older, false); assert.equal(document.querySelector('.game-favorites'), null);
        demoGate.resolve({ data: [favorite(3, 'Demo only')], error: null });
        assert.equal(await newer, true); assert.deepEqual(titles(1), ['Demo only']);
        assert.deepEqual(calls.filter(call => call.name === 'list_profile_tasks').map(call => call.payload.p_profile_id), ['cran', 'demo']);
    });

    await t.test('navigation away and back invalidates pending favorites and returning from Tasks reads saved changes', async () => {
        await seed(); const gate = deferred();
        respond = name => name === 'list_profile_tasks' ? gate.promise : undefined;
        const older = games.displayAllGames();
        await waitFor(() => el('loadingOverlay').hidden);
        await Router.navigateTo('/tasks/create');
        respond = null; state.tasks = [favorite(3, 'After returning')];
        await Router.navigateTo('/');
        gate.resolve({ data: [favorite(2, 'Before navigation')], error: null });
        assert.equal(await older, false); assert.deepEqual(titles(1), ['After returning']);
        await Router.navigateTo('/tasks');
        el('favorite-task-3').click();
        await waitFor(() => state.tasks[0].is_favorite === false && el('loadingOverlay').hidden);
        await Router.navigateTo('/');
        assert.equal(document.querySelector('.game-favorites'), null);
        // Completion in Tasks affects the list only; it never completes the game's daily state.
        state.tasks = [favorite(4, 'Complete in Tasks')];
        await Router.navigateTo('/tasks');
        el('task-checkbox-4').click();
        await waitFor(() => state.tasks[0].is_done && el('loadingOverlay').hidden);
        await Router.navigateTo('/');
        assert.equal(document.querySelector('.game-favorites'), null); assert.equal(el('daily-state-1').value, 'pending');
        assert.equal(state.writes.length, 2);
    });
});
