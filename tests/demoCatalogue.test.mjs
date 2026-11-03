import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { EVENT_GAMES } from '../js/events/eventGames.js';
import { installDemo, createDemoClient } from '../demo/database.js';
import { applyDemoCatalogue, prepareDemoEvents } from '../demo/events.js';
import { describeDemoCatalogue } from '../demo/catalogue.js';
import { captureDemoCatalogue } from '../scripts/captureDemoCatalogue.js';
import { demoCatalogue, DEMO_CLOCK, demoImage, demoImagePath } from './helpers/demoCatalogue.mjs';

const now = DEMO_CLOCK;
const rpc = async (db,name,params={}) => {
    const result = await createDemoClient(db).rpc(name,{p_profile_id:'cran',...params});
    if (result.error) throw result.error;
    return result.data;
};
// These assertions inspect persisted SQL state, including rows hidden by the demo presentation policy.
const tasks = async (db,profile='cran') => (await db.query('select public.list_profile_tasks($1) as tasks',[profile])).rows[0].tasks;
const apiTask = async (db,profile='cran',source='starrailassistant-hsr') => (await tasks(db,profile))
    .find(task=>task.event_candidates?.some(candidate=>candidate.source===source));
async function database(t) {
    const db = new PGlite();
    t.after(()=>db.close());
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await installDemo(db,await readFile('db/schema.sql','utf8'),await readFile('db/seed.sql','utf8'),{now});
    await prepareDemoEvents(db);
    return db;
}

test('API snapshots reuse editions and preserve per-profile edits, favorites, completion and manual data',async t=>{
    const db = await database(t);
    const first = demoCatalogue();
    assert.deepEqual((await applyDemoCatalogue(db,first,{now})).failures,[]);
    const original = await apiTask(db);
    assert.equal(original.cover_url,demoImagePath);
    assert.equal(original.is_favorite,true,'The initial demo has real API favorites');
    const manual = (await tasks(db)).find(task=>!task.event_candidates.length && task.refresh_type===0);
    assert.equal(manual.expiration_date,null,'Avulse examples cannot age into negative deadlines');
    assert.ok((await tasks(db)).every(task=>typeof task.description==='string' && task.description));
    await rpc(db,'set_profile_task_favorite',{p_task_id:original.id,p_is_favorite:false});
    await rpc(db,'save_profile_task',{p_task_id:original.id,p_task:{...original,
        description:'My edited event',expiration_date:'2099-01-19T12:00:00Z',is_done:true}});
    const games = await rpc(db,'list_profile_games');
    const hsr = games.find(game=>game.abbreviation==='HSR');
    await rpc(db,'save_profile_game',{p_game_id:hsr.id,p_game:{abbreviation:'HSR',pending_tasks:'My draft saved as notes',current_stamina:77}});
    const second = demoCatalogue({now:now+86400000,revision:'b'.repeat(64)});
    second.games.find(game=>game.key==='hsr').events[0].proposed_end_at='2099-01-12T08:59:59Z';
    second.games.find(game=>game.key==='hsr').events[0].source_end_at='2099-01-12T08:59:59Z';
    assert.deepEqual((await applyDemoCatalogue(db,second,{now:now+86400000})).failures,[]);
    const edited = await apiTask(db);
    assert.equal(edited.id,original.id);
    assert.equal(edited.description,'My edited event');
    assert.equal(new Date(edited.expiration_date).toISOString(),'2099-01-19T12:00:00.000Z');
    assert.equal(edited.is_done,true);
    assert.equal(edited.is_favorite,false);
    assert.equal(new Date((await apiTask(db,'demo')).expiration_date).toISOString(),'2099-01-12T08:59:59.000Z');
    assert.equal((await apiTask(db,'demo')).is_done,false);
    const savedGame = (await rpc(db,'list_profile_games')).find(game=>game.id===hsr.id);
    assert.equal(savedGame.pending_tasks,'My draft saved as notes');
    assert.equal(savedGame.current_stamina,77);
    await applyDemoCatalogue(db,second,{now:now+86400000});
    assert.equal((await tasks(db)).filter(task=>task.event_candidates.some(candidate=>candidate.source==='starrailassistant-hsr')).length,1);
    const third = structuredClone(second);
    third.revision='c'.repeat(64); third.generatedAt='2099-01-03T12:00:00Z';
    third.games.forEach(game=>{game.capturedAt=third.generatedAt;});
    const hsrEntry = third.games.find(game=>game.key==='hsr');
    hsrEntry.events.push({...hsrEntry.events[0],external_id:'new-edition::2099-01-20T09:00:00Z',
        source_start_at:'2099-01-20T09:00:00Z',proposed_start_at:'2099-01-20T09:00:00Z',
        source_end_at:'2099-01-30T08:59:59Z',proposed_end_at:'2099-01-30T08:59:59Z'});
    await applyDemoCatalogue(db,third,{now:now+2*86400000});
    const next = (await tasks(db)).find(task=>task.event_candidates.length && task.id!==original.id && task.game_id===hsr.id);
    assert.ok(next);
    assert.equal(next.is_done,false);
    assert.equal(next.is_favorite,false,'A new edition cannot inherit the old favorite');
    await applyDemoCatalogue(db,first,{now:now+2*86400000});
    assert.equal(new Date((await apiTask(db,'demo')).expiration_date).toISOString(),'2099-01-12T08:59:59.000Z','Late snapshots cannot revert newer deadlines');
});

