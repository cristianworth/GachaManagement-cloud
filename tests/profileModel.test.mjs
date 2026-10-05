import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/testDatabase.mjs';

for (const migrated of [false, true]) test(`profile model as anon (${migrated ? 'upgrade' : 'fresh'})`, async t => {
    const db = await createTestDatabase({ migrated });
    t.after(() => db.close());
    await db.exec('set role anon');
    assert.deepEqual((await db.query('select id,name from profiles order by sort_order')).rows,
        [{ id: 'cran', name: 'CRAN' }, { id: 'demo', name: 'Demo' }, { id: 'guest', name: 'Convidado' }]);
    await assert.rejects(db.query("update profiles set name='Other' where id='cran'"), /permission denied/);
    await assert.rejects(db.query("delete from profiles where id='guest'"), /permission denied/);
    const tables = ['profiles', 'profile_games', 'profile_tasks', 'profile_event_decisions', 'profile_weekly_batches'];
    const rls = (await db.query('select relname,relrowsecurity from pg_class where relname = any($1::text[])', [tables])).rows;
    assert.equal(rls.length, 5);
    assert.ok(rls.every(table => table.relrowsecurity));
    assert.equal((await db.query("select count(*)::integer n from profile_games where profile_id in ('demo','guest')")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::integer n from profile_tasks where profile_id in ('demo','guest')")).rows[0].n, 0);
    if (migrated) {
        const mapped = (await db.query("select pt.is_done,pt.refresh_type,pt.repeat_days from profile_tasks pt join tasks t on t.id=pt.task_id where pt.profile_id='cran' and t.description='Existing weekly'")).rows;
        assert.deepEqual(mapped, [{ is_done: true, refresh_type: 2, repeat_days: 7 }]);
        const games = (await db.query('select count(*)::integer n from games')).rows[0].n;
        assert.equal((await db.query("select count(*)::integer n from profile_games where profile_id='cran'")).rows[0].n, games);
        assert.ok((await db.query("select status from profile_weekly_batches where profile_id='cran'")).rows.every(row => row.status === 'skipped'));
    }
    const game = (await db.query('select id from games order by id limit 1')).rows[0];
    await db.query(`insert into profile_games (profile_id,game_id,overrides) values ('demo',$1,'{"current_stamina":20}')`, [game.id]);
    await db.query(`insert into profile_games (profile_id,game_id,overrides) values ('guest',$1,'{"current_stamina":80}')`, [game.id]);
    assert.deepEqual((await db.query("select profile_id,(overrides->>'current_stamina')::integer stamina from profile_games where profile_id in ('demo','guest') order by profile_id")).rows,
        [{ profile_id: 'demo', stamina: 20 }, { profile_id: 'guest', stamina: 80 }]);
    const shared = (await db.query("insert into tasks (description,game_id,refresh_type,owner_profile_id,cover_url) values ('Shared',$1,0,null,'https://example.com/shared.png') returning id", [game.id])).rows[0];
    await db.query("insert into profile_tasks (profile_id,task_id,is_done,expiration_date,refresh_type) values ('demo',$1,true,'2099-01-10T09:00:00Z',0),('guest',$1,false,'2099-01-20T09:00:00Z',0)", [shared.id]);
    assert.deepEqual((await db.query('select profile_id,is_done from profile_tasks where task_id=$1 order by profile_id', [shared.id])).rows,
        [{ profile_id: 'demo', is_done: true }, { profile_id: 'guest', is_done: false }]);
    assert.equal((await db.query('select count(distinct t.cover_url)::integer n from tasks t join profile_tasks pt on pt.task_id=t.id where t.id=$1', [shared.id])).rows[0].n, 1);
    await assert.rejects(db.query("insert into profile_tasks (profile_id,task_id,refresh_type,repeat_days) values ('cran',$1,8,null)", [shared.id]), /check constraint/);
    await assert.rejects(db.query("insert into profile_games (profile_id,game_id) values ('missing',$1)", [game.id]), /foreign key/);
    await db.query('delete from tasks where id=$1', [shared.id]);
    assert.equal((await db.query('select count(*)::integer n from profile_tasks where task_id=$1', [shared.id])).rows[0].n, 0);
    await db.query('select reset_application_data()');
    for (const table of [...tables.slice(1), 'games', 'tasks', 'event_candidates']) {
        assert.equal((await db.query(`select count(*)::integer n from ${table}`)).rows[0].n, 0);
    }
    assert.equal((await db.query('select count(*)::integer n from profiles')).rows[0].n, 3);
});
