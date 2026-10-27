import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';
import {mockBannerFiles} from './helpers/bannerFiles.mjs';

test('notification center and game agenda preserve profiles, drafts and read milestones', async t => {
    const {dom,state,close}=createDomHarness();
    const files=mockBannerFiles(t);
    const {fetchBannerAgenda}=await import('../js/services/bannerAgenda.js');
    const games=await import('../js/ui/gameUI.js');
    const notifications=await import('../js/ui/gameNotifications.js');
    const {fillGameNoticeFields,readGameNoticeChanges}=await import('../js/ui/gameNotices.js');
    const {resetGameForm}=await import('../js/ui/formHandler.js');
    const {selectProfile}=await import('../js/services/profileSession.js');
    const {getClient}=await import('../js/database/supabaseClient.js');
    t.after(()=>{notifications.stopGameNotifications();games.stopStaminaEstimateTimer();close();});
    t.mock.method(console,'error',()=>{}); t.mock.method(console,'log',()=>{});
    const initial=Date.parse('2026-10-23T12:00:00Z');
    t.mock.timers.enable({apis:['Date'],now:initial});
    const timers=new Map();let nextId=0;let hidden=false;
    t.mock.method(window,'setInterval',fn=>{timers.set(++nextId,fn);return nextId;});
    t.mock.method(window,'clearInterval',id=>timers.delete(id));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    const el=id=>document.getElementById(id);
    const event=type=>new dom.window.Event(type,{bubbles:true,cancelable:true});
    const schedule={banner:{characters:'<img src=x> / A'}};
    const fixture={id:1,description:'Genshin',abbreviation:'GI',current_stamina:80,pending_tasks:'Saved notes',cap_stamina:200,stamina_per_minute:8,game_agenda:[
        {id:101,game_id:1,kind:'banner',title:'Other banner',version:'7.1 — Fase 1',starts_at:'2026-10-01T12:00:00.000Z',ends_at:'2026-10-25T12:00:00.000Z'},
        {id:102,game_id:1,kind:'banner',title:schedule.banner.characters,version:'8.1 — Fase 2',starts_at:'2026-10-01T12:00:00.000Z',ends_at:'2026-10-25T12:00:00.000Z'}]};
    const phases=fixture.game_agenda.map((entry,index)=>({id:`gi-${index?'8.1':'7.1'}-phase-${index?2:1}`,version:index?'8.1':'7.1',phase:index?2:1,
        starts_at:entry.starts_at,ends_at:entry.ends_at,sources:['https://example.org/announcement'],characters:[{name:entry.title}]}));
    const seed=async()=>{
        if(el('notificationsPanel').open)el('notificationsPanel').close();
        notifications.stopGameNotifications();games.stopStaminaEstimateTimer();selectProfile('cran');hidden=false;
        t.mock.timers.setTime(initial);state.games=[structuredClone(fixture)];state.writes=[];state.error=null;state.readError=null;state.beforeQuery=null;
        files.files=Object.fromEntries(Object.keys(files.files).map(file=>[file,[]]));files.files['gi.json']=structuredClone(phases);files.error=null;
        await fetchBannerAgenda({force:true});
        document.querySelector('[data-page="games"]').style.display='block';
        document.querySelector('[data-page="createGame"]').style.display='none';
        document.querySelector('[data-page="taskList"]').style.display='none';
        notifications.initializeGameNotifications();await games.displayAllGames();
    };
    const settled=()=>waitFor(()=>!el('notificationsPanel').dataset.saving&&!el('notificationsPanel').dataset.reading);
    const open=async()=>{el('notificationsButton').click();await settled();};
    const readAll=async()=>{el('notificationsReadAll').click();await settled();};
    const toggle=(id,value)=>{el(id).checked=value;el(id).dispatchEvent(event('change'));};

    await t.test('clean cards and a closed center show only a counter; opening does not mark messages read',async()=>{
        await seed();assert.equal(el('notificationCount').textContent,'2');assert.equal(el('notificationsPanel').open,false);
        assert.equal(document.querySelector('.game-notices'),null);assert.equal(el('notices-game-1'),null);
        await open();assert.equal(el('notificationList').children.length,2);assert.equal(state.writes.length,0);
        el('notificationsClose').click();assert.equal(document.activeElement,el('notificationsButton'));
    });
    await t.test('one phase receipt covers both characters in one profile update',async()=>{
        await seed();
        files.files['gi.json'][1].characters.push({name:'Second character'});
        await games.displayAllGames();await open();
        assert.equal(el('notificationList').children.length,2,'Two distinct banner phases, one with two characters');
        el('notification-1-agenda-gi-8.1-phase-2').click();await settled();
        assert.equal(state.writes.length,1);
        assert.ok(state.writes[0].payload['banner_phase_read_gi-8.1-phase-2']);
        assert.equal(Object.keys(state.writes[0].payload).filter(key=>key.startsWith('banner_phase_read_')).length,1,'One receipt covers all characters of the phase');
        assert.equal(el('notificationCount').textContent,'1');
        await notifications.refreshGameNotifications({force:true});assert.equal(el('notificationCount').textContent,'1');
    });
    await t.test('opening a message saves only its receipt and keeps draft nodes and the other unread notification',async()=>{
        await seed();const notes=el('pendingTask1');notes.value='My draft';el('currentStamina1').value='11';
        await open();el('notification-1-agenda-gi-7.1-phase-1').focus();el('notification-1-agenda-gi-7.1-phase-1').click();await settled();
        assert.equal(el('notificationCount').textContent,'1');assert.equal(el('notification-1-agenda-gi-7.1-phase-1-details').hidden,false);
        assert.equal(document.activeElement,el('notification-1-agenda-gi-7.1-phase-1'));
        assert.equal(Object.hasOwn(state.writes[0].payload,'banner_phase_read_gi-7.1-phase-1'),true);
        assert.equal(Object.hasOwn(state.writes[0].payload,'game_notices'),false);
        assert.equal(state.games[0].current_stamina,80);assert.equal(state.games[0].pending_tasks,'Saved notes');
        assert.equal(el('pendingTask1'),notes);assert.equal(notes.value,'My draft');assert.equal(el('currentStamina1').value,'11');
        el('notification-1-agenda-gi-8.1-phase-2').click();await settled();
        assert.equal(el('notificationCount').hidden,true);assert.match(el('notification-1-agenda-gi-8.1-phase-2-details').textContent,/<img src=x>/);
        assert.equal(el('notificationList').querySelector('img'),null);
        await notifications.refreshGameNotifications({force:true});assert.equal(el('notificationCount').hidden,true);
    });
    await t.test('48h and 24h before phase end update the same entries; returning to the tab removes expired phases',async()=>{
        await seed();await open();await readAll();assert.equal(state.writes.length,1,'Both receipts are grouped in one write');
        const tick=async now=>{t.mock.timers.setTime(Date.parse(now));for(const callback of timers.values())await callback();await settled();};
        await tick('2026-10-24T12:00:00Z');assert.equal(el('notificationCount').textContent,'2');
        assert.equal(el('notificationList').children.length,2);assert.match(el('notification-1-agenda-gi-8.1-phase-2').textContent,/24h/);
        await readAll();assert.equal(el('notificationCount').hidden,true);
        hidden=true;document.dispatchEvent(event('visibilitychange'));assert.equal(timers.size,0);
        t.mock.timers.setTime(Date.parse('2026-10-25T12:00:00Z'));hidden=false;document.dispatchEvent(event('visibilitychange'));await settled();
        assert.equal(el('notificationList').children.length,0);assert.equal(el('notificationCount').hidden,true);
        assert.equal(el('notificationsEmpty').hidden,false);
    });
    await t.test('failed receipt saves keep unread status and allow retry without duplicated writes',async()=>{
        await seed();await open();state.error='Unavailable';el('notification-1-agenda-gi-8.1-phase-2').click();await settled();
        assert.equal(el('notificationCount').textContent,'2');assert.match(el('notificationStatus').textContent,/não puderam/);
        state.error=null;await readAll();assert.equal(el('notificationCount').hidden,true);
        await seed();await open();let release;let requested=false;const gate=new Promise(resolve=>{release=resolve;});
        state.beforeQuery=async request=>{if(request.operation==='update'){requested=true;await gate;}};
        el('notificationsReadAll').click();await waitFor(()=>requested);el('notificationsReadAll').click();
        assert.equal(el('notificationsReadAll').disabled,true);release();await settled();assert.equal(state.writes.length,1);
    });
    await t.test('the center works on Tasks; failed refresh preserves messages and a later retry recovers',async()=>{
        await seed();document.querySelector('[data-page="games"]').style.display='none';
        document.querySelector('[data-page="taskList"]').style.display='block';
        await open();assert.equal(el('notificationList').children.length,2);
        state.readError='Offline';await notifications.refreshGameNotifications({force:true});
        assert.equal(el('notificationList').children.length,2);assert.match(el('notificationStatus').textContent,/atualizar os avisos/);
        state.readError=null;await notifications.refreshGameNotifications({force:true});assert.equal(el('notificationStatus').hidden,true);
    });
    await t.test('failed JSON refresh preserves read messages and Games can still save stamina',async()=>{
        await seed();await open();el('notification-1-agenda-gi-7.1-phase-1').click();await settled();
        files.error='Missing published file';await notifications.refreshGameNotifications({force:true});
        assert.equal(el('notificationList').children.length,2);assert.equal(el('notificationCount').textContent,'1');
        assert.equal(el('notificationStatus').dataset.kind,'error');
        el('notificationsClose').click();el('currentStamina1').value='0';el('save-game-1').click();
        await waitFor(()=>el('loadingOverlay').hidden);
        assert.equal(state.games[0].current_stamina,0);assert.equal(state.games[0].daily_state.state,'done');
        files.error=null;await notifications.refreshGameNotifications({force:true});
        assert.equal(el('notificationCount').textContent,'1');
    });
    await t.test('mark all preserves successful games when another game fails and retry only writes unread games',async()=>{
        await seed();state.games.push({...structuredClone(fixture),id:2,description:'Other game',abbreviation:'HSR'});
        files.files['hsr.json']=[{...structuredClone(phases[1]),id:'hsr-8.1-phase-2'}];
        await games.displayAllGames();await open();
        const client=getClient();const rpc=client.rpc.bind(client);
        const mock=t.mock.method(client,'rpc',async(name,payload)=>name==='save_profile_game'&&payload.p_game_id===2
            ? {data:null,error:new Error('Unavailable')} : rpc(name,payload));
        await readAll();assert.equal(el('notificationCount').textContent,'1');
        assert.ok(state.games[0]['banner_phase_read_gi-7.1-phase-1']);assert.equal(state.games[1]['banner_phase_read_hsr-8.1-phase-2'],undefined);
        assert.match(el('notificationStatus').textContent,/marcações confirmadas/);mock.mock.restore();
        state.writes=[];await readAll();assert.equal(state.writes.length,1);assert.equal(el('notificationCount').hidden,true);
    });
    await t.test('a saved read receipt supersedes a stale notification fetch',async()=>{
        await seed();await open();const client=getClient();const rpc=client.rpc.bind(client);
        let release;let requested=false;const gate=new Promise(resolve=>{release=resolve;});
        const oldData=structuredClone(state.games);
        const mock=t.mock.method(client,'rpc',async(name,payload)=>{
            if(name==='list_profile_games'){requested=true;await gate;return {data:oldData,error:null};}
            return rpc(name,payload);
        });
        const pending=notifications.refreshGameNotifications({force:true});await waitFor(()=>requested);
        el('notification-1-agenda-gi-7.1-phase-1').click();await waitFor(()=>!el('notificationsPanel').dataset.saving);
        release();await pending;assert.equal(el('notificationCount').textContent,'1');
        assert.match(el('notification-1-agenda-gi-7.1-phase-1').textContent,/Lida/);mock.mock.restore();
    });
    await t.test('changing profile during a pending read cannot show the previous profile messages',async()=>{
        await seed();let release;const gate=new Promise(resolve=>{release=resolve;});let requested=false;
        state.beforeQuery=async request=>{if(request.operation==='select'){requested=true;await gate;}};
        const pending=notifications.refreshGameNotifications({force:true});await waitFor(()=>requested);
        selectProfile('demo');state.games=[{id:2,description:'Other',abbreviation:'CUSTOM'}];
        notifications.setNotificationGames([], 'demo');release();await pending;
        assert.equal(el('notificationList').children.length,0);assert.equal(el('notificationCount').hidden,true);
    });
    await t.test('a delayed acknowledgement keeps its original actor and cannot change a new profile',async()=>{
        await seed();await open();const client=getClient();const rpc=client.rpc.bind(client);let actor;let release;
        const gate=new Promise(resolve=>{release=resolve;});
        const mock=t.mock.method(client,'rpc',async(name,payload)=>{if(name==='save_profile_game'){actor=payload.p_profile_id;await gate;}return rpc(name,payload);});
        el('notificationsReadAll').click();await waitFor(()=>actor);
        selectProfile('demo');state.games=[{id:2,description:'Other',abbreviation:'CUSTOM'}];notifications.setNotificationGames([], 'demo');
        release();await settled();await notifications.refreshGameNotifications({force:true});
        assert.equal(actor,'cran');assert.equal(el('notificationCount').hidden,true);assert.equal(state.games[0]['banner_phase_read_gi-7.1-phase-1'],undefined);
        mock.mock.restore();
    });
    await t.test('Edit saves only profile preferences and keeps the shared schedule intact',async()=>{
        await seed();resetGameForm();el('gameId').value='1';
        for(const [id,value] of Object.entries({gameDescription:'Genshin',abbreviation:'GI',capStamina:'200',staminaPerMinute:'8'}))el(id).value=value;
        fillGameNoticeFields({noticePreferences:{maintenance:true,banner:true}});
        assert.equal(el('gameNoticeSettings').open,false);assert.equal(readGameNoticeChanges(),null);
        assert.equal(el('maintenanceStart'),null);assert.equal(el('bannerCharacters'),null);
        assert.equal(el('maintenanceNotify'),null);
        toggle('bannerNotify',false);
        assert.deepEqual(readGameNoticeChanges(),{preferences:{banner:false}});
        const agenda=structuredClone(state.games[0].game_agenda);
        await games.handleAddGame();
        assert.deepEqual(state.games[0].game_agenda,agenda);
        assert.equal(Object.hasOwn(state.writes[0].payload,'game_notices'),false);
        assert.equal(Object.hasOwn(state.writes[0].payload,'game_agenda'),false);
        await games.displayAllGames();assert.equal(el('notificationCount').hidden,true);
        fillGameNoticeFields({noticePreferences:{banner:false}});
        assert.equal(readGameNoticeChanges(),null);
    });
});