test('expired API events close per profile while manual extensions, ignored editions and new editions keep their contracts',async t=>{
    const db = await database(t);
    const first=demoCatalogue();
    await applyDemoCatalogue(db,first,{now});
    const task = await apiTask(db);
    await rpc(db,'save_profile_task',{p_task_id:task.id,p_task:{...task,expiration_date:'2099-01-20T12:00:00Z'}});
    const manual = await rpc(db,'save_profile_task',{p_task:{description:'Visitor chose an old deadline',game_id:task.game_id,
        refresh_type:0,expiration_date:'2098-12-30T12:00:00Z'}});
    const later=Date.parse('2099-01-11T12:00:00Z');
    await applyDemoCatalogue(db,first,{now:later});
    assert.ok(await apiTask(db),'The explicit manual extension survives');
    assert.equal(await apiTask(db,'demo'),undefined);
    assert.ok((await tasks(db)).some(row=>row.id===manual.id),'Unlinked visitor tasks are never auto-deleted');
    const correction=demoCatalogue({now:later,revision:'d'.repeat(64)});
    for (const entry of correction.games) {
        entry.events[0].source_end_at='2099-01-15T08:59:59Z';
        entry.events[0].proposed_end_at='2099-01-15T08:59:59Z';
    }
    await applyDemoCatalogue(db,correction,{now:later});
    assert.equal(await apiTask(db,'demo'),undefined,'An expiry correction must not resurrect a closed personal edition');
    await rpc(db,'ignore_profile_task',{p_task_id:task.id});
    correction.revision='e'.repeat(64); correction.generatedAt='2099-01-12T12:00:00Z';
    correction.games.forEach(entry=>{entry.capturedAt=correction.generatedAt;});
    await applyDemoCatalogue(db,correction,{now:later});
    assert.equal(await apiTask(db),undefined,'A visitor exclusion survives synchronization');
    const next=structuredClone(correction); next.revision='f'.repeat(64); next.generatedAt='2099-01-21T12:00:00Z';
    next.games.forEach(entry=>{
        entry.capturedAt=next.generatedAt;
        entry.events=[{...entry.events[0],external_id:`next-${entry.key}::2099-01-21T09:00:00Z`,
            source_start_at:'2099-01-21T09:00:00Z',proposed_start_at:'2099-01-21T09:00:00Z',
            source_end_at:'2099-02-01T08:59:59Z',proposed_end_at:'2099-02-01T08:59:59Z'}];
    });
    await applyDemoCatalogue(db,next,{now:Date.parse(next.generatedAt)});
    assert.ok(await apiTask(db)); assert.ok(await apiTask(db,'demo'));
    assert.notEqual((await apiTask(db)).id,task.id);
});

