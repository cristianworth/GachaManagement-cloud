import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Selection replaces existing and excluded items through the same batch submission', async t => {
    const {dom, state, close} = createDomHarness(); t.after(close);
    t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline batch UI tests'); });
    let approved = true; const confirmations = [];
    const {default: Swal} = await import('../js/vendor/sweetalert2/sweetalert2.esm.min.js');
    t.mock.method(Swal, 'fire', options => { confirmations.push(options.titleText + '\n' + options.text); return Promise.resolve({isConfirmed:approved}); });
    const ui = await import('../js/ui/taskUI.js');
    const {selectProfile} = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const boxes = () => [...el('taskBatchGroups').querySelectorAll('input')];
    const calls = () => state.rpcCalls.filter(c => c.name === 'choose_profile_task_batch');
    const submit = () => el('taskBatchSelectionForm').dispatchEvent(new dom.window.Event('submit', {cancelable:true}));
    const settled = () => waitFor(() => el('loadingOverlay').hidden && !el('taskBatchCancel').disabled);
    const changeAll = checked => { el('taskBatchSelectAll').checked = checked; el('taskBatchSelectAll').dispatchEvent(new dom.window.Event('change')); };
    const offers = [
        {abbreviation:'HSR', definition_key:'echo-of-war', calendar_key:'', game_description:'Star Rail', description:'Echo of War',
            state:'created', task_id:40, task_version:'echo-v1', can_replace:true},
        {abbreviation:'HSR', definition_key:'simulated-universe', calendar_key:'', game_description:'Star Rail', description:'Simulated Universe',
            state:'excluded', task_id:41, task_version:'su-v1', can_replace:true},
        {abbreviation:'GI', definition_key:'spiral-abyss', calendar_key:'', game_description:'Genshin', description:'Spiral Abyss', state:'never'},
        {abbreviation:'GI', definition_key:'imaginarium-theater', calendar_key:'', game_description:'Genshin', description:'Imaginarium Theater', state:'deferred'},
        {abbreviation:'WuWa', definition_key:'weekly-boss', calendar_key:'', game_description:'Wuthering Waves', description:'Weekly Boss',
            state:'legacy', task_id:42, task_version:'weekly-v1', can_replace:true},
        {abbreviation:'ZZZ', definition_key:'hollow-zero', calendar_key:'', game_description:'Zenless', description:'Hollow Zero',
            state:'preserved', task_id:43, can_replace:false},
        {abbreviation:'WuWa', definition_key:'endstate-matrix', calendar_key:'3.7', game_description:'Wuthering Waves', description:'Endstate Matrix',
            state:'excluded', task_id:44, can_replace:false},
    ];
    state.rpcResults.list_profile_task_batch = offers;
    state.rpcResults.choose_profile_task_batch = {created:2, replaced:2, preserved:0, registered:2};
    state.games = [{id:1, abbreviation:'HSR', description:'Star Rail'}, {id:2, abbreviation:'GI', description:'Genshin'}];
    await ui.displayAllTasks();
    const open = async () => { el('chooseTaskBatchBtn').click(); await waitFor(() => el('taskBatchDialog').open); };
    await t.test('New items alone are checked; existing/excluded stay identifiable and have no extra row actions', async () => {
        await open();
        assert.deepEqual(boxes().map(x => [x.checked,x.disabled]), [[false,false],[false,false],[true,false],[true,false],[false,false],[false,true],[false,true]]);
        assert.equal(el('taskBatchGroups').querySelectorAll('button,a').length, 0);
        assert.match(el('taskBatchGroups').textContent, /Já criado.*Excluído.*Já criado — lote anterior/s);
        assert.match(el('taskBatchSummary').textContent, /2 escolhido.*0 será.*0 ficará/);
        assert.equal(el('taskBatchSelectAll').indeterminate, true);
        el('taskBatchCancel').click(); assert.equal(calls().length, 0);
    });
    await t.test('Selecting all includes replacements, reports only uncreated deferrals and warns before any write', async () => {
        await open(); changeAll(true);
        assert.equal(boxes().filter(x => x.checked).length, 5);
        assert.match(el('taskBatchSummary').textContent, /5 escolhido.*3 será.*0 ficará/);
        approved = false; const before = calls().length; submit();
        assert.equal(calls().length, before); assert.equal(el('taskBatchDialog').open, true);
        assert.match(confirmations.at(-1), /3 itens.*do zero.*conclusão.*favoritos/s);
        assert.equal(boxes()[0].checked, true); await settled(); approved = true; el('taskBatchCancel').click();
    });
    await t.test('An open async confirmation blocks duplicate submission and cancels without a write', async () => {
        await open(); changeAll(false); boxes()[0].checked = true;
        let release; const gate = new Promise(resolve => { release = resolve; });
        const mock = t.mock.method(Swal, 'fire', () => gate);
        const before = calls().length; submit(); submit();
        assert.equal(mock.mock.callCount(), 1); assert.equal(calls().length, before);
        assert.equal(el('taskBatchCancel').disabled, true);
        const escape = new dom.window.Event('cancel', {cancelable:true}); el('taskBatchDialog').dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        release({isConfirmed:false}); await settled();
        assert.equal(calls().length, before); assert.equal(boxes()[0].checked, true);
        assert.equal(el('taskBatchDialog').open, true); assert.equal(document.activeElement, el('taskBatchSubmit'));
        mock.mock.restore(); el('taskBatchCancel').click();
    });
    await t.test('A popup failure preserves selection, releases controls and never sends a replacement', async () => {
        await open(); changeAll(false); boxes()[0].checked = true;
        const mock = t.mock.method(Swal, 'fire', () => { throw new Error('Popup unavailable'); });
        const before = calls().length; submit(); await settled();
        assert.equal(calls().length, before); assert.equal(boxes()[0].checked, true);
        assert.match(el('taskBatchMessage').textContent, /seleção foi mantida/);
        assert.equal(el('taskBatchDialog').open, true);
        mock.mock.restore(); el('taskBatchCancel').click();
    });
    await t.test('Existing and excluded selections share one request; failures preserve selection and reuse the request ID', async () => {
        await open(); changeAll(false); boxes()[0].checked = true; boxes()[1].checked = true;
        state.rpcErrors.choose_profile_task_batch = 'Lost response'; submit(); await settled();
        assert.equal(el('taskBatchDialog').open, true); assert.equal(boxes()[0].checked, true); assert.equal(boxes()[1].checked, true);
        const first = calls().at(-1).payload;
        assert.deepEqual(first.p_items, [
            {abbreviation:'HSR', definition_key:'echo-of-war', calendar_key:'', expected_task_id:40, expected_version:'echo-v1'},
            {abbreviation:'HSR', definition_key:'simulated-universe', calendar_key:'', expected_task_id:41, expected_version:'su-v1'},
        ]);
        assert.equal(first.p_profile_id, 'cran'); assert.match(first.p_request_id, /^[0-9a-f-]{36}$/);
        delete state.rpcErrors.choose_profile_task_batch;
        let release; const gate = new Promise(r => { release = r; });
        state.beforeQuery = ({name}) => name === 'choose_profile_task_batch' ? gate : undefined;
        const before = calls().length; submit(); submit();
        const escape = new dom.window.Event('cancel', {cancelable:true}); el('taskBatchDialog').dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true); assert.equal(el('taskBatchCancel').disabled, true);
        release(); await settled();
        assert.equal(calls().length, before + 1); assert.deepEqual(calls().at(-1).payload, first);
        assert.equal(el('taskBatchDialog').open, false); assert.match(el('taskListMessage').textContent, /2 item.*recriado.*2 item.*adiado/);
        state.beforeQuery = null;
    });
    await t.test('Changing the selection after failure uses a different request, while a new-only load needs no confirmation', async () => {
        await open(); changeAll(false); boxes()[0].checked = true;
        state.rpcErrors.choose_profile_task_batch = 'Failed load'; submit(); await settled();
        const first = calls().at(-1).payload.p_request_id;
        boxes()[0].checked = false; boxes()[2].checked = true;
        const count = confirmations.length; delete state.rpcErrors.choose_profile_task_batch;
        state.rpcResults.choose_profile_task_batch = {created:1, replaced:0, preserved:0, registered:1};
        submit(); await settled();
        assert.notEqual(calls().at(-1).payload.p_request_id, first); assert.equal(confirmations.length, count);
        assert.deepEqual(calls().at(-1).payload.p_items, [{abbreviation:'GI', definition_key:'spiral-abyss', calendar_key:''}]);
    });
    await t.test('Changing the profile during confirmation aborts before saving', async () => {
        await open(); changeAll(false); boxes()[0].checked = true;
        const before = calls().length;
        const mock = t.mock.method(Swal, 'fire', () => { selectProfile('demo'); return Promise.resolve({isConfirmed:true}); });
        submit(); await settled(); assert.equal(calls().length, before); assert.match(el('taskBatchMessage').textContent, /perfil mudou/);
        mock.mock.restore(); el('taskBatchCancel').click(); selectProfile('cran');
    });
    await t.test('A profile change during saving keeps the captured actor and skips another profile refresh', async () => {
        await open(); changeAll(false); boxes()[0].checked = true;
        let release; const gate = new Promise(r => { release = r; });
        state.beforeQuery = ({name}) => name === 'choose_profile_task_batch' ? gate : undefined;
        const before = calls().length; submit(); await waitFor(() => calls().length > before);
        const count = state.rpcCalls.length; selectProfile('demo'); release(); await settled();
        assert.equal(calls().at(-1).payload.p_profile_id, 'cran'); assert.equal(state.rpcCalls.length, count);
        assert.equal(el('taskBatchDialog').open, false); state.beforeQuery = null; selectProfile('cran');
    });
    await t.test('Saving followed by a failed refresh closes the dialog and offers read retry, never another replacement', async () => {
        await open(); changeAll(false); boxes()[1].checked = true;
        state.beforeQuery = ({name}) => { if (name === 'choose_profile_task_batch') state.readError = 'Refresh failed'; };
        submit(); await settled();
        assert.equal(el('taskBatchDialog').open, false); assert.match(el('taskListMessage').textContent, /Lote registrado.*não foi possível atualizar/);
        const before = calls().length; state.beforeQuery = null; state.readError = null; el('taskListRetry').click(); await settled();
        assert.equal(calls().length, before);
    });
});
