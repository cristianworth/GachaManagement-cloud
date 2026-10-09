import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Batch picker uses enabled offers, stable identities and one actor/transaction',async t=>{
    const {dom,state,close}=createDomHarness();t.after(close);
    t.mock.method(console,'log',()=>{});t.mock.method(console,'error',()=>{});
    t.mock.method(globalThis,'fetch',()=>{throw Error('Offline UI tests');});
    const ui=await import('../js/ui/taskUI.js');const {selectProfile}=await import('../js/services/profileSession.js');
    const el=id=>document.getElementById(id);
    const calls=name=>state.rpcCalls.filter(c=>c.name===name);
    const settled=()=>waitFor(()=>el('loadingOverlay').hidden);
    const boxes=()=>[...el('taskBatchGroups').querySelectorAll('input')];
    const submit=()=>el('taskBatchSelectionForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    const changeAll=checked=>{el('taskBatchSelectAll').checked=checked;el('taskBatchSelectAll').dispatchEvent(new dom.window.Event('change'));};
    const sample=[
        {abbreviation:'HSR',game_description:'Star Rail',definition_key:'echo-of-war',calendar_key:'',description:'Echo of War',state:'never'},
        {abbreviation:'HSR',game_description:'Star Rail',definition_key:'simulated-universe',calendar_key:'',description:'Simulated Universe',state:'deferred'},
        {abbreviation:'GI',game_description:'Genshin',definition_key:'spiral-abyss',calendar_key:'',description:'Spiral Abyss',state:'never'},
        {abbreviation:'GI',game_description:'Genshin',definition_key:'imaginarium-theater',calendar_key:'',description:'Imaginarium Theater',state:'excluded'},
        {abbreviation:'WuWa',game_description:'Wuthering Waves',definition_key:'endstate-matrix',calendar_key:'3.7',description:'Endstate Matrix',state:'unavailable'},
    ];
    state.games=[{id:11,abbreviation:'GI',description:'Genshin'},{id:42,abbreviation:'HSR',description:'Star Rail'},{id:88,abbreviation:'WuWa',description:'Wuthering Waves'}];
    state.rpcResults.list_profile_task_batch=sample;
    await ui.displayAllTasks();
    const open=async()=>{el('chooseTaskBatchBtn').click();await waitFor(()=>el('taskBatchDialog').open);};
    await t.test('Opening twice reads once; groups ignore the visual filter and cancel never writes',async()=>{
        el('taskGameFilter').value='11';el('taskGameFilter').dispatchEvent(new dom.window.Event('change'));
        let release;const gate=new Promise(r=>{release=r;});state.beforeQuery=({name})=>name==='list_profile_task_batch'?gate:undefined;
        el('chooseTaskBatchBtn').click();el('chooseTaskBatchBtn').click();release();await waitFor(()=>el('taskBatchDialog').open);
        assert.equal(calls('list_profile_task_batch').length,1);assert.deepEqual(calls('list_profile_task_batch')[0].payload,{p_profile_id:'cran'});
        assert.deepEqual([...el('taskBatchGroups').querySelectorAll('legend')].map(x=>x.textContent),['Star Rail','Genshin','Wuthering Waves']);
        assert.deepEqual(boxes().map(x=>[x.checked,x.disabled]),[[true,false],[true,false],[true,false],[false,true],[false,true]]);
        assert.equal(document.activeElement,el('taskBatchSelectAll'));
        assert.match(el('taskBatchGroups').textContent,/Excluído.*Calendário/s);
        el('taskBatchCancel').click();assert.equal(el('taskBatchDialog').open,false);assert.equal(document.activeElement,el('chooseTaskBatchBtn'));
        assert.equal(calls('choose_profile_task_batch').length,0);assert.equal(el('taskGameFilter').value,'11');assert.equal(document.activeElement,el('chooseTaskBatchBtn'));state.beforeQuery=null;
    });
    await t.test('Select all reflects partial choice; empty selection sends [] and reports postponement',async()=>{
        await open();boxes()[0].checked=false;boxes()[0].dispatchEvent(new dom.window.Event('change'));
        assert.equal(el('taskBatchSelectAll').indeterminate,true);changeAll(false);
        assert.match(el('taskBatchSummary').textContent,/0 escolhido.*3 ficará/);
        state.rpcResults.choose_profile_task_batch={created:0,preserved:0,registered:0};submit();await settled();
        assert.deepEqual(calls('choose_profile_task_batch').at(-1).payload,{p_profile_id:'cran',p_items:[]});
        assert.equal(el('taskBatchDialog').open,false);assert.match(el('taskListMessage').textContent,/3 item.*adiado/);
    });
    await t.test('Failure retains selection; retry blocks double submit and Escape during write',async()=>{
        await open();changeAll(false);boxes()[0].checked=true;
        state.rpcErrors.choose_profile_task_batch='Selected batch failed';submit();await settled();
        assert.equal(el('taskBatchDialog').open,true);assert.equal(boxes()[0].checked,true);assert.equal(boxes()[1].checked,false);
        assert.match(el('taskBatchMessage').textContent,/seleção foi mantida/);
        delete state.rpcErrors.choose_profile_task_batch;
        let release;const gate=new Promise(r=>{release=r;});state.beforeQuery=({name})=>name==='choose_profile_task_batch'?gate:undefined;
        const before=calls('choose_profile_task_batch').length;submit();submit();
        const escape=new dom.window.Event('cancel',{cancelable:true});el('taskBatchDialog').dispatchEvent(escape);
        assert.equal(escape.defaultPrevented,true);assert.equal(el('taskBatchSubmit').disabled,true);
        release();await settled();assert.equal(calls('choose_profile_task_batch').length,before+1);
        assert.deepEqual(calls('choose_profile_task_batch').at(-1).payload,{p_profile_id:'cran',p_items:[{abbreviation:'HSR',definition_key:'echo-of-war',calendar_key:''}]});
        assert.equal(el('taskGameFilter').value,'11');state.beforeQuery=null;
    });
    await t.test('Profile change before submission invalidates the open selection',async()=>{
        await open();selectProfile('demo');const before=calls('choose_profile_task_batch').length;submit();
        assert.equal(calls('choose_profile_task_batch').length,before);assert.match(el('taskBatchMessage').textContent,/perfil mudou/);
        el('taskBatchCancel').click();selectProfile('cran');
    });
    await t.test('Profile change during reading does not open a modal for a different actor',async()=>{
        let release;const gate=new Promise(r=>{release=r;});state.beforeQuery=({name})=>name==='list_profile_task_batch'?gate:undefined;
        el('chooseTaskBatchBtn').click();selectProfile('demo');release();await waitFor(()=>!el('chooseTaskBatchBtn').disabled);
        assert.equal(el('taskBatchDialog').open,false);assert.deepEqual(calls('list_profile_task_batch').at(-1).payload,{p_profile_id:'cran'});
        assert.match(el('taskListMessage').textContent,/Não foi possível abrir/);selectProfile('cran');state.beforeQuery=null;
    });
    await t.test('Profile change during a write keeps the captured actor and never refreshes another profile',async()=>{
        await open();let release;const gate=new Promise(r=>{release=r;});state.beforeQuery=({name})=>name==='choose_profile_task_batch'?gate:undefined;
        submit();const count=state.rpcCalls.length;selectProfile('demo');release();await settled();
        assert.equal(calls('choose_profile_task_batch').at(-1).payload.p_profile_id,'cran');assert.equal(state.rpcCalls.length,count);
        el('taskBatchCancel').click();selectProfile('cran');state.beforeQuery=null;
    });
    await t.test('Saved selection closes even if list refresh fails; retry only reads',async()=>{
        await open();state.rpcResults.choose_profile_task_batch={created:2,preserved:0,registered:2};
        state.beforeQuery=({name})=>{if(name==='choose_profile_task_batch')state.readError='Failed refresh';};
        submit();await settled();assert.equal(el('taskBatchDialog').open,false);assert.match(el('taskListMessage').textContent,/Lote registrado.*não foi possível atualizar/);
        const before=calls('choose_profile_task_batch').length;state.beforeQuery=null;state.readError=null;el('taskListRetry').click();await settled();
        assert.equal(calls('choose_profile_task_batch').length,before);
    });
    await t.test('Read failure can retry and an entirely protected inventory disables submission',async()=>{
        state.rpcErrors.list_profile_task_batch='Failed read';el('chooseTaskBatchBtn').click();await waitFor(()=>!el('chooseTaskBatchBtn').disabled);
        assert.equal(el('taskBatchDialog').open,false);delete state.rpcErrors.list_profile_task_batch;
        state.rpcResults.list_profile_task_batch=sample.map(i=>({...i,state:'legacy'}));await open();
        assert.equal(el('taskBatchSubmit').disabled,true);assert.equal(el('taskBatchSelectAll').disabled,true);el('taskBatchCancel').click();
    });
    await t.test('Eight real covers render through the mapper and use lazy/error fallbacks without writes', async () => {
        const covers = JSON.parse(await readFile(new URL('../docs/task-batch-covers.json', import.meta.url), 'utf8'));
        state.tasks = covers.map((cover, index) => ({ id: 100 + index, game_id: 11, game_description: cover.abbreviation,
            description: cover.definition_key, refresh_type: 0, cover_url: cover.cover_url }));
        const writes = state.writes.length;
        await ui.displayAllTasks();
        const images = [...document.querySelectorAll('.task-cover')];
        assert.equal(images.length, 8);
        for (const cover of covers) {
            const image = images.find(img => img.src === cover.cover_url);
            assert.ok(image);
            assert.equal(image.loading, 'lazy');
            assert.equal(image.referrerPolicy, 'no-referrer');
        }
        images[0].dispatchEvent(new dom.window.Event('error'));
        assert.match(images[0].src, /event-placeholder.svg$/);
        assert.equal(state.writes.length, writes);
    });

});
