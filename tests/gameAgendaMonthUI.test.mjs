import test from 'node:test';
import assert from 'node:assert/strict';
import {createDomHarness,waitFor} from './helpers/domHarness.mjs';
import {mockBannerFiles} from './helpers/bannerFiles.mjs';

test('month shares profile filters and groups phase milestones by Brasília day', async t=>{
    const {dom, state, close} = createDomHarness();
    t.after(close);
    const files = mockBannerFiles(t);
    t.mock.timers.enable({apis:['Date'], now:Date.parse('2026-11-12T01:30:00Z')});
    const {displayGameAgenda} = await import('../js/ui/gameAgenda.js');
    const {selectProfile} = await import('../js/services/profileSession.js');
    const el = id=>document.getElementById(id);
    const days = ()=>[...el('agendaMonthDays').children];
    const selected = ()=>days().find(day=>day.getAttribute('aria-pressed') === 'true');
    const milestones = ()=>[...el('agendaDayEntries').children];
    const times = ()=>milestones().map(row=>row.querySelector('p').textContent);
    const change = id=>el(id).dispatchEvent(new dom.window.Event('change'));
    files.files['gi.json'] = [{
        ...files.files['gi.json'].find(phase=>phase.phase === 1), starts_at:'2026-11-11T16:00:00Z', ends_at:'2027-01-01T02:30:00Z',
        characters:[{name:'Personagem sem arte'}],
    }];
    state.games = [{id:1, abbreviation:'GI'}, {id:2, abbreviation:'ZZZ'}];

    await displayGameAgenda();
    assert.equal(el('agendaMonth').hidden, false);
    assert.equal(el('agendaList').hidden, true);
    assert.equal(el('agendaMonthView').getAttribute('aria-pressed'), 'true');
    assert.equal(el('agendaListView').getAttribute('aria-pressed'), 'false');
    assert.equal(el('agendaMonthView').nextElementSibling, el('agendaListView'));
    const scroll = t.mock.method(window, 'scrollBy', ()=>{});
    let reduceMotion = false;
    window.matchMedia = ()=>({matches:reduceMotion});
    let detailsBottom = window.innerHeight + 100;
    let toolbarTop = 250;
    t.mock.method(window.Element.prototype, 'getBoundingClientRect', function () {
        if (this.classList.contains('agenda-toolbar')) return {top:toolbarTop};
        if (this.id === 'agendaDayTitle') return {top:detailsBottom - 200};
        return {bottom:detailsBottom};
    });
    const reads = files.requests.length;
    let profileReads = 0;
    state.beforeQuery = ()=>{ profileReads++; };
    assert.equal(selected(), days()[10]);
    assert.equal(selected().getAttribute('aria-current'), 'date');
    assert.deepEqual(times(), ['Início da 1ª fase · 13:00', 'Início da 2ª fase · 14:00']);
    assert.equal(milestones()[0].querySelector('img'), null);
    assert.equal(milestones()[0].querySelector('figcaption').textContent, 'Personagem sem arte');
    assert.equal(milestones()[1].querySelector('img'), null);

    el('agendaShowEnded').checked = true;
    change('agendaShowEnded');
    assert.equal(selected().querySelector('.agenda-day-extra').textContent, '+1');
    assert.ok(milestones()[1].querySelector('img'));
    assert.deepEqual(times(), ['Início da 1ª fase · 13:00', 'Fim da 1ª fase · 13:59', 'Início da 2ª fase · 14:00']);
    selected().focus();
    selected().click();
    assert.deepEqual(scroll.mock.calls.map(call=>call.arguments[0]), [{top:250, behavior:'smooth'}]);
    assert.equal(document.activeElement, selected());
    toolbarTop = -20;
    reduceMotion = true;
    selected().click();
    assert.deepEqual(scroll.mock.calls[1].arguments[0], {top:100, behavior:'instant'});
    detailsBottom = window.innerHeight - 50;
    selected().click();
    selected().dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true, cancelable:true}));
    assert.equal(document.activeElement, days()[11]);
    assert.equal(selected(), days()[10]);
    document.activeElement.click();
    assert.equal(selected(), days()[11]);
    assert.equal(el('agendaDayEmpty').hidden, false);
    assert.equal(scroll.mock.callCount(), 2, 'Visible details, arrow movement and empty days do not scroll');
    el('agendaListView').click();
    el('agendaMonthView').click();
    assert.equal(selected(), days()[11]);

    el('agendaNextMonth').click();
    assert.equal(el('agendaDayTitle').textContent, '1 de dezembro');
    days()[30].click();
    assert.deepEqual(times(), ['Fim da 1ª fase · 23:30']);
    el('agendaNextMonth').click();
    assert.equal(el('agendaMonthTitle').textContent, 'janeiro de 2027');
    assert.equal(el('agendaDayEmpty').hidden, false);
    el('agendaPreviousMonth').click();
    assert.equal(el('agendaDayTitle').textContent, '1 de dezembro');
    el('agendaToday').click();
    el('agendaGameFilter').value = 'ZZZ';
    change('agendaGameFilter');
    assert.deepEqual(times(), ['Fim da 1ª fase · 13:59', 'Início da 2ª fase · 14:00']);
    assert.equal(files.requests.length, reads);
    assert.equal(profileReads, 0);
    state.beforeQuery = null;

    files.error = 'Offline';
    el('agendaRefresh').click();
    await waitFor(()=>!el('agendaRefresh').disabled);
    assert.deepEqual(times(), ['Fim da 1ª fase · 13:59', 'Início da 2ª fase · 14:00']);
    assert.match(el('agendaStatus').textContent, /dados anteriores/);
    selectProfile('demo');
    state.games = [{id:1, abbreviation:'GI'}];
    const pending = displayGameAgenda();
    assert.deepEqual(times(), [], 'Previous profile data clears before the new games load');
    await pending;
    assert.deepEqual(times(), ['Início da 1ª fase · 13:00']);
    assert.equal(el('agendaGameFilter').value, '');
    assert.deepEqual(state.writes, []);
});