test('invalid snapshots never write; a failed source rolls back independently and unknown America clocks stay in review',async t=>{
    const db=await database(t);
    const first=demoCatalogue(); await applyDemoCatalogue(db,first,{now});
    const previous=await apiTask(db);
    const invalid=structuredClone(first); invalid.games[0].events[0].cover_url='https://example.com/remote.png';
    await assert.rejects(applyDemoCatalogue(db,invalid,{now}),/inválido/);
    assert.equal((await apiTask(db)).id,previous.id);
    const changed=demoCatalogue({now:now+86400000,revision:'1'.repeat(64)});
    const hsr=changed.games.find(entry=>entry.key==='hsr');
    hsr.events.push({...hsr.events[0],external_id:'overlapping-duplicate'});
    const zzz=changed.games.find(entry=>entry.key==='zzz');
    zzz.events[0].proposed_end_at='2099-01-14T08:59:59Z'; zzz.events[0].source_end_at='2099-01-14T08:59:59Z';
    const nte=changed.games.find(entry=>entry.key==='nte');
    nte.events=[{...nte.events[0],external_id:'unknown::2099-02-10T00:00:00Z',name:'Unknown edition',
        source_start_at:'2099-02-10T00:00:00Z',source_end_at:'2099-02-20T00:00:00Z',
        proposed_start_at:null,proposed_end_at:null,review_reason:'America clock not confirmed'}];
    const result=await applyDemoCatalogue(db,changed,{now:now+86400000});
    assert.deepEqual(result.failures,['hsr']);
    assert.equal((await apiTask(db)).expiration_date,previous.expiration_date);
    assert.equal(new Date((await apiTask(db,'cran','starrailassistant-zzz')).expiration_date).toISOString(),'2099-01-14T08:59:59.000Z');
    const review=await rpc(db,'list_profile_candidates',{p_source:'starrailassistant-nte'});
    assert.ok(review.some(event=>event.name==='Unknown edition' && event.proposed_end_at===null));
    assert.ok(!(await tasks(db)).some(task=>task.description==='Unknown edition'));
});

test('upgrading the first demo removes only untouched obsolete examples and keeps visitor drafts and deadlines',async t=>{
    const db=await database(t);
    const game=(await rpc(db,'list_profile_games')).find(game=>game.abbreviation==='HSR');
    const stale=await rpc(db,'save_profile_task',{p_task:{description:'Finalizar a atividade com prazo encerrado',game_id:game.id,
        refresh_type:0,expiration_date:new Date(now-86400000).toISOString()}});
    const title='Conferir as recompensas da próxima fase';
    const original=await rpc(db,'save_profile_task',{p_task:{description:title,game_id:game.id,
        refresh_type:0,expiration_date:new Date(now+5*86400000).toISOString(),is_done:true}});
    const edited=await rpc(db,'save_profile_task',{p_task:{description:title,game_id:game.id,
        refresh_type:0,expiration_date:'2099-02-01T12:00:00Z'}});
    await rpc(db,'save_profile_game',{p_game_id:game.id,p_game:{abbreviation:'HSR',pending_tasks:'My persistent notes'}});
    await db.exec('reset role; alter table demo_metadata drop column event_state; alter table demo_metadata drop column examples_version; set role anon;');
    await prepareDemoEvents(db);
    const after=await tasks(db);
    assert.ok(!after.some(task=>task.id===stale.id));
    assert.equal(after.find(task=>task.id===original.id).expiration_date,null);
    assert.equal(after.find(task=>task.id===original.id).description,title);
    assert.equal(after.find(task=>task.id===original.id).is_done,true);
    assert.equal(new Date(after.find(task=>task.id===edited.id).expiration_date).toISOString(),'2099-02-01T12:00:00.000Z');
    assert.equal((await rpc(db,'list_profile_games')).find(row=>row.id===game.id).pending_tasks,'My persistent notes');
    await prepareDemoEvents(db);
    assert.equal(new Date((await tasks(db)).find(task=>task.id===edited.id).expiration_date).toISOString(),'2099-02-01T12:00:00.000Z');
});

