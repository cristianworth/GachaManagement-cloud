import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BANNER_GAMES,validateBannerCatalogue,bannerPhasesFromData,attachBannerAgenda} from '../js/utils/bannerCatalogue.js';
import {getGameNotifications} from '../js/utils/gameNotices.js';
import {mockBannerFiles} from './helpers/bannerFiles.mjs';
import {getAppBasePath} from '../js/utils/appPaths.js';

const phase=()=>({id:'gi-7.1-phase-2',version:'7.1',phase:2,starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-11-03T19:59:00Z',
    sources:['https://example.org/announcement'],characters:[{name:'Skirk'},{name:'Escoffier'}]});

test('the five published files retain confirmed periods, grouped characters and Pearl in two phases',async()=>{
    const files=await Promise.all(BANNER_GAMES.map(async game=>bannerPhasesFromData(JSON.parse(await readFile(new URL(`../js/data/banners/${game.file}`,import.meta.url),'utf8')),game)));
    assert.equal(files.flat().length,6);
    assert.equal(files.flat().filter(item=>Date.parse(item.ends_at)>Date.parse('2026-10-27T12:00:00Z')).length,5);
    assert.deepEqual(files[0][0].characters.map(character=>character.name),['Skirk','Escoffier']);
    assert.equal(files[0][0].ends_at,'2026-11-03T19:59:00.000Z');
    assert.equal(files[1].filter(item=>item.characters.some(character=>character.name==='Pearl'&&character.whole_version)).length,2);
    assert.equal(files[3][0].characters.length,3);
});

test('validation rejects ambiguous timezones, impossible dates, duplicate phases and invalid content',()=>{
    const valid=phase();assert.equal(validateBannerCatalogue([valid],'GI')[0],valid);
    for(const patch of [{phase:3},{id:'gi-7.1-phase-1'},{version:''},{starts_at:'2026-10-01T00:00:00'},
        {starts_at:'2026-02-30T00:00:00Z'},{starts_at:'2026-10-01T24:00:00Z'},{ends_at:valid.starts_at},
        {sources:['http://example.org']},{characters:[]},{characters:[{name:'Same'},{name:'same'}]},
        {characters:[{name:'Skirk',image_url:'javascript:alert(1)'}]}]) {
        assert.throws(()=>validateBannerCatalogue([{...valid,...patch}],'GI'));
    }
    assert.throws(()=>validateBannerCatalogue([valid,structuredClone(valid)],'GI'),/duplicad/);
    assert.throws(()=>validateBannerCatalogue([{...valid,id:'gi-7.1-phase-1',phase:1},valid],'GI'),/sobrepõe/);
    assert.doesNotThrow(()=>validateBannerCatalogue([{...valid,starts_at:'2026-10-01T01:00:00+08:00'}],'GI'));
});

test('published phases supersede SQL calendars and read receipts remain personal and stable across image updates',()=>{
    const raw=phase();
    const phases=()=>bannerPhasesFromData([raw],BANNER_GAMES[0]);
    const game={id:1,abbreviation:'GI',agenda:[{id:99,title:'Obsolete SQL calendar'}]};
    const now='2026-11-02T19:59:00Z';
    let attached=attachBannerAgenda([game],phases());
    const notice=getGameNotifications(attached,now)[0];
    assert.equal(notice.agendaId,'gi-7.1-phase-2');assert.equal(notice.stage,'24h');
    game.bannerReads={[notice.agendaId]:{signature:notice.signature,stage:notice.stage}};
    raw.characters[0].image_url='https://example.org/new-art.png';
    attached=attachBannerAgenda([game,{id:2,abbreviation:'GI'},{id:3,abbreviation:'CUSTOM'}],phases());
    assert.equal(getGameNotifications([attached[0]],now)[0].unread,false);
    assert.equal(getGameNotifications([attached[1]],now)[0].unread,true);
    assert.deepEqual(attached[2].agenda,[]);
    raw.characters[0].name='Corrected character';
    assert.equal(getGameNotifications(attachBannerAgenda([game],phases()),now)[0].unread,true);
    assert.equal(game.agenda[0].id,99,'Joining source data does not mutate the database snapshot');
});

test('loader shares requests, caches briefly, forces published updates and rejects partial or malformed refreshes',async t=>{
    const files=mockBannerFiles(t);
    const previousWindow=globalThis.window;
    globalThis.window={location:new URL('https://example.github.io/GachaManagement-cloud/agenda')};
    t.after(()=>{if(previousWindow === undefined)delete globalThis.window;else globalThis.window=previousWindow;});
    t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-27T12:00:00Z')});
    const {fetchBannerAgenda}=await import('../js/services/bannerAgenda.js');
    const [first,parallel]=await Promise.all([fetchBannerAgenda(),fetchBannerAgenda()]);
    assert.equal(first,parallel);assert.equal(files.requests.length,5);
    await fetchBannerAgenda();assert.equal(files.requests.length,5);
    files.files['gi.json'][0].characters[0].name='Updated name';
    const updated=await fetchBannerAgenda({force:true});
    assert.equal(updated.find(item=>item.abbreviation==='GI').characters[0].name,'Updated name');
    const good=structuredClone(files.files['gi.json']);files.files['gi.json'][0].starts_at='bad';
    await assert.rejects(fetchBannerAgenda({force:true}),/data válida/);
    assert.equal(await fetchBannerAgenda(),updated,'A failed refresh never commits half of the files');
    files.files['gi.json']=good;files.error='Offline';
    t.mock.timers.setTime(Date.parse('2026-10-27T12:07:00Z'));
    await assert.rejects(fetchBannerAgenda(),/Offline/);
    files.error=null;assert.equal((await fetchBannerAgenda()).length,6);
    assert.ok(files.requests.every(request=>request.options.cache==='no-store'&&request.url.startsWith('https://example.github.io/GachaManagement-cloud/js/data/banners/')));
    assert.equal(getAppBasePath(new URL('http://127.0.0.1:5510/agenda')),'');
    assert.equal(getAppBasePath(new URL('https://custom.example/agenda')),'');
});
