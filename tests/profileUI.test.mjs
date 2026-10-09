import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';
import { createTestDatabase } from './helpers/testDatabase.mjs';

test('real profile UI uses SQL contracts and only selected games', async t => {
    const harness = createDomHarness();
    const db = await createTestDatabase();
    t.after(async () => { harness.close(); await db.close(); });
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'log', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Profile tests stay offline'); });
    await db.exec('set role anon');
    const calls = [];
    const client = window.supabase.createClient();
    client.rpc = async (name, params = {}) => {
        calls.push({ name, params: structuredClone(params) });
        assert.match(name, /^[a-z_]+$/);
        const keys = Object.keys(params);
        assert.ok(keys.every(key => /^p_[a-z_]+$/.test(key)));
        try {
            const values = keys.map(key => ['p_game', 'p_task', 'p_definitions'].includes(key) ? JSON.stringify(params[key]) : params[key]);
            const result = await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, values);
            return { data: result.rows[0].result, error: null };
        } catch (error) { return { data: null, error }; }
    };
    const { selectProfile, clearProfile, getSelectedProfileId } = await import('../js/services/profileSession.js');
    // Load the actual entry point too: repository mocks cannot detect missing boot exports.
    await import('../js/index.js');
    const profiles = await import('../js/ui/profileUI.js');
    const tasks = await import('../js/ui/taskUI.js');
    const repo = await import('../js/database/taskDB.js');
    const { default: Router } = await import('../js/utils/router.js');
    const eventReview = await import('../js/ui/eventReviewUI.js');
    t.after(() => eventReview.stopEventReviewTimer());
    const el = id => document.getElementById(id);

    clearProfile();
    assert.equal(await profiles.initializeProfiles(), false);
    assert.equal(el('profileEntry').hidden, false);
    assert.deepEqual([...el('profileChoices').children].map(button => button.textContent), ['CRAN', 'Demo', 'Convidado']);
    assert.ok([...document.querySelectorAll('[data-page]')].every(page => page.style.display === 'none'));
    await assert.rejects(repo.fetchAllTasks(), /Selecione um perfil/);

    selectProfile('cran');
    assert.equal(await profiles.initializeProfiles(), true);
    assert.equal(el('activeProfileName').textContent, 'CRAN');
    window.localStorage.setItem('gacha-profile', 'demo');
    assert.equal(getSelectedProfileId(), 'cran', 'A preference changed by another tab must not change the actor displayed here');
    await repo.fetchAllTasks();
    assert.equal(calls.at(-1).params.p_profile_id, 'cran');
    selectProfile('cran');
    await profiles.displayProfileGames();
    const catalogue = (await db.query('select * from games')).rows;
    const gi = catalogue.find(game => game.abbreviation === 'GI');
    const zzz = catalogue.find(game => game.abbreviation === 'ZZZ');
    for (const input of el('profileGameChoices').querySelectorAll('input')) input.checked = [gi.id, zzz.id].includes(Number(input.value));
    el('saveProfileGamesBtn').click();
    await waitFor(() => el('loadingOverlay').hidden);
    assert.equal(el('gameListBody').rows.length, 2);
    await tasks.displayAllTasks();
    assert.equal(el('gameScheduleBody').rows.length, 3, 'GI and ZZZ contribute their weekly definitions');
    assert.equal(el('taskGameFilter').options.length, 3);
    const ownerTask = (await repo.fetchAllTasks())[0];
    await repo.completeTask(ownerTask.id, true);
    await repo.addTask({ description: 'Owner-only task', gameId: gi.id, gameDescription: gi.description,
        refreshType: 8, repeatDays: 3, expirationDate: new Date('2099-10-20T09:00:00Z') });
    await db.query(`insert into event_candidates (source,external_id,name,game_id,review_reason)
        values ('starrailassistant-genshin','ui-gi-review','GI review fixture',$1,'Unknown deadline'),
            ('starrailassistant-zzz','ui-zzz-review','ZZZ review fixture',$2,'Unknown deadline')`, [gi.id, zzz.id]);

    selectProfile('demo');
    await profiles.initializeProfiles();
    await profiles.displayProfileGames();
    assert.ok([...el('profileGameChoices').querySelectorAll('input')].every(input => !input.checked));
    for (const input of el('profileGameChoices').querySelectorAll('input')) input.checked = Number(input.value) === zzz.id;
    el('saveProfileGamesBtn').click();
    await waitFor(() => el('loadingOverlay').hidden);
    assert.equal(el('gameListBody').rows.length, 1);
    await tasks.displayAllTasks();
    assert.equal(el('taskGameFilter').options.length, 2);
    assert.equal(el('gameScheduleBody').rows.length, 2);
    assert.equal(el(`task-checkbox-${ownerTask.id}`).checked, false);
    assert.ok(!el('gameScheduleBody').textContent.includes('Owner-only task'));
    await Router.navigateTo('/events');
    assert.equal(el('eventGamesList').children.length, 1);
    assert.match(el('eventGamesList').textContent, /Zenless/);
    await Router.navigateTo('/events/genshin');
    assert.equal(el('eventReviewList').children.length, 0, 'Direct routes cannot reveal an unselected game');
    assert.equal(getSelectedProfileId(), 'demo');
    await Router.navigateTo('/events/zzz');
    assert.equal(el('eventReviewList').children.length, 1);
    const card = el('eventReviewList').firstElementChild;
    card.querySelector('input[type="datetime-local"]').value = '2099-10-20T06:00';
    card.querySelector('.button-save').click();
    await waitFor(() => el('eventReviewList').children.length === 0);
    assert.ok((await repo.fetchAllTasks()).some(task => task.description === 'ZZZ review fixture'));
    assert.deepEqual((await db.query(`select d.profile_id,d.status from profile_event_decisions d
        join event_candidates c on c.id=d.candidate_id where c.external_id='ui-zzz-review'`)).rows,
        [{ profile_id: 'demo', status: 'approved' }]);

    // Pending writes retain the actor even if the session changes before completion.
    selectProfile('cran');
    await repo.completeTask(ownerTask.id, false);
    const originalRpc = client.rpc;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    client.rpc = async (name, params) => { if (name === 'complete_profile_task') await gate; return originalRpc(name, params); };
    const pending = repo.completeTask(ownerTask.id, true);
    selectProfile('demo');
    release();
    await pending;
    client.rpc = originalRpc;
    assert.equal((await repo.fetchAllTasks()).find(task => task.id === ownerTask.id).isDone, false);
    selectProfile('cran');
    assert.equal((await repo.fetchAllTasks()).find(task => task.id === ownerTask.id).isDone, true);
    await Router.navigateTo('/events/zzz');
    assert.equal(el('eventReviewList').children.length, 1, 'Demo approval must not resolve the CRAN review');
    const ownerReview = el('eventReviewList').firstElementChild;
    ownerReview.querySelector('.button-neutral').click();
    await waitFor(() => el('eventReviewList').children.length === 0
        || ownerReview.querySelector('.event-review-message').textContent !== 'Salvando...');
    assert.equal(el('eventReviewList').children.length, 0, 'CRAN can ignore a shared candidate without owning its task');
    assert.deepEqual((await db.query(`select d.profile_id,d.status from profile_event_decisions d
        join event_candidates c on c.id=d.candidate_id where c.external_id='ui-zzz-review' order by d.profile_id`)).rows,
        [{ profile_id: 'cran', status: 'ignored' }, { profile_id: 'demo', status: 'approved' }]);

    selectProfile('guest');
    await profiles.initializeProfiles();
    await profiles.displayProfileGames();
    const hsr = catalogue.find(game => game.abbreviation === 'HSR');
    for (const input of el('profileGameChoices').querySelectorAll('input')) input.checked = Number(input.value) === hsr.id;
    el('includeProfileWeeklies').checked = false;
    el('saveProfileGamesBtn').click();
    await waitFor(() => el('loadingOverlay').hidden);
    await repo.populateInitialTasks();
    assert.equal((await repo.fetchAllTasks()).length, 0, 'Boot respects the decision to skip initial weeklies');
    await tasks.displayAllTasks();
    el('taskGameFilter').value = String(hsr.id);
    el('taskGameFilter').dispatchEvent(new harness.dom.window.Event('change'));
    el('loadTaskBatchBtn').click();
    await waitFor(() => el('loadingOverlay').hidden);
    assert.equal((await repo.fetchAllTasks()).length, 2, 'Explicit creation remains available after skipping');
    await Router.navigateTo('/tasks/create');
    await Router.navigateTo('/tasks/create');
    assert.equal(el('taskGameId').options.length, 1, 'Repeated navigation does not duplicate or retain unselected games');

    await t.test('hiding and reselecting a game through the UI retains completion and affects only the active profile', async () => {
        selectProfile('cran');
        await profiles.initializeProfiles();
        await Router.navigateTo('/');
        el(`delete-game-${zzz.id}`).click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.ok(!(await repo.fetchAllTasks()).some(task => task.gameId === zzz.id));
        assert.equal((await db.query("select enabled from profile_games where profile_id='demo' and game_id=$1", [zzz.id])).rows[0].enabled, true);
        await profiles.displayProfileGames();
        el('profileGameChoices').querySelector(`input[value="${zzz.id}"]`).checked = true;
        el('saveProfileGamesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal((await repo.fetchAllTasks()).find(task => task.id === ownerTask.id).isDone, true);
    });

    await t.test('catalogue failures disable saving and can be recovered without changing the selection', async () => {
        client.rpc = async (name, params) => name === 'profile_game_catalogue'
            ? { data: null, error: new Error('Catalogue unavailable') } : originalRpc(name, params);
        await profiles.displayProfileGames();
        assert.equal(el('saveProfileGamesBtn').disabled, true);
        assert.match(el('profileGamesStatus').textContent, /Não foi possível carregar/);
        assert.equal(el('loadingOverlay').hidden, true);
        client.rpc = originalRpc;
        await profiles.displayProfileGames();
        assert.equal(el('saveProfileGamesBtn').disabled, false);
        assert.equal(el('profileGameChoices').querySelector(`input[value="${zzz.id}"]`).checked, true);
    });

    await t.test('failed selection retains choices and blocks duplicate submissions while pending', async () => {
        let submitted = 0;
        let finish;
        const blocked = new Promise(resolve => { finish = resolve; });
        client.rpc = async (name, params) => {
            if (name !== 'set_profile_games') return originalRpc(name, params);
            submitted++;
            await blocked;
            return { data: null, error: new Error('Selection failed') };
        };
        el('profileGameChoices').querySelector(`input[value="${hsr.id}"]`).checked = true;
        el('includeProfileWeeklies').checked = false;
        el('saveProfileGamesBtn').click();
        el('saveProfileGamesBtn').click();
        assert.equal(submitted, 1);
        assert.equal(el('loadingOverlay').hidden, false);
        assert.equal(el('saveProfileGamesBtn').disabled, true);
        finish();
        await waitFor(() => el('loadingOverlay').hidden && !el('saveProfileGamesBtn').disabled);
        assert.match(el('profileGamesStatus').textContent, /Não foi possível concluir/);
        assert.equal(el('profileGameChoices').querySelector(`input[value="${hsr.id}"]`).checked, true);
        assert.equal((await db.query("select count(*)::int as n from profile_games where profile_id='cran' and enabled")).rows[0].n, 2);
        client.rpc = originalRpc;
        el('saveProfileGamesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal((await db.query("select count(*)::int as n from profile_games where profile_id='cran' and enabled")).rows[0].n, 3);
    });

    await t.test('a weekly failure after saving selection reports partial success and retries without recreating previous batches', async () => {
        await profiles.displayProfileGames();
        const wuwa = catalogue.find(game => game.abbreviation === 'WuWa');
        el('profileGameChoices').querySelector(`input[value="${wuwa.id}"]`).checked = true;
        el('includeProfileWeeklies').checked = true;
        client.rpc = async (name, params) => name === 'create_profile_weekly_batch'
            ? { data: null, error: new Error('Weekly unavailable') } : originalRpc(name, params);
        el('saveProfileGamesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden && !el('saveProfileGamesBtn').disabled);
        assert.match(el('profileGamesStatus').textContent, /conferir os jogos salvos/);
        assert.equal((await db.query("select enabled from profile_games where profile_id='cran' and game_id=$1", [wuwa.id])).rows[0].enabled, true);
        client.rpc = originalRpc;
        el('saveProfileGamesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden);
        const saved = await repo.fetchAllTasks();
        assert.equal(saved.filter(task => task.gameId === wuwa.id).length, 2);
        assert.equal(saved.filter(task => task.gameId === zzz.id).length, 2);
        assert.equal(saved.find(task => task.id === ownerTask.id).isDone, true);
    });

    assert.ok(calls.filter(call => call.name.startsWith('list_profile_')).every(call => ['cran', 'demo', 'guest'].includes(call.params.p_profile_id)));
});
