import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('stamina estimates use saved forecasts and refresh only the selected row', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Stamina tests stay offline'); });
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T12:00:00Z') });
    const games = await import('../js/ui/gameUI.js');
    const el = id => document.getElementById(id);
    state.games = [
        { id: 1, description: 'First game', abbreviation: 'ONE', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 180, pending_tasks: 'Saved notes', max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-06T18:00:00Z' },
        { id: 2, description: 'Second game', abbreviation: 'TWO', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 180, max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-06T18:00:00Z' },
        { id: 3, description: 'New game', abbreviation: 'NEW', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 0, max_stamina_at: '', date_max_stamina: '2026-10-01T12:00:00Z' },
        { id: 4, description: 'Missing deadline', abbreviation: 'MISSING', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 0, max_stamina_at: 'Old label', date_max_stamina: null },
    ];

    await t.test('initial load estimates saved games without inventing a forecast for new games', async () => {
        assert.equal(await games.displayAllGames(), true);
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada agora: 180/240');
        assert.match(el('estimatedStamina3').textContent, /indisponível/);
        assert.equal(el('newMaxStaminaAt3').textContent, 'Sem previsão válida.');
        assert.match(el('estimatedStamina4').textContent, /indisponível/);
        assert.equal(el('refresh-stamina-1').getAttribute('aria-label'), 'Atualizar estimativa de resina de First game');
        assert.equal(state.writes.length, 0);
    });

    await t.test('refresh advances one estimate without queries, writes or replacing drafts', () => {
        const stored = structuredClone(state.games);
        const secondRow = el('refresh-stamina-2').closest('tr').innerHTML;
        const previousTime = el('staminaEstimateTime1').textContent;
        el('currentStamina1').value = '77';
        el('pendingTask1').value = 'Unsaved draft';
        state.beforeQuery = () => { throw new Error('Visual refresh must not query Supabase'); };
        t.mock.timers.setTime(new Date('2026-10-06T12:06:00Z').getTime());
        el('refresh-stamina-1').click();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada agora: 181/240');
        assert.notEqual(el('staminaEstimateTime1').textContent, previousTime);
        assert.equal(el('refresh-stamina-2').closest('tr').innerHTML, secondRow);
        assert.equal(el('currentStamina1').value, '77');
        assert.equal(el('pendingTask1').value, 'Unsaved draft');
        assert.deepEqual(state.games, stored);
        assert.equal(state.writes.length, 0);
        state.beforeQuery = null;
    });

    await t.test('saving real stamina establishes the new forecast and reloading preserves it', async () => {
        el('currentStamina1').value = '200';
        el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(state.games[0].current_stamina, 200);
        assert.equal(state.games[0].pending_tasks, 'Unsaved draft');
        assert.equal(state.games[0].date_max_stamina, '2026-10-06T16:06:00.000Z');
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada agora: 200/240');
        t.mock.timers.setTime(new Date('2026-10-06T12:12:00Z').getTime());
        await games.displayAllGames();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada agora: 201/240');
        assert.equal(el('currentStamina1').value, '200');
        assert.equal(state.writes.length, 1);
    });

    await t.test('refresh at or after the deadline remains capped', () => {
        t.mock.timers.setTime(new Date('2026-10-07T12:00:00Z').getTime());
        el('refresh-stamina-1').click();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada agora: 240/240');
        assert.equal(el('currentStamina1').value, '200');
        assert.equal(state.writes.length, 1);
    });
});
