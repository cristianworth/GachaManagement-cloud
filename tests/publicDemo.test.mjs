import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { PGlite } from '@electric-sql/pglite';
import { buildDemo, DEMO_BASE_PATH } from '../scripts/buildDemo.js';
import { createDemoClient, installDemo } from '../demo/database.js';
import { getGameDailyState } from '../js/utils/gameDailyState.js';
import { getGameNotifications } from '../js/utils/gameNotices.js';
import { attachBannerAgenda, isBannerPhaseId } from '../js/utils/bannerCatalogue.js';
import { gameFromRow } from '../js/database/mappers/gameMapper.js';
import { writeDemoCatalogueFixture, demoImagePath } from './helpers/demoCatalogue.mjs';
import { buildPages } from '../scripts/buildPages.js';
import { createDemoCoverChecker } from '../demo/covers.js';
import { isCurrentDemoEvent } from '../demo/catalogue.js';

const now = Date.parse('2026-11-02T15:00:00Z');
let root;
test('static demo preserves real views and excludes production access and external resources', async () => {
    root = await buildDemo({ name: 'test-build', catalogueDirectory:await writeDemoCatalogueFixture() });
    const read = path => readFile(resolve(root, path), 'utf8');
    const html = await read('index.html');
    const doc = new JSDOM(html).window.document;
    const original = new JSDOM(await readFile('index.html', 'utf8')).window.document;
    assert.deepEqual([...doc.querySelectorAll('[data-page]')].map(el => el.dataset.page),
        [...original.querySelectorAll('[data-page]')].map(el => el.dataset.page));
    assert.equal(doc.querySelector('base').getAttribute('href'), `${DEMO_BASE_PATH}/`);
    assert.equal(doc.querySelectorAll('script').length, 1);
    assert.equal(doc.querySelector('script').getAttribute('src'), 'demo/bootstrap.js');
    assert.equal(doc.querySelector('script[src*="supabase"]'), null);
    assert.match(doc.querySelector('[http-equiv="Content-Security-Policy"]').content, /connect-src 'self'/);
    assert.equal(doc.querySelectorAll('[src^="https:"], [href^="https:"]').length, 1, 'Only the explicit project-code link may leave the site');
    for (const path of ['js/ui/gameUI.js','js/ui/profileUI.js','js/ui/gameAgenda.js',
        'js/ui/gameNotifications.js','js/utils/router.js','css/sangonomiya.css']) {
        assert.equal(await read(path), await readFile(path,'utf8'), `${path} must be the real interface`);
    }
    assert.equal(await read('js/ui/taskUI.js'), await readFile('js/ui/taskUI.js','utf8'),
        'The demo must not substitute game icons for event covers');
    assert.equal(await read('js/database/supabaseClient.js'), "export { getClient, Tables } from '../../demo/client.js';\n");
    assert.equal(await read('js/config/supabase.config.js'), 'export const isSupabaseConfigured = () => true;\n');
    assert.doesNotMatch(await read('demo/schema.sql'), /"cover_url":\s*"https:/);
    assert.match(await read('js/services/profileSession.js'), /gacha-demo-profile-v1:/);
    assert.match(await read('js/services/profileSession.js'), /let selected = 'cran'/);
    assert.match(await read('js/services/profileSession.js'), /id === 'choose'/);
    assert.equal(await read('js/events/eventGames.js'),await readFile('js/events/eventGames.js','utf8'));
    assert.equal(await read('js/ui/eventReviewUI.js'),await readFile('js/ui/eventReviewUI.js','utf8'));
    assert.ok(JSON.parse(await read('demo/catalogue.json')).games.length === 5);
    await access(resolve(root,demoImagePath));
    await assert.rejects(access(resolve(root,'js/data/banners/gi.json')));
    const config = await readFile('js/config/supabase.config.js','utf8');
    const realUrl = config.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)/)?.[1];
    const realKey = config.match(/SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)/)?.[1];
    const manifest = JSON.parse(await read('build-manifest.json'));
    for (const file of manifest.files.filter(file => /\.(js|html|sql|json|txt|css)$/.test(file.path))) {
        const source = await read(file.path);
        if (realUrl && realUrl !== 'YOUR_SUPABASE_URL') assert.ok(!source.includes(realUrl), `${file.path} contains production URL`);
        if (realKey && realKey.length > 30) assert.ok(!source.includes(realKey), `${file.path} contains production credentials`);
        assert.doesNotMatch(source, /createClient\s*\(|cdn.jsdelivr.net\/npm\/@supabase/);
    }
    const pages = await buildPages({demoDirectory:root,name:'test-pages'});
    assert.equal(await readFile(resolve(pages,'index.html'),'utf8'),await readFile('index.html','utf8'));
    assert.equal(await readFile(resolve(pages,'js/config/supabase.config.js'),'utf8'),config,'Normal Pages keeps its established configuration');
    assert.equal(await readFile(resolve(pages,'demo/js/config/supabase.config.js'),'utf8'),'export const isSupabaseConfigured = () => true;\n');
});

