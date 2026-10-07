import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';
import { createTestDatabase } from './helpers/testDatabase.mjs';

test('favorite stars use real profile SQL, retain filters and recover from failures', async t => {
    const harness = createDomHarness();
    const db = await createTestDatabase();
    t.after(async () => { harness.close(); await db.close(); });
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Favorite tests stay offline'); });
    await db.exec('set role anon');
    const calls = [];
    const client = window.supabase.createClient();
    const sqlRpc = async (name, params = {}) => {
        calls.push({ name, params: structuredClone(params) });
        assert.match(name, /^[a-z_]+$/);
        const keys = Object.keys(params);
        assert.ok(keys.every(key => /^p_[a-z_]+$/.test(key)));
        try {
            const values = keys.map(key => ['p_task', 'p_game', 'p_definitions'].includes(key) ? JSON.stringify(params[key]) : params[key]);
            const result = await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, values);
            return { data: result.rows[0].result, error: null };
        } catch (error) { return { data: null, error }; }
    };
    client.rpc = sqlRpc;
    const { selectProfile } = await import('../js/services/profileSession.js');
    const tasks = await import('../js/ui/taskUI.js');
    const repo = await import('../js/database/taskDB.js');
    const el = id => document.getElementById(id);
    const star = id => el(`favorite-task-${id}`);
    const order = () => [...el('gameScheduleBody').rows].map(row => Number(row.querySelector('.task-favorite-toggle').id.split('-').at(-1)));
    const change = id => el(id).dispatchEvent(new harness.dom.window.Event('change'));
    const settled = id => waitFor(() => el('loadingOverlay').hidden && !star(id)?.disabled);
    const catalogue = (await db.query('select * from games')).rows;
    const gi = catalogue.find(game => game.abbreviation === 'GI');
    const zzz = catalogue.find(game => game.abbreviation === 'ZZZ');
    for (const profile of ['cran', 'demo']) await sqlRpc('set_profile_games', { p_profile_id: profile, p_game_ids: [gi.id, zzz.id] });
    selectProfile('cran');
    const early = await repo.addTask({ description: 'Early daily', gameId: gi.id, refreshType: 1, repeatDays: 1, expirationDate: new Date('2099-10-10T09:00:00Z') });
    const later = await repo.addTask({ description: 'Important weekly', gameId: gi.id, refreshType: 2, repeatDays: 7, expirationDate: new Date('2099-10-20T09:00:00Z') });
    await db.query(`insert into event_candidates (source,external_id,name,game_id,proposed_end_at)
        values ('starrailassistant-zzz','ui-favorite-edition','Shared event',$1,'2099-10-15T09:00:00Z')`, [zzz.id]);
    await sqlRpc('import_event_candidates', { p_source: 'starrailassistant-zzz' });
    const shared = (await db.query("select task_id from event_candidates where external_id='ui-favorite-edition'")).rows[0].task_id;

    await t.test('persisting a star moves its row ahead of earlier deadlines and retains keyboard focus', async () => {
        await tasks.displayAllTasks();
        assert.deepEqual(order(), [early.id, shared, later.id]);
        star(later.id).focus(); star(later.id).click();
        await settled(later.id);
        assert.deepEqual(order(), [later.id, early.id, shared]);
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'true');
        assert.equal(star(later.id).textContent, '★');
        assert.equal(star(later.id).getAttribute('aria-label'), 'Desfavoritar Important weekly');
        assert.equal(document.activeElement, star(later.id));
        await tasks.displayAllTasks();
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'true');
    });

    await t.test('game, interval and completed filters still exclude favorites', async () => {
        el('taskGameFilter').value = String(zzz.id); change('taskGameFilter');
        assert.deepEqual(order(), [shared]);
        el('taskGameFilter').value = String(gi.id); change('taskGameFilter');
        el('taskRefreshTypeFilter').value = '1'; change('taskRefreshTypeFilter');
        assert.deepEqual(order(), [early.id]);
        el('taskRefreshTypeFilter').value = ''; change('taskRefreshTypeFilter');
        el('taskHideCompleted').checked = true; change('taskHideCompleted');
        el(`task-checkbox-${later.id}`).checked = true;
        el(`task-checkbox-${later.id}`).dispatchEvent(new harness.dom.window.Event('change'));
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(star(later.id), null);
        el('taskHideCompleted').checked = false; change('taskHideCompleted');
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'true');
    });

    await t.test('a rejected save keeps the previous star and allows retry', async () => {
        client.rpc = async (name, params) => name === 'set_profile_task_favorite'
            ? { data: null, error: new Error('Write denied') } : sqlRpc(name, params);
        star(later.id).click(); await settled(later.id);
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'true');
        assert.match(el('taskListMessage').textContent, /estrela anterior/);
        client.rpc = sqlRpc;
    });

    await t.test('saved preference survives failed reload; list retry does not repeat the write', async () => {
        let saves = 0;
        client.rpc = async (name, params) => {
            if (name === 'set_profile_task_favorite') saves++;
            if (name === 'list_profile_tasks') return { data: null, error: new Error('Read denied') };
            return sqlRpc(name, params);
        };
        star(later.id).click(); await settled(later.id);
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'false');
        assert.deepEqual(order(), [early.id, later.id]);
        assert.match(el('taskListMessage').textContent, /Porém/);
        client.rpc = sqlRpc;
        el('taskListRetry').click(); await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(saves, 1);
        assert.equal(star(later.id).getAttribute('aria-pressed'), 'false');
        el('taskGameFilter').value = ''; change('taskGameFilter');
    });

    await t.test('pending save blocks duplicate toggles and captures the displayed profile', async () => {
        let finish;
        const gate = new Promise(resolve => { finish = resolve; });
        let writes = 0;
        client.rpc = async (name, params) => {
            if (name === 'set_profile_task_favorite') { writes++; await gate; }
            return sqlRpc(name, params);
        };
        star(shared).click(); star(shared).click();
        assert.equal(star(shared).disabled, true);
        assert.equal(writes, 1);
        window.localStorage.setItem('gacha-profile', 'demo');
        finish(); await settled(shared);
        assert.equal(calls.findLast(call => call.name === 'set_profile_task_favorite').params.p_profile_id, 'cran');
        assert.equal(star(shared).getAttribute('aria-pressed'), 'true');
        client.rpc = sqlRpc;
    });

    await t.test('another profile has its own preference and hiding a game preserves the original', async () => {
        selectProfile('demo'); await tasks.displayAllTasks();
        assert.deepEqual(order(), [shared]);
        assert.equal(star(shared).getAttribute('aria-pressed'), 'false');
        selectProfile('cran');
        await sqlRpc('set_profile_games', { p_profile_id: 'cran', p_game_ids: [gi.id] });
        await tasks.displayAllTasks();
        assert.equal(star(shared), null);
        await sqlRpc('set_profile_games', { p_profile_id: 'cran', p_game_ids: [gi.id, zzz.id] });
        await tasks.displayAllTasks();
        assert.equal(star(shared).getAttribute('aria-pressed'), 'true');
        assert.deepEqual(order(), [shared, early.id, later.id]);
    });

    await t.test('the real recurring renewal routine reopens a favorite without resetting its star', async sub => {
        sub.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T12:00:00Z') });
        await repo.setTaskFavorite(early.id, true);
        await db.query(`update profile_tasks set expiration_date='2026-10-06T09:00:00Z',is_done=true
            where profile_id='cran' and task_id=$1`, [early.id]);
        const { updateExpiratedTasksRoutine } = await import('../js/database/dbInit.js');
        await updateExpiratedTasksRoutine();
        const renewed = await repo.fetchTaskById(early.id);
        assert.equal(renewed.isFavorite, true);
        assert.equal(renewed.isDone, false);
        assert.equal(renewed.expirationDate.toISOString(), '2026-10-07T09:00:00.000Z');
        assert.equal(star(early.id).getAttribute('aria-pressed'), 'true');
    });
});
