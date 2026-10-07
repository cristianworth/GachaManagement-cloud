import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/testDatabase.mjs';

const deadline = '2099-10-12T09:00:00Z';
async function rpc(db, name, params) {
    const placeholders = params.map((_, index) => `$${index + 1}`).join(',');
    return (await db.query(`select public.${name}(${placeholders}) as result`, params)).rows[0].result;
}
const listTasks = (db, id) => rpc(db, 'list_profile_tasks', [id]);
const selectGames = (db, id, games) => rpc(db, 'set_profile_games', [id, games]);
const payload = (game, overrides = {}) => ({ description: 'Private task', expiration_date: deadline, is_done: false,
    refresh_type: 2, repeat_days: 7, game_id: game.id, game_description: game.description, ...overrides });
async function candidate(db, game, overrides = {}) {
    const c = { source: 'starrailassistant-genshin', external_id: 'edition-one', name: 'Shared event',
        game_id: game.id, proposed_start_at: '2099-10-01T09:00:00Z', source_start_at: '2099-10-01T04:00:00Z',
        source_end_at: '2099-10-12T04:00:00Z', proposed_end_at: deadline, ...overrides };
    const keys = Object.keys(c);
    return (await db.query(`insert into event_candidates (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(c))).rows[0];
}

for (const migrated of [false, true]) {
    test(`profile contracts as anon (${migrated ? 'upgrade' : 'fresh schema'})`, async t => {
        const db = await createTestDatabase({ migrated });
        try {
            await db.exec('set role anon');
            const gi = (await db.query("select * from games where abbreviation = 'GI'")).rows[0];
            const zzz = (await db.query("select * from games where abbreviation = 'ZZZ'")).rows[0];
            assert.equal((await db.query("select img from games where abbreviation = 'NTE'")).rows[0].img, 'img/nte-icon.png');
            const profiles = (await db.query('select id,name from profiles order by sort_order')).rows;
            assert.deepEqual(profiles, [{ id: 'cran', name: 'CRAN' }, { id: 'demo', name: 'Demo' }, { id: 'guest', name: 'Convidado' }]);
            await assert.rejects(db.query("update profiles set name='Someone else' where id='cran'"), /permission denied/);
            await assert.rejects(db.query("delete from profiles where id='guest'"), /permission denied/);
            await selectGames(db, 'cran', [gi.id, zzz.id]);
            await selectGames(db, 'demo', [gi.id, zzz.id]);
            await selectGames(db, 'guest', []);

            await t.test('selection and stamina belong to a profile; invalid selection rolls back', async () => {
                await rpc(db, 'save_profile_game', ['cran', JSON.stringify({ abbreviation: 'GI', current_stamina: 50, pending_tasks: 'Owner note' }), gi.id]);
                assert.equal((await rpc(db, 'list_profile_games', ['cran'])).find(g => g.id === gi.id).current_stamina, 50);
                assert.equal((await rpc(db, 'list_profile_games', ['demo'])).find(g => g.id === gi.id).current_stamina, 0);
                await assert.rejects(selectGames(db, 'demo', [999999]), /inválido/);
                assert.equal((await rpc(db, 'list_profile_games', ['demo'])).length, 2);
                await assert.rejects(selectGames(db, 'missing', []), /Perfil inválido/);
            });

            let privateTask;
            await t.test('manual tasks are private; foreign writes and linking are rejected', async () => {
                privateTask = await rpc(db, 'save_profile_task', ['cran', JSON.stringify(payload(gi))]);
                assert.ok(privateTask.id);
                assert.ok((await listTasks(db, 'cran')).some(t => t.id === privateTask.id));
                assert.ok(!(await listTasks(db, 'demo')).some(t => t.id === privateTask.id));
                await assert.rejects(rpc(db, 'save_profile_task', ['demo', JSON.stringify(payload(gi)), privateTask.id]), /neste perfil/);
                await assert.rejects(rpc(db, 'complete_profile_task', ['demo', privateTask.id, true]), /Selecione/);
                await assert.rejects(rpc(db, 'save_profile_task', ['guest', JSON.stringify(payload(gi))]), /Selecione/);
            });

            await t.test('custom games are visible only in their owner catalogue', async () => {
                const custom = await rpc(db, 'save_profile_game', ['cran', JSON.stringify({ description: 'My custom game', abbreviation: 'MY', cap_stamina: 100, stamina_per_minute: 6 })]);
                assert.ok((await rpc(db, 'profile_game_catalogue', ['cran'])).some(game => game.id === custom.id));
                assert.ok(!(await rpc(db, 'profile_game_catalogue', ['demo'])).some(game => game.id === custom.id));
                await assert.rejects(selectGames(db, 'demo', [custom.id]), /inválido/);
                await assert.rejects(rpc(db, 'save_profile_game', ['demo', JSON.stringify({ description: 'Duplicate source', abbreviation: 'GI' })]), /sigla já existe/);
            });

            const c = await candidate(db, gi);
            await rpc(db, 'import_event_candidates', [c.source]);
            const sharedId = (await db.query('select task_id from event_candidates where id = $1', [c.id])).rows[0].task_id;
            await t.test('completion and manual deadlines survive synchronization independently', async () => {
                await rpc(db, 'complete_profile_task', ['cran', sharedId, true]);
                const ownerTask = (await listTasks(db, 'cran')).find(t => t.id === sharedId);
                await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...ownerTask, expiration_date: '2099-10-20T09:00:00Z', cover_url: 'https://example.com/shared.png' }), sharedId]);
                const demoBefore = (await listTasks(db, 'demo')).find(t => t.id === sharedId);
                assert.equal(demoBefore.is_done, false);
                assert.equal(demoBefore.cover_url, 'https://example.com/shared.png');
                await db.query('update event_candidates set proposed_end_at = $1 where id = $2', ['2099-10-15T09:00:00Z', c.id]);
                await rpc(db, 'import_event_candidates', [c.source]);
                const owner = (await listTasks(db, 'cran')).find(t => t.id === sharedId);
                const demo = (await listTasks(db, 'demo')).find(t => t.id === sharedId);
                assert.equal(owner.is_done, true);
                assert.equal(new Date(owner.expiration_date).toISOString(), '2099-10-20T09:00:00.000Z');
                assert.equal(owner.event_deadline_manual, true);
                assert.equal(new Date(demo.expiration_date).toISOString(), '2099-10-15T09:00:00.000Z');
                await rpc(db, 'restore_profile_api_deadline', ['cran', c.id]);
                assert.equal((await listTasks(db, 'cran')).find(t => t.id === sharedId).event_deadline_manual, false);
            });

            await t.test('ignoring an imported task affects only one profile and survives hiding a game', async () => {
                await rpc(db, 'ignore_profile_task', ['demo', sharedId]);
                await rpc(db, 'import_event_candidates', [c.source]);
                assert.ok(!(await listTasks(db, 'demo')).some(t => t.id === sharedId));
                assert.ok((await listTasks(db, 'cran')).some(t => t.id === sharedId));
                await selectGames(db, 'demo', [zzz.id]);
                await selectGames(db, 'demo', [gi.id, zzz.id]);
                assert.ok(!(await listTasks(db, 'demo')).some(t => t.id === sharedId));
                await selectGames(db, 'guest', [gi.id]);
                assert.equal((await listTasks(db, 'guest')).find(t => t.id === sharedId).is_done, false);
            });

            await t.test('review approval and ignores are personal; unsafe deadlines stay in review for others', async () => {
                const pending = await candidate(db, gi, { external_id: 'review-one', name: 'Needs review', proposed_end_at: null, review_reason: 'Unknown deadline' });
                await rpc(db, 'ignore_profile_candidate', ['cran', pending.id]);
                await rpc(db, 'approve_profile_candidate', ['demo', pending.id, deadline]);
                assert.ok((await listTasks(db, 'demo')).some(t => t.description === 'Needs review'));
                assert.ok(!(await listTasks(db, 'guest')).some(t => t.description === 'Needs review'));
                assert.ok((await rpc(db, 'list_profile_candidates', ['guest'])).some(row => row.id === pending.id));
                assert.ok(!(await rpc(db, 'list_profile_candidates', ['cran'])).some(row => row.id === pending.id));
                await assert.rejects(rpc(db, 'approve_profile_candidate', ['guest', pending.id, deadline, privateTask.id]), /deste perfil/);
            });

            await t.test('weekly batches are personal, images shared, deletion and selection do not reseed', async () => {
                const defs = JSON.stringify([{ key: 'hollow-zero', description: 'Hollow Zero' }, { key: 'notorious-hunt', description: 'Notorious Hunt' }]);
                const args = [zzz.abbreviation, zzz.id, defs, true, '2099-10-05T12:00:00Z'];
                if (migrated) assert.equal((await rpc(db, 'create_profile_weekly_batch', ['cran', zzz.abbreviation, zzz.id, defs, false])).status, 'skipped', 'Upgraded CRAN requires explicit action for skipped batches');
                assert.equal((await rpc(db, 'create_profile_weekly_batch', ['cran', ...args])).created, 2);
                assert.equal((await rpc(db, 'create_profile_weekly_batch', ['demo', ...args])).created, 2);
                const owner = (await listTasks(db, 'cran')).find(t => t.description === 'Hollow Zero');
                await rpc(db, 'save_profile_task', ['cran', JSON.stringify({ ...owner, description: 'My weekly name', cover_url: 'https://example.com/weekly.png' }), owner.id]);
                const demo = (await listTasks(db, 'demo')).find(t => t.id === owner.id);
                assert.equal(demo.description, 'Hollow Zero');
                assert.equal(demo.cover_url, 'https://example.com/weekly.png');
                await rpc(db, 'complete_profile_task', ['cran', owner.id, true]);
                assert.equal((await listTasks(db, 'demo')).find(t => t.id === owner.id).is_done, false);
                await rpc(db, 'remove_profile_task', ['cran', owner.id]);
                await selectGames(db, 'cran', [gi.id]);
                assert.ok(!(await listTasks(db, 'cran')).some(t => t.game_id === zzz.id));
                await selectGames(db, 'cran', [gi.id, zzz.id]);
                assert.equal((await rpc(db, 'create_profile_weekly_batch', ['cran', ...args])).created, 0);
                assert.ok(!(await listTasks(db, 'cran')).some(t => t.id === owner.id));
                assert.ok((await listTasks(db, 'demo')).some(t => t.id === owner.id));
            });

            await t.test('legacy HSR cleanup preserves hidden manual deadlines and recurring profile states', async () => {
                const hsr = (await db.query("select * from games where abbreviation = 'HSR'")).rows[0];
                await selectGames(db, 'cran', [hsr.id]);
                await selectGames(db, 'demo', [hsr.id]);
                await selectGames(db, 'guest', [hsr.id]);
                const imported = await candidate(db, hsr, { source: 'starrailassistant-hsr', external_id: 'cleanup-protected' });
                await rpc(db, 'import_event_candidates', [imported.source]);
                const task = (await listTasks(db, 'demo')).find(row => row.description === imported.name);
                const manual = await rpc(db, 'save_profile_task', ['cran', JSON.stringify(payload(hsr, {
                    description: 'Unlinked expired HSR task', refresh_type: 0, repeat_days: null,
                    expiration_date: '2025-01-01T09:00:00Z',
                }))]);
                await rpc(db, 'save_profile_task', ['demo', JSON.stringify({ ...task,
                    expiration_date: '2099-02-01T09:00:00Z', is_done: true,
                }), task.id]);
                await selectGames(db, 'demo', []);
                await db.query('update tasks set expiration_date = $1 where id = $2', ['2025-01-01T09:00:00Z', task.id]);
                assert.equal(await rpc(db, 'cleanup_expired_hsr_events', []), 0);
                const state = (await db.query("select * from profile_tasks where profile_id='demo' and task_id=$1", [task.id])).rows[0];
                assert.ok(state, 'Deleting the shared task must not cascade into a protected profile');
                assert.equal(state.expiration_date.toISOString(), '2099-02-01T09:00:00.000Z');
                assert.equal(state.event_deadline_manual, true);
                assert.equal(state.is_done, true);
                assert.equal((await db.query('select task_id from event_candidates where id=$1', [imported.id])).rows[0].task_id, task.id);

                await selectGames(db, 'demo', [hsr.id]);
                await rpc(db, 'save_profile_task', ['demo', JSON.stringify({ ...task,
                    expiration_date: '2025-01-01T09:00:00Z', refresh_type: 8, repeat_days: 30,
                }), task.id]);
                assert.equal(await rpc(db, 'cleanup_expired_hsr_events', []), 0, 'An overdue recurring state must survive cleanup');
                assert.equal((await listTasks(db, 'demo')).find(row => row.id === task.id).repeat_days, 30);
                await rpc(db, 'save_profile_task', ['demo', JSON.stringify({ ...task,
                    expiration_date: null, refresh_type: 0, repeat_days: null,
                }), task.id]);
                assert.equal(await rpc(db, 'cleanup_expired_hsr_events', []), 0, 'An unknown personal deadline cannot be treated as expired');
                await rpc(db, 'save_profile_task', ['demo', JSON.stringify({ ...task,
                    expiration_date: '2025-01-01T09:00:00Z', refresh_type: 0, repeat_days: null,
                }), task.id]);
                const alias = await rpc(db, 'save_profile_task', ['demo', JSON.stringify(payload(hsr, {
                    description: 'Linked personal HSR event', refresh_type: 0, repeat_days: null,
                }))]);
                await rpc(db, 'approve_profile_candidate', ['demo', imported.id, deadline, alias.id]);
                await selectGames(db, 'demo', []);
                assert.equal(await rpc(db, 'cleanup_expired_hsr_events', []), 0, 'A linked personal task also protects the shared definition');
                assert.ok((await db.query('select task_id from profile_event_decisions where profile_id=$1 and candidate_id=$2', ['demo', imported.id])).rows[0].task_id === alias.id);
                await selectGames(db, 'demo', [hsr.id]);
                await rpc(db, 'save_profile_task', ['demo', JSON.stringify({ ...alias,
                    expiration_date: '2025-01-01T09:00:00Z', refresh_type: 0, repeat_days: null,
                }), alias.id]);
                assert.equal(await rpc(db, 'cleanup_expired_hsr_events', []), 1, 'An import can be removed once no protected state remains');
                assert.equal((await db.query('select count(*)::int as n from profile_tasks where task_id=$1', [task.id])).rows[0].n, 0);
                assert.equal((await db.query('select task_id from event_candidates where id=$1', [imported.id])).rows[0].task_id, null);
                assert.ok((await listTasks(db, 'cran')).some(row => row.id === manual.id), 'Unlinked tasks are outside import cleanup');
            });

            await t.test('reset clears profile state and preserves fixed identities', async () => {
                await rpc(db, 'reset_application_data', []);
                for (const table of ['games', 'tasks', 'event_candidates', 'profile_games', 'profile_tasks', 'profile_event_decisions', 'profile_weekly_batches']) {
                    assert.equal((await db.query(`select count(*)::integer n from ${table}`)).rows[0].n, 0);
                }
                assert.equal((await db.query('select count(*)::integer n from profiles')).rows[0].n, 3);
                const catalogue = JSON.stringify([{ description: 'Seeded game', abbreviation: 'TEST', cap_stamina: 100, stamina_per_minute: 6 }]);
                await rpc(db, 'initialize_game_catalogue', [catalogue]);
                await rpc(db, 'initialize_game_catalogue', [catalogue]);
                assert.equal((await db.query('select count(*)::integer n from games')).rows[0].n, 1);
                assert.deepEqual(await rpc(db, 'list_profile_games', ['cran']), [], 'Seeding the shared catalogue does not select games for anyone');
            });
        } finally { await db.close(); }
    });
}