test('the shared entry point starts the real shell only once after delayed demo initialization', async () => {
    const ui = new JSDOM('<!doctype html><body></body>');
    let shellCount = 0;
    let routeCount = 0;
    const noOp = async () => {};
    const dependencies = {
        document: ui.window.document,
        Router: {init:async () => { routeCount++; }},
        initializeDatabase:noOp, isSupabaseConfigured:()=>true,
        initializeGameForm:noOp, initializeTaskForm:noOp,
        populateGameDropDown:noOp, populateRefreshTypeDropDown:noOp,
        initializeNumberInputValidation:noOp, withLoading:(_,fn)=>fn(),
        initializeProfiles:async()=>true, populateInitialGames:noOp,
        initializeAppShell:()=>{shellCount++;}, initializeGameNotifications:noOp, refreshGameNotifications:noOp,
        // The timeout guard is irrelevant here; do not keep the Node test alive for 15 seconds.
        setTimeout:()=>0,
    };
    const source = (await readFile('js/index.js','utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function','function');
    const initialize = new Function(...Object.keys(dependencies), `${source}\nreturn initializeApplication;`)(...Object.values(dependencies));
    const first = initialize();
    assert.equal(initialize(),first);
    await first;
    ui.window.document.dispatchEvent(new ui.window.Event('DOMContentLoaded'));
    await initialize();
    assert.equal(shellCount,1);
    assert.equal(routeCount,1);
    ui.window.close();
});

test('demo executes real SQL with local examples, per-visitor isolation and transactional restoration', async t => {
    const schema = (await readFile('db/schema.sql','utf8')).replace(/("cover_url":\s*)"https:[^"]*"/g,'$1""');
    const seed = await readFile('db/seed.sql','utf8');
    const db = new PGlite();
    const visitor2 = new PGlite();
    t.after(async () => { await db.close(); await visitor2.close(); });
    for (const database of [db,visitor2]) {
        await database.exec('create role anon; create role authenticated; create role service_role;');
        await installDemo(database,schema,seed,{now});
    }
    const client = createDemoClient(db);
    const other = createDemoClient(visitor2);
    const rpc = async (name, params = {}) => {
        const result = await client.rpc(name,{p_profile_id:'cran',...params});
        assert.equal(result.error,null,result.error?.message); return result.data;
    };
    const games = await rpc('list_profile_games');
    assert.equal(games.length,5);
    assert.deepEqual(games.map(game => getGameDailyState(gameFromRow(game),now)).sort(),
        ['done','done','pending','pending','return_later']);
    assert.deepEqual(await rpc('list_profile_tasks'), [], 'Unillustrated seed tasks stay out of the demo');
    const tasks = (await db.query("select public.list_profile_tasks('cran') as tasks")).rows[0].tasks;
    assert.ok(tasks.some(task => task.is_done));
    assert.ok(tasks.some(task => task.is_favorite && !task.is_done));
    assert.ok(tasks.some(task => task.refresh_type === 1));
    assert.ok(tasks.some(task => task.refresh_type === 2));
    const offers = await rpc('list_profile_task_batch',{p_now:new Date(now).toISOString()});
    assert.equal(offers.length,16);
    assert.ok(offers.every(item=>!item.cover_url), 'The batch cannot load external covers');
    const batch = await rpc('choose_profile_task_batch',{
        p_items:[{abbreviation:'HSR',definition_key:'echo-of-war',calendar_key:''}],
        p_request_id:'00000000-0000-4000-8000-000000000001',p_now:new Date(now).toISOString(),
    });
    assert.equal(batch.created,1,'The demo adapter must serialize batch selections through the real SQL contract');
    assert.ok(games.every(game => game.pending_tasks.includes('•')));
    const agenda = (await db.query('select agenda from public.demo_metadata')).rows[0].agenda;
    assert.equal(agenda.length,10);
    const notifications = getGameNotifications(attachBannerAgenda(games.map(gameFromRow),agenda),now);
    assert.equal(notifications.length,5);
    assert.ok(notifications.every(item=>isBannerPhaseId(item.agendaId)
        && item.agendaIds.length === 1 && item.agendaIds.every(isBannerPhaseId)), 'Read receipts must identify phases, not fictional character rows');
    assert.ok(agenda.every(entry => entry.timing_note.includes('fictício') && !entry.sources.length));
    const gi = games.find(game => game.abbreviation === 'GI');
    const notice = notifications.find(item => item.gameId === gi.id);
    await rpc('save_profile_game',{p_game_id:gi.id,p_game:{abbreviation:'GI',
        [`banner_phase_read_${notice.agendaId}`]:{signature:notice.signature,stage:notice.stage}}});
    const readGames = (await rpc('list_profile_games')).map(gameFromRow);
    assert.equal(getGameNotifications(attachBannerAgenda(readGames,agenda),now).filter(item=>item.unread).length,4);
    await rpc('save_profile_game',{p_game_id:gi.id,p_game:{abbreviation:'GI',pending_tasks:'My private demo note'}});
    assert.equal((await rpc('list_profile_games')).find(game => game.id === gi.id).pending_tasks,'My private demo note');
    const untouched = (await other.rpc('list_profile_games',{p_profile_id:'cran'})).data;
    assert.notEqual(untouched.find(game => game.id === gi.id).pending_tasks,'My private demo note');
    await rpc('set_profile_task_favorite',{p_task_id:tasks[0].id,p_is_favorite:true});
    await rpc('complete_profile_task',{p_task_id:tasks[0].id,p_is_done:true});
    assert.ok((await db.query("select public.list_profile_tasks('cran') as tasks")).rows[0].tasks.find(task => task.id === tasks[0].id).is_done);
    assert.ok((await client.rpc('evil); drop schema public;--')).error);
    assert.ok((await client.rpc('list_profile_games',{'p_profile_id); select 1;--':'cran'})).error);
    // A failed restore rolls back schema and examples together.
    await assert.rejects(installDemo(db,'invalid sql',seed,{restore:true,now}));
    assert.equal((await rpc('list_profile_games')).find(game => game.id === gi.id).pending_tasks,'My private demo note');
    await assert.rejects(installDemo(db,schema,'select missing_demo_seed_function();',{restore:true,now}));
    assert.equal((await rpc('list_profile_games')).find(game => game.id === gi.id).pending_tasks,'My private demo note',
        'Failure after all schema statements must still roll back the whole restore');
    await installDemo(db,schema,seed,{restore:true,now:now + 86400000});
    assert.notEqual((await rpc('list_profile_games')).find(game => game.abbreviation === 'GI').pending_tasks,'My private demo note');
    assert.equal((await db.query('select seeded_at from public.demo_metadata')).rows[0].seeded_at.toISOString(),'2026-11-03T15:00:00.000Z');
    assert.equal((await db.query('select current_user as role')).rows[0].role,'anon');
});

test('demo reads hide expired, unillustrated, icon-only and broken-cover tasks without deleting visitor state', async t => {
    assert.equal(isCurrentDemoEvent({source_end_at:new Date(now-1).toISOString()},now),false,
        'An unconfirmed deadline cannot extend an already ended demo event by a grace window');
    const db = new PGlite(); t.after(() => db.close());
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await installDemo(db,await readFile('db/schema.sql','utf8'),await readFile('db/seed.sql','utf8'),{now});
    let clock = now;
    const broken = `img/demo-events/${'f'.repeat(64)}.png`;
    const client = createDemoClient(db,{now:()=>clock,coverAvailable:async path=>path!==broken});
    const rpc = async (name,params={}) => {
        const result = await client.rpc(name,{p_profile_id:'cran',...params});
        assert.equal(result.error,null,result.error?.message); return result.data;
    };
    const game = (await rpc('list_profile_games'))[0];
    const create = (description,cover_url,expiration_date,refresh_type=0) => rpc('save_profile_task',{
        p_task:{description,game_id:game.id,cover_url,expiration_date,refresh_type}});
    const future = new Date(now+1000).toISOString();
    const noDate = await create('Illustrated without deadline',demoImagePath,null);
    const dated = await create('Illustrated future event',demoImagePath,future);
    await rpc('set_profile_task_favorite',{p_task_id:dated.id,p_is_favorite:true});
    const expired = await create('Expired illustrated task',demoImagePath,new Date(now-1).toISOString());
    await create('Expired recurrence',demoImagePath,new Date(now-1).toISOString(),1);
    await create('Expired at exact boundary',demoImagePath,new Date(now).toISOString());
    await create('No image',null,future);
    await create('Game icon is not an event photo','img/star-rail-icon.png',future);
    await create('Broken local cover',broken,future);
    const visible = await rpc('list_profile_tasks');
    assert.deepEqual(visible.map(row=>row.id).sort((a,b)=>a-b),[noDate.id,dated.id]);
    assert.equal(visible.find(row=>row.id===dated.id).is_favorite,true);
    const other = await client.rpc('list_profile_tasks',{p_profile_id:'demo'});
    assert.deepEqual(other.data,[],'A visible personal task cannot appear in another profile');
    clock = now+1000;
    assert.deepEqual((await rpc('list_profile_tasks')).map(row=>row.id),[noDate.id]);
    const stored = (await db.query("select public.list_profile_tasks('cran') as tasks")).rows[0].tasks;
    assert.ok(stored.some(row=>row.id===expired.id),'Visibility cannot delete personal work');
    assert.equal(stored.find(row=>row.id===dated.id).is_favorite,true);
    await rpc('save_profile_game',{p_game_id:game.id,p_game:{abbreviation:game.abbreviation,pending_tasks:'Notes remain intact'}});
    assert.equal((await rpc('list_profile_games')).find(row=>row.id===game.id).pending_tasks,'Notes remain intact');
});

test('demo checks that a bundled photo loads, shares concurrent checks and retries a failed image', async () => {
    let attempts=0, succeed=false;
    const available=createDemoCoverChecker({createImage:()=>({naturalWidth:20,
        set src(value) { attempts++; queueMicrotask(()=>succeed?this.onload?.():this.onerror?.()); }})});
    assert.equal(await available('img/star-rail-icon.png'),false);
    assert.deepEqual(await Promise.all([available(demoImagePath),available(demoImagePath)]),[false,false]);
    assert.equal(attempts,1);
    succeed=true;
    assert.equal(await available(demoImagePath),true);
    assert.equal(await available(demoImagePath),true);
    assert.equal(attempts,2);
});

test('Pages 404 dispatch preserves demo routes and queries without changing ordinary routes', async () => {
    const source = await readFile('404.html','utf8');
    for (const [url,expected] of [
        ['https://cristianworth.github.io/GachaManagement-cloud/demo/tasks?game=2','/GachaManagement-cloud/demo/?game=2#/tasks'],
        ['https://cristianworth.github.io/GachaManagement-cloud/demo/agenda','/GachaManagement-cloud/demo/#/agenda'],
        ['https://cristianworth.github.io/GachaManagement-cloud/tasks?game=2','/GachaManagement-cloud/?game=2#/tasks'],
    ]) {
        const doc = new JSDOM(source,{url}).window.document;
        let target;
        new Function('window',doc.querySelector('script').textContent)({location:{...new URL(url),
            pathname:new URL(url).pathname,hostname:new URL(url).hostname,search:new URL(url).search,
            replace:value=>{target=value;}}});
        assert.equal(target,expected);
    }
});
