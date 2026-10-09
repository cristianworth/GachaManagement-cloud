import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createTestDatabase, migrations, readProjectFile } from './helpers/testDatabase.mjs';
const clock = '2026-10-09T08:00:00Z';
const rpc = async (db, name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i+1}`).join(',')}) result`, args)).rows[0].result;
const identity = (abbreviation, definition_key, calendar_key = '') => ({ abbreviation, definition_key, calendar_key });
const choose = (db, items, profile = 'cran', now = clock) => rpc(db, 'choose_profile_task_batch', [profile, items === null ? null : JSON.stringify(items), now]);
const offers = (db, profile = 'cran', now = clock) => rpc(db, 'list_profile_task_batch', [profile, now]);
const tasks = (db, profile = 'cran') => rpc(db, 'list_profile_tasks', [profile]);
async function snapshot(db) {
    const result = {};
    for (const table of ['tasks', 'profile_tasks', 'profile_weekly_batches', 'profile_endgame_batches', 'profile_task_batch_items', 'profile_task_batch_decisions'])
        result[table] = (await db.query(`select to_jsonb(t) data from ${table} t order by to_jsonb(t)::text`)).rows;
    return result;
}
for (const migrated of [false, true]) test(`Personal batch selection as anon: ${migrated ? 'upgrade' : 'fresh'}`, async t => {
    const db = await createTestDatabase({ migrated }); t.after(() => db.close()); await db.exec('set role anon');
    const games = (await db.query('select id,abbreviation from games')).rows;
    const id = abbr => games.find(g => g.abbreviation === abbr).id;
    await rpc(db, 'set_profile_games', ['cran', games.map(g=>g.id), false]);
    await rpc(db, 'set_profile_games', ['demo', games.map(g=>g.id), false]);
    const scenario = (name, run) => t.test(name, async () => {
        await db.exec('begin'); try { await run(); } finally { await db.exec('rollback'); }
    });
    await scenario('Reading is side effect free and inventories exactly enabled games and no HSR reserves', async () => {
        const before = await snapshot(db); const list = await offers(db);
        assert.equal(list.length, 16); assert.ok(list.every(i=>i.state==='never'));
        assert.equal(list.filter(i=>i.cover_url).length,16); assert.deepEqual(await snapshot(db),before);
        await rpc(db,'set_profile_games',['cran',[id('GI')],false]);
        assert.deepEqual((await offers(db)).map(i=>i.definition_key),['imaginarium-theater','spiral-abyss','weekly-boss']);
    });
    await scenario('One weekly and one endgame never close their groups; unchecked items remain loadable', async () => {
        const result = await choose(db,[identity('HSR','echo-of-war'),identity('GI','spiral-abyss')]);
        assert.equal(result.created,2);
        let list = await offers(db);
        assert.equal(list.find(i=>i.definition_key==='echo-of-war').state,'created');
        assert.equal(list.find(i=>i.definition_key==='simulated-universe').state,'deferred');
        assert.equal(list.find(i=>i.definition_key==='imaginarium-theater').state,'deferred');
        assert.equal((await db.query("select count(*)::int n from profile_weekly_batches where profile_id='cran' and status='created'")).rows[0].n,0);
        assert.equal((await db.query("select count(*)::int n from profile_endgame_batches where profile_id='cran'")).rows[0].n,0);
        // Opening the app cannot bypass a partial personal decision through automatic weeklies.
        const definitions=[{key:'echo-of-war',description:'Echo of War'},{key:'simulated-universe',description:'Simulated Universe'}];
        assert.equal((await rpc(db,'create_profile_weekly_batch',['cran','HSR',id('HSR'),JSON.stringify(definitions),false,clock])).created,0);
        assert.equal((await choose(db,[identity('GI','imaginarium-theater')])).created,1);
        assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,13);
        assert.equal((await rpc(db,'create_profile_extra_challenges',['cran',clock])).deferred,0);
        const before=await snapshot(db); assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,0);
        assert.deepEqual(await snapshot(db),before);
        assert.ok((await offers(db,'demo')).every(i=>i.state==='never'));
    });
    await scenario('Empty explicit selection defers without creating, deleting or closing the batch', async () => {
        const before=await tasks(db); assert.equal((await choose(db,[])).created,0);
        assert.deepEqual(await tasks(db),before); assert.ok((await offers(db)).every(i=>i.state==='deferred'));
        assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,16);
    });
    await scenario('Deletion, rename, homonyms and personal fields survive partial and full retries', async () => {
        const original=await rpc(db,'save_profile_task',['cran',JSON.stringify({description:'Spiral Abyss',game_id:id('GI'),
            refresh_type:8,repeat_days:19,is_done:true,cover_url:'https://example.com/personal.png',expiration_date:'2099-02-02T12:30:00Z'})]);
        await rpc(db,'set_profile_task_favorite',['cran',original.id,true]);
        const before=(await tasks(db)).find(x=>x.id===original.id);
        assert.equal((await choose(db,[identity('GI','spiral-abyss')])).preserved,1);
        assert.deepEqual((await tasks(db)).find(x=>x.id===original.id),before);
        await rpc(db,'remove_profile_task',['cran',original.id]);
        assert.equal((await offers(db)).find(i=>i.definition_key==='spiral-abyss').state,'excluded');
        await choose(db,[identity('HSR','echo-of-war')]);
        const echo=(await tasks(db)).find(x=>x.description==='Echo of War');
        await rpc(db,'save_profile_task',['cran',JSON.stringify({...echo,description:'Personal Echo',is_done:true,refresh_type:8,repeat_days:19}),echo.id]);
        await rpc(db,'create_profile_task_batch',['cran',null,clock]);
        assert.ok(!(await tasks(db)).some(x=>x.description==='Spiral Abyss'));
        assert.equal((await tasks(db)).find(x=>x.id===echo.id).description,'Personal Echo');
    });
    await scenario('Old markers protect absent definitions conservatively while new items remain selectable', async () => {
        await db.query("insert into profile_weekly_batches values ('cran','HSR','created') on conflict (profile_id,abbreviation) do update set status='created'");
        await db.exec("insert into profile_endgame_batches values ('cran','GI'); insert into profile_task_batch_items values ('cran','ZZZ','deadly-assault','','2026-10-08T12:00Z')");
        const before=await snapshot(db);const list=await offers(db);
        assert.equal(list.filter(i=>i.state==='legacy').length,5);assert.deepEqual(await snapshot(db),before);
        assert.equal((await choose(db,[identity('HSR','echo-of-war'),identity('GI','spiral-abyss'),identity('ZZZ','deadly-assault'),identity('ZZZ','shiyu-defense')])).created,1);
        assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,10);
        assert.ok(!(await tasks(db)).some(x=>['Echo of War','Spiral Abyss','Deadly Assault'].includes(x.description)));
    });
    for(const [name,items] of [['null',null],['unknown',[identity('HSR','pure-fiction')]],['duplicate',[identity('GI','spiral-abyss'),identity('GI','spiral-abyss')]],
        ['phase',[identity('WuWa','endstate-matrix','3.8')]],['invalid shape',[{abbreviation:'GI',definition_key:'spiral-abyss'}]],['non-array',{}]])
        await scenario(`Invalid ${name} selection rejects before any decision`,async()=>{
            const before=await snapshot(db);await db.exec('savepoint rejected');
            await assert.rejects(choose(db,items),/Seleção/);await db.exec('rollback to savepoint rejected');assert.deepEqual(await snapshot(db),before);
        });
    await scenario('Disabled games, invalid actors, invalid clocks and duplicate enabled abbreviations reject',async()=>{
        await rpc(db,'set_profile_games',['cran',[id('GI')],false]);
        await db.exec('savepoint rejected');await assert.rejects(choose(db,[identity('HSR','echo-of-war')]),/desabilitada/);await db.exec('rollback to savepoint rejected');
        await assert.rejects(choose(db,[],'missing'),/Perfil inválido/);await db.exec('rollback to savepoint rejected');
        await assert.rejects(choose(db,[],'cran',null),/Relógio inválido/);await db.exec('rollback to savepoint rejected');
        const duplicate=(await db.query("insert into games(description,abbreviation) values ('Duplicate','GI') returning id")).rows[0].id;
        await db.query("insert into profile_games(profile_id,game_id) values ('cran',$1)",[duplicate]);
        await db.exec('savepoint ambiguous');await assert.rejects(choose(db,[]),/ambígua/);await db.exec('rollback to savepoint ambiguous');
    });
    await scenario('Expired Endstate is unavailable without a next phase or recurrence',async()=>{
        const now='2026-11-10T20:00:00Z';assert.equal((await offers(db,'cran',now)).find(x=>x.definition_key==='endstate-matrix').state,'unavailable');
        assert.equal((await choose(db,[identity('WuWa','endstate-matrix','3.7')],'cran',now)).deferred,1);
        assert.ok(!(await tasks(db)).some(x=>x.description==='Endstate Matrix'));
        assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,now])).created,15);
    });
    await scenario('A late error rolls back tasks AND unchecked deferrals; retry succeeds',async()=>{
        await db.exec(`reset role; create function reject_selected() returns trigger language plpgsql as $$ begin
            if new.description='Shiyu Defense' then raise exception 'Injected selected failure'; end if; return new; end $$;
            create trigger reject_selected before insert on tasks for each row execute function reject_selected(); set local role anon; savepoint rejected;`);
        const before=await snapshot(db);
        await assert.rejects(choose(db,[identity('GI','spiral-abyss'),identity('ZZZ','shiyu-defense')]),/Injected selected failure/);
        await db.exec('rollback to savepoint rejected');assert.deepEqual(await snapshot(db),before);
        await db.exec('reset role; drop trigger reject_selected on tasks; set local role anon');
        assert.equal((await choose(db,[identity('GI','spiral-abyss'),identity('ZZZ','shiyu-defense')])).created,2);
    });
    await scenario('Default covers reach sixteen new definitions; custom and explicitly removed covers survive reuse by another profile',async()=>{
        const covers=await rpc(db,'task_batch_cover_catalogue');assert.equal(covers.length,16);
        assert.deepEqual(covers, JSON.parse(await readProjectFile('docs/task-batch-covers.json')));
        await rpc(db,'create_profile_task_batch',['cran',null,clock]);
        const rows=await tasks(db);assert.equal(rows.filter(x=>x.cover_url).length,16);
        const theater=rows.find(x=>x.description==='Imaginarium Theater');const abyss=rows.find(x=>x.description==='Spiral Abyss');
        await rpc(db,'save_profile_task',['cran',JSON.stringify({...theater,cover_url:'https://example.com/custom.png'}),theater.id]);
        await rpc(db,'save_profile_task',['cran',JSON.stringify({...abyss,cover_url:null}),abyss.id]);
        await rpc(db,'create_profile_task_batch',['demo',null,clock]);
        assert.equal((await tasks(db,'demo')).find(x=>x.id===theater.id).cover_url,'https://example.com/custom.png');
        assert.equal((await tasks(db,'demo')).find(x=>x.id===abyss.id).cover_url,null);
        await rpc(db,'reset_application_data');assert.equal((await db.query('select count(*)::int n from profile_task_batch_decisions')).rows[0].n,0);
    });
});

