import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('visible Games estimates follow the saved forecast without queries or draft changes', async t => {
    const { dom, state, close } = createDomHarness();
    const games = await import('../js/ui/gameUI.js');
    t.after(() => { games.stopStaminaEstimateTimer(); close(); });
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Estimate tests stay offline'); });
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T12:00:00Z') });
    const timers = new Map(); let nextTimer = 0; let hidden = false;
    t.mock.method(window, 'setInterval', (callback, delay) => {
        assert.equal(delay, 60_000); timers.set(++nextTimer, callback); return nextTimer;
    });
    t.mock.method(window, 'clearInterval', id => timers.delete(id));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const { selectProfile } = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const tick = () => [...timers.values()].forEach(callback => callback());
    const visibility = value => { hidden = value; document.dispatchEvent(new dom.window.Event('visibilitychange')); };
    const now = instant => t.mock.timers.setTime(new Date(instant).getTime());
    const page = document.querySelector('[data-page="games"]');
    page.style.display = 'block';
    state.games = [
        { id: 1, description: 'Six minutes', abbreviation: 'HSR', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 180, pending_tasks: 'Saved notes', max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-12T18:00:00Z' },
        { id: 2, description: 'Eight minutes', abbreviation: 'GI', cap_stamina: 240, stamina_per_minute: 8,
            current_stamina: 180, max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-12T20:00:00Z' },
        { id: 3, description: 'No forecast', abbreviation: 'NEW', cap_stamina: 240, stamina_per_minute: 6, current_stamina: 0 },
    ];
    await games.displayAllGames();

    await t.test('minute ticks preserve exact drafts, selection and the focused node', () => {
        const field = el('pendingTask1'); field.value = 'Unsaved text'; field.focus(); field.setSelectionRange(2, 5);
        el('currentStamina1').value = '';
        const stored = structuredClone(state.games); let reads = 0;
        state.beforeQuery = () => { reads++; };
        now('2026-10-12T12:06:00Z'); tick();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 181/240');
        assert.equal(el('estimatedStamina2').textContent, 'Resina estimada: 180/240');
        now('2026-10-12T12:08:00Z'); tick();
        assert.equal(el('estimatedStamina2').textContent, 'Resina estimada: 181/240');
        assert.match(el('estimatedStamina3').textContent, /indisponível/);
        assert.equal(el('currentStamina1').value, '');
        assert.equal(field.value, 'Unsaved text'); assert.equal(document.activeElement, field);
        assert.deepEqual([field.selectionStart, field.selectionEnd], [2, 5]);
        assert.deepEqual(state.games, stored); assert.equal(reads, 0); assert.equal(state.writes.length, 0);
    });

    await t.test('hidden tabs stop ticks and returning uses wall time including the cap', () => {
        visibility(true); assert.equal(timers.size, 0);
        now('2026-10-12T13:00:00Z');
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 181/240');
        visibility(false); assert.equal(timers.size, 1);
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 190/240');
        assert.equal(el('estimatedStamina2').textContent, 'Resina estimada: 187/240');
        now('2026-10-13T12:00:00Z'); tick();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 240/240');
        assert.equal(el('estimatedStamina2').textContent, 'Resina estimada: 240/240');
        assert.match(el('newMaxStaminaAt1').textContent, /\(-18h left\)/);
    });

    await t.test('reloads keep one timer; Save replaces the forecast used by later ticks', async () => {
        now('2026-10-12T12:00:00Z'); await games.displayAllGames(); await games.displayAllGames();
        assert.equal(timers.size, 1);
        el('currentStamina1').value = '200'; el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(timers.size, 1);
        const writes = state.writes.length;
        now('2026-10-12T12:06:00Z'); tick();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 201/240');
        assert.equal(el('currentStamina1').value, '200'); assert.equal(state.writes.length, writes);
    });

    await t.test('stale profile cannot update; Router stops the timer on leaving Games', async () => {
        const before = el('estimatedStamina1').textContent;
        selectProfile('demo'); now('2026-10-12T13:00:00Z'); tick();
        assert.equal(el('estimatedStamina1').textContent, before);
        selectProfile('cran');
        const { default: Router } = await import('../js/utils/router.js');
        await Router.navigateTo('/tasks'); assert.equal(timers.size, 0);
        visibility(true); visibility(false); assert.equal(timers.size, 0);
        await Router.navigateTo('/'); assert.equal(timers.size, 1);
        state.games = []; await games.displayAllGames(); assert.equal(timers.size, 0);
    });
});
