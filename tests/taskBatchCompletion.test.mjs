import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createTestDatabase,readProjectFile} from './helpers/testDatabase.mjs';
import {WEEKLY_BATCHES} from '../js/data/weeklyTasks.js';
const clock='2026-10-09T08:00:00Z';
const rpc=async(db,name,args=[]) => (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
const list=(db,profile='cran')=>rpc(db,'list_profile_tasks',[profile]);
const offers=(db)=>rpc(db,'list_profile_task_batch',['cran',clock]);
for(const migrated of [false,true]) test('Complete batch catalogue: '+(migrated?'upgrade':'fresh'),async t=>{
 const db=await createTestDatabase({migrated});t.after(()=>db.close());await db.exec('set role anon');
 const games=(await db.query('select id,abbreviation from games')).rows;const id=a=>games.find(g=>g.abbreviation===a).id;
 await rpc(db,'set_profile_games',['cran',games.map(g=>g.id),false]);
 const run=(name,fn)=>t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}});
 await run('Sixteen distinct offers have sixteen sourced defaults; shared titles stay scoped by game',async()=>{
  const items=await offers(db);const covers=await rpc(db,'task_batch_cover_catalogue');
  assert.equal(items.length,16);assert.equal(covers.length,16);
  assert.deepEqual(covers,JSON.parse(await readProjectFile('docs/task-batch-covers.json')));
  assert.equal(new Set(covers.map(x=>x.abbreviation+':'+x.definition_key)).size,16);
  assert.ok(covers.every(x=>x.cover_url.startsWith('https://')&&x.source_url.startsWith('https://')&&x.checked_on==='2026-10-09'));
  await rpc(db,'create_profile_task_batch',['cran',null,clock]);const tasks=await list(db);
  assert.equal(tasks.filter(x=>/^(weekly|endgame):/.test(x.shared_key)).length,16);
  assert.equal(tasks.filter(x=>x.cover_url).length,16);
  assert.deepEqual(tasks.filter(x=>x.description==='Weekly Boss').map(x=>x.game_id).sort(),[id('GI'),id('NTE'),id('WuWa')].sort());
 });
 await run('GI and NTE weeklies use the next strictly future Monday 09:00 UTC through the public weekly wrapper',async()=>{
  for(const [n,expected] of [['2026-10-12T08:59:59.999Z','2026-10-12T09:00:00.000Z'],['2026-10-12T09:00:00Z','2026-10-19T09:00:00.000Z'],['2026-11-01T12:00:00Z','2026-11-02T09:00:00.000Z']]){
   for(const abbreviation of ['GI','NTE']){
    await db.exec('savepoint cycle');await db.exec("set local timezone='Pacific/Auckland'");
    const definitions=WEEKLY_BATCHES.find(x=>x.abbreviation===abbreviation).definitions;
    assert.equal((await rpc(db,'create_profile_weekly_batch',['cran',abbreviation,id(abbreviation),JSON.stringify(definitions),true,n])).created,1);
    const row=(await list(db)).find(x=>x.description==='Weekly Boss'&&x.game_id===id(abbreviation));
    assert.equal(new Date(row.expiration_date).toISOString(),expected);assert.equal(row.refresh_type,2);assert.equal(row.repeat_days,7);
    await db.exec('rollback to savepoint cycle');
   }
  }
 });
 await run('Endgame-only RPC still creates three activities; endgame markers cannot suppress new weekly offers',async()=>{
  assert.equal((await rpc(db,'create_profile_endgame_batch',['cran',null,clock])).created,3);
  const items=await offers(db);for(const a of ['GI','NTE'])assert.equal(items.find(x=>x.abbreviation===a&&x.definition_key==='weekly-boss').state,'never');
  assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,13);
 });
 await run('Selecting only new GI/NTE bosses defers their endgames and never deletes an unchecked task',async()=>{
  const chosen=['GI','NTE'].map(abbreviation=>({abbreviation,definition_key:'weekly-boss',calendar_key:''}));
  assert.equal((await rpc(db,'choose_profile_task_batch',['cran',JSON.stringify(chosen),clock])).created,2);
  const items=await offers(db);assert.equal(items.filter(x=>x.state==='deferred').length,14);
  assert.equal((await db.query("select count(*)::int n from profile_endgame_batches where profile_id='cran'")).rows[0].n,0);
  assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,14);
 });
});

test('Catalogue completion upgrade preserves fourteen-item history and covers while adding only two explicit offers',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec('create role anon;create role authenticated;create role service_role;grant usage on schema public to anon;alter default privileges in schema public grant select,insert,update,delete on tables to anon;alter default privileges in schema public grant usage,select on sequences to anon;');
 const migration=await readProjectFile('db/migrations/2026-10-09-task-batch-completion.sql');const schema=await readProjectFile('db/schema.sql');
 await db.exec(schema.slice(0,schema.indexOf(migration)));await db.exec(await readProjectFile('db/seed.sql'));await db.exec('set role anon');
 const games=(await db.query('select id,abbreviation from games')).rows;
 await rpc(db,'set_profile_games',['cran',games.map(g=>g.id),false]);assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,14);
 const theatre=(await list(db)).find(x=>x.description==='Imaginarium Theater');
 await rpc(db,'save_profile_task',['cran',JSON.stringify({...theatre,description:'Custom theatre',is_done:true,cover_url:'https://example.com/custom.png'}),theatre.id]);
 const su=(await list(db)).find(x=>x.description==='Simulated Universe');await rpc(db,'remove_profile_task',['cran',su.id]);
 const before=await list(db);await db.exec('reset role');await db.exec(migration);await db.exec('set role anon');assert.deepEqual(await list(db),before);
 for(const abbreviation of ['GI','NTE']){
  const game=games.find(g=>g.abbreviation===abbreviation);const definitions=WEEKLY_BATCHES.find(x=>x.abbreviation===abbreviation).definitions;
  assert.equal((await rpc(db,'create_profile_weekly_batch',['cran',abbreviation,game.id,JSON.stringify(definitions),false,clock])).created,0);
 }
 const offered=await offers(db);assert.deepEqual(offered.filter(x=>x.state==='never').map(x=>[x.abbreviation,x.definition_key]),[['GI','weekly-boss'],['NTE','weekly-boss']]);
 assert.equal((await rpc(db,'create_profile_task_batch',['cran',null,clock])).created,2);
 const after=await list(db);assert.deepEqual(after.filter(x=>before.some(y=>y.id===x.id)),before);assert.equal(after.length,before.length+2);
 assert.ok(!after.some(x=>x.id===su.id));
});