test('Selection and cover upgrades preserve 1.10.0 history, custom/null covers and all personal state without backfill',async t=>{
    const db=new PGlite();t.after(()=>db.close());
    await db.exec(`create role anon; create role authenticated; create role service_role;grant usage on schema public to anon;
        alter default privileges in schema public grant select,insert,update,delete on tables to anon;
        alter default privileges in schema public grant usage,select on sequences to anon;`);
    await db.exec(await readProjectFile('tests/fixtures/pre-events-schema.sql'));await db.exec(await readProjectFile('db/seed.sql'));
    for(const file of migrations.slice(0,migrations.indexOf('2026-10-09-task-batch-selection.sql'))) await db.exec(await readProjectFile('db/migrations/'+file));
    await db.exec('set role anon');const ids=(await db.query('select id from games')).rows.map(x=>x.id);
    await rpc(db,'set_profile_games',['cran',ids,false]);await rpc(db,'create_profile_task_batch',['cran',null,clock]);
    const rows=await tasks(db);await rpc(db,'remove_profile_task',['cran',rows.find(x=>x.description==='Echo of War').id]);
    await rpc(db,'save_profile_task',['cran',JSON.stringify({...rows.find(x=>x.description==='Tower of Adversity'),description:'Personal Tower',is_done:true,cover_url:'https://example.com/custom.png'}),rows.find(x=>x.description==='Tower of Adversity').id]);
    const before=await tasks(db);
    await db.exec('reset role');
    for(const file of migrations.slice(migrations.indexOf('2026-10-09-task-batch-selection.sql')))await db.exec(await readProjectFile('db/migrations/'+file));
    await db.exec('set role anon');assert.deepEqual(await tasks(db),before);
    assert.ok((await offers(db)).filter(i=>i.definition_key!=='weekly-boss'||!['GI','NTE'].includes(i.abbreviation)).every(i=>['legacy','excluded'].includes(i.state)));
    assert.equal((await choose(db,[identity('HSR','echo-of-war'),identity('WuWa','tower-of-adversity')])).created,0);
    assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,2);const after=await tasks(db);assert.deepEqual(after.filter(x=>before.some(b=>b.id===x.id)),before);assert.equal(after.length,before.length+2);
});


test('Fresh schema embeds selection and cover migrations in upgrade order', async () => {
    const schema = (await readProjectFile('db/schema.sql')).replace(/\r\n/g, '\n');
    let previous = -1;
    for (const file of ['2026-10-09-task-batch-selection.sql', '2026-10-09-task-batch-covers.sql', '2026-10-09-task-batch-maintenance.sql', '2026-10-09-task-batch-completion.sql']) {
        const sql = (await readProjectFile('db/migrations/' + file)).replace(/\r\n/g, '\n');
        const position = schema.indexOf(sql);
        assert.ok(position > previous);
        assert.ok(migrations.includes(file));
        previous = position;
    }
});
