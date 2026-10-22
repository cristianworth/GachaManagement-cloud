import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Games daily state follows explicit choices and successful resin saves without losing drafts', async t => {
    const {dom,state,close}=createDomHarness();
    const games=await import('../js/ui/gameUI.js');
    const {selectProfile}=await import('../js/services/profileSession.js');
    const {getClient}=await import('../js/database/supabaseClient.js');
    t.after(()=>{games.stopStaminaEstimateTimer();close();});
    t.mock.method(console,'log',()=>{}); t.mock.method(console,'error',()=>{});
    t.mock.method(globalThis,'fetch',()=>{throw new Error('Daily state tests stay offline');});
    const start=Date.parse('2026-10-22T12:00:00Z');
    t.mock.timers.enable({apis:['Date'],now:start});
    const timers=new Map();let timerId=0;let hidden=false;
    t.mock.method(window,'setInterval',callback=>{timers.set(++timerId,callback);return timerId;});
    t.mock.method(window,'clearInterval',id=>timers.delete(id));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    const el=id=>document.getElementById(id);
    const fixtures=[
        {id:1,description:'Genshin Impact',abbreviation:'GI',cap_stamina:200,stamina_per_minute:8,current_stamina:80,pending_tasks:'Saved notes'},
        {id:2,description:'Neverness to Everness',abbreviation:'NTE',cap_stamina:320,stamina_per_minute:6,current_stamina:100},
        {id:3,description:'Custom game',abbreviation:'CUSTOM'},
    ];
    const seed=async()=>{
        selectProfile('cran');hidden=false;t.mock.timers.setTime(start);
        state.games=structuredClone(fixtures);state.writes=[];state.error=null;state.beforeQuery=null;
        document.querySelector('[data-page="games"]').style.display='block';
        await games.displayAllGames();
    };
    const change=(id,value)=>{el(`daily-state-${id}`).value=value;el(`daily-state-${id}`).dispatchEvent(new dom.window.Event('change'));};
    const settled=()=>waitFor(()=>el('loadingOverlay').hidden);

    await t.test('initial states are pending and custom games use the selected default reset',async()=>{
        await seed();assert.equal(el('daily-state-1').value,'pending');
        assert.equal(el('daily-state-3').disabled,false);assert.equal(el('daily-state-3').value,'pending');
        assert.equal(state.writes.length,0);
    });
    await t.test('changing state saves only that choice and preserves exact draft nodes and cursor',async()=>{
        await seed();const notes=el('pendingTask1');notes.value='Draft notes';notes.focus();notes.setSelectionRange(2,6);
        el('currentStamina1').value='';change(1,'return_later');await settled();
        assert.equal(el('pendingTask1'),notes);assert.equal(notes.value,'Draft notes');assert.equal(el('currentStamina1').value,'');
        assert.deepEqual([notes.selectionStart,notes.selectionEnd],[2,6]);
        assert.equal(state.games[0].current_stamina,80);assert.equal(state.games[0].pending_tasks,'Saved notes');
        assert.deepEqual(state.writes[0].payload,{abbreviation:'GI',daily_state:{state:'return_later',cycle_start:'2026-10-22T09:00:00.000Z'}});
        assert.equal(el('daily-state-1').closest('tr').dataset.dailyState,'return_later');
        assert.equal(el('daily-state-2').value,'pending');
        await games.displayAllGames({preserveDrafts:true});assert.equal(el('daily-state-1').value,'return_later');
    });
    await t.test('failed writes restore the prior mark and allow retry',async()=>{
        await seed();state.error='Unavailable';change(1,'done');await settled();
        assert.equal(el('daily-state-1').value,'pending');assert.equal(el('daily-state-1').disabled,false);
        assert.match(el('gameListMessage').textContent,/Não foi possível salvar o estado diário/);
        state.error=null;change(1,'done');await settled();assert.equal(el('daily-state-1').value,'done');
    });
    await t.test('a pending save blocks duplicate changes and stamina Save for that row',async()=>{
        await seed();let release;let requested=false;
        const gate=new Promise(resolve=>{release=resolve;});
        state.beforeQuery=async request=>{if(request.operation==='update'){requested=true;await gate;}};
        change(1,'return_later');await waitFor(()=>requested);
        assert.equal(el('daily-state-1').disabled,true);assert.equal(el('save-game-1').disabled,true);
        change(1,'done');release();await settled();
        assert.equal(state.writes.length,1);assert.equal(el('daily-state-1').value,'return_later');
    });
    await t.test('minute and visibility updates derive each reset without writes or draft loss',async()=>{
        await seed();change(1,'done');await settled();change(2,'return_later');await settled();
        const notes=el('pendingTask1');notes.value='Keep this draft';notes.focus();
        const writes=state.writes.length;
        t.mock.timers.setTime(Date.parse('2026-10-23T09:00:00Z'));
        for(const callback of timers.values())callback();
        assert.equal(el('daily-state-1').value,'pending');assert.equal(el('daily-state-2').value,'return_later');
        assert.equal(el('pendingTask1'),notes);assert.equal(document.activeElement,notes);
        hidden=true;document.dispatchEvent(new dom.window.Event('visibilitychange'));
        t.mock.timers.setTime(Date.parse('2026-10-23T10:00:00Z'));
        hidden=false;document.dispatchEvent(new dom.window.Event('visibilitychange'));
        assert.equal(el('daily-state-2').value,'pending');assert.equal(state.writes.length,writes);
        assert.equal(notes.value,'Keep this draft');
    });
    await t.test('a Save spanning reset belongs to the captured cycle; a resin change completes an amber game atomically',async()=>{
        await seed();let release;let requested=false;const gate=new Promise(resolve=>{release=resolve;});
        t.mock.timers.setTime(Date.parse('2026-10-23T08:59:59Z'));
        state.beforeQuery=async request=>{if(request.operation==='update'){requested=true;await gate;}};
        change(1,'done');await waitFor(()=>requested);
        t.mock.timers.setTime(Date.parse('2026-10-23T09:00:00Z'));release();await settled();
        assert.equal(el('daily-state-1').value,'pending');
        state.beforeQuery=null;change(1,'return_later');await settled();
        el('currentStamina1').value='20';el('save-game-1').click();await settled();
        assert.equal(el('daily-state-1').value,'done');
        assert.deepEqual(state.writes.at(-1).payload.daily_state,{state:'done',cycle_start:'2026-10-23T09:00:00.000Z'});
        assert.equal(state.writes.at(-1).payload.current_stamina,20);
    });
    await t.test('notes-only Save preserves state; a changed resin value completes it even when full today',async()=>{
        await seed();change(1,'return_later');await settled();
        el('pendingTask1').value='Notes only';el('save-game-1').click();await settled();
        assert.equal(el('daily-state-1').value,'return_later');
        assert.equal(Object.hasOwn(state.writes.at(-1).payload,'daily_state'),false);
        el('currentStamina1').value='199';el('save-game-1').click();await settled();
        assert.equal(el('daily-state-1').value,'done');
        assert.equal(state.games.find(game=>game.id===1).date_max_stamina,'2026-10-22T12:08:00.000Z');
        change(1,'return_later');await settled();assert.equal(el('daily-state-1').value,'return_later');
    });
    await t.test('failed resin Save cannot change the previous mark or persist half the operation',async()=>{
        await seed();state.error='Write failed';el('currentStamina1').value='20';el('save-game-1').click();await settled();
        assert.equal(el('daily-state-1').value,'pending');assert.equal(state.games[0].current_stamina,80);
        assert.equal(state.games[0].daily_state,undefined);assert.equal(el('currentStamina1').value,'20');
    });
    await t.test('manual reordering retains nodes, drafts and focused text; Save preserves other games drafts',async()=>{
        await seed();const notes=el('pendingTask1');notes.value='Do not lose this';notes.focus();notes.setSelectionRange(3,8);
        change(1,'done');await settled();
        const ids=()=>[...el('gameListBody').children].map(row=>Number(row.dataset.gameId));
        assert.deepEqual(ids(),[2,3,1]);assert.equal(el('pendingTask1'),notes);assert.equal(document.activeElement,notes);
        assert.deepEqual([notes.selectionStart,notes.selectionEnd],[3,8]);
        change(3,'return_later');await settled();assert.deepEqual(ids(),[2,3,1]);
        el('currentStamina2').value='120';el('save-game-2').click();await settled();
        assert.equal(el('pendingTask1').value,'Do not lose this');
        assert.equal(state.games.find(game=>game.id===1).pending_tasks,'Saved notes');
        assert.deepEqual(ids(),[3,2,1]);
    });
    await t.test('a write captures the actor and its late response cannot change the new profile',async()=>{
        await seed();const client=getClient();const rpc=client.rpc.bind(client);let release;let actor;
        const gate=new Promise(resolve=>{release=resolve;});
        const mock=t.mock.method(client,'rpc',async(name,payload)=>{
            if(name==='save_profile_game'){actor=payload.p_profile_id;await gate;}
            return rpc(name,payload);
        });
        change(1,'done');await waitFor(()=>actor);
        selectProfile('demo');state.games=[{...fixtures[1]}];await games.displayAllGames();
        const row=el('daily-state-2').closest('tr');release();await settled();
        assert.equal(actor,'cran');assert.equal(el('daily-state-2').closest('tr'),row);
        assert.equal(el('daily-state-2').value,'pending');assert.doesNotMatch(el('gameListMessage').textContent,/Estado diário salvo/);
        mock.mock.restore();
    });
    await t.test('a resin Save cannot write to a profile selected while its preliminary read was pending',async()=>{
        await seed();let release;let requested=false;const gate=new Promise(resolve=>{release=resolve;});
        state.beforeQuery=async request=>{if(request.operation==='select'){requested=true;await gate;}};
        el('currentStamina1').value='20';el('save-game-1').click();await waitFor(()=>requested);
        selectProfile('demo');state.games=[{...fixtures[0],current_stamina:190,pending_tasks:'Demo notes'}];
        state.beforeQuery=null;await games.displayAllGames();release();await settled();
        assert.equal(state.writes.length,0);assert.equal(el('currentStamina1').value,'190');
        assert.equal(el('pendingTask1').value,'Demo notes');assert.equal(el('daily-state-1').value,'pending');
        assert.equal(el('gameListMessage').textContent,'');
    });
});