async function temporary(t) {
    const base=resolve('.local-deliveries/public-demo'); await mkdir(base,{recursive:true});
    const directory=await mkdtemp(join(base,'capture-test-'));
    t.after(async()=>{assert.ok(directory.startsWith(base+sep)); await rm(directory,{recursive:true,force:true});});
    return directory;
}
const calendar=game=>({activities:[{name:`Public event ${game.key}`,startTime:'2099-01-01T04:00:00',endTime:'2099-01-10T03:59:59',cover:'https://images.example.org/shared.png'},
    {name:'No cover',startTime:'2099-01-01T04:00:00',endTime:'2099-01-10T03:59:59',cover:''},
    {name:'Expired',startTime:'2088-01-01T04:00:00',endTime:'2088-01-02T03:59:59'}]});

test('public capture packages covers, caches partial failures honestly and never needs a database connection',async t=>{
    const directory=await temporary(t); const calls=[];
    const fetcher=async url=>{
        calls.push(String(url));
        const game=EVENT_GAMES.find(game=>game.url===String(url));
        if (game) return Response.json(calendar(game));
        assert.equal(String(url),'https://images.example.org/shared.png');
        return new Response(demoImage,{headers:{'content-type':'image/png'}});
    };
    const first=await captureDemoCatalogue({directory,fetcher,now});
    assert.equal(first.images.length,1);
    assert.ok(first.games.every(game=>game.events.length===1 && game.available && !game.retained));
    assert.equal(calls.filter(url=>url==='https://images.example.org/shared.png').length,1);
    await access(join(directory,'images',first.images[0].path.split('/').at(-1)));
    const partial=await captureDemoCatalogue({directory,now:now+86400000,fetcher:async url=>{
        if (String(url)===EVENT_GAMES.find(game=>game.key==='hsr').url) throw new Error('Offline');
        return fetcher(url);
    }});
    assert.equal(partial.games.find(game=>game.key==='hsr').capturedAt,first.games.find(game=>game.key==='hsr').capturedAt);
    assert.equal(partial.games.find(game=>game.key==='hsr').retained,true);
    assert.match(describeDemoCatalogue(partial,now+86400000),/Coleta pendente para Honkai Star Rail/);
    const offline=await captureDemoCatalogue({directory,now:now+2*86400000,fetcher:async()=>{throw new Error('Offline');}});
    assert.ok(offline.games.every(game=>game.retained));
    assert.equal(offline.games[0].capturedAt,partial.games[0].capturedAt,'Build time cannot masquerade as source freshness');
    await rm(join(directory,'images',first.images[0].path.split('/').at(-1)));
    const missingImage=await captureDemoCatalogue({directory,now:now+3*86400000,fetcher:async()=>{throw new Error('Offline');}});
    assert.ok(missingImage.games.every(game=>game.events.length===0), 'Missing cached files cannot become icon substitutes');
    assert.equal(missingImage.images.length,0);
    assert.ok(calls.every(url=>!url.includes('supabase')));
    const empty=await temporary(t);
    await assert.rejects(captureDemoCatalogue({directory:empty,now,fetcher:async()=>{throw new Error('Offline');}}),/Nenhum calendário/);
    await assert.rejects(access(join(empty,'catalogue.json')));
});

test('missing or invalid photos are omitted instead of replaced with game icons; publication stays gated',async t=>{
    const directory=await temporary(t);
    const catalogue=await captureDemoCatalogue({directory,now,fetcher:async url=>{
        const game=EVENT_GAMES.find(game=>game.url===String(url));
        return game ? Response.json(calendar(game)) : new Response('<html>not an image</html>');
    }});
    assert.equal(catalogue.images.length,0);
    assert.ok(catalogue.games.every(game=>game.events.length===0 && game.available));
    const workflow=await readFile('.github/workflows/public-demo-pages.yml','utf8');
    assert.match(workflow,/if: vars\.PUBLIC_DEMO_PAGES_ENABLED == 'true'/);
    assert.match(workflow,/45 10 \* \* \*/);
    assert.match(workflow,/npm run demo:capture/);
    assert.doesNotMatch(workflow,/syncEvents|SUPABASE|secrets\./);
});
