import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('one Games refresh reads saved data and recalculates estimates without losing drafts', async t => {
    const { state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Stamina tests stay offline'); });
    const instant = '2026-10-06T12:00:00Z';
    t.mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
    const games = await import('../js/ui/gameUI.js');
    const { selectProfile } = await import('../js/services/profileSession.js');
    const el = id => document.getElementById(id);
    const fixtures = [
        { id: 1, description: 'First game', abbreviation: 'ONE', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 180, pending_tasks: 'Saved notes', max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-06T18:00:00Z' },
        { id: 2, description: 'Second game', abbreviation: 'TWO', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 180, max_stamina_at: 'Saved forecast', date_max_stamina: '2026-10-06T18:00:00Z' },
        { id: 3, description: 'New game', abbreviation: 'NEW', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 0, max_stamina_at: '', date_max_stamina: '2026-10-01T12:00:00Z' },
        { id: 4, description: 'Missing deadline', abbreviation: 'MISSING', cap_stamina: 240, stamina_per_minute: 6,
            current_stamina: 0, max_stamina_at: 'Old label', date_max_stamina: null },
    ];
    const seed = async () => {
        selectProfile('cran');
        state.games = structuredClone(fixtures);
        state.writes = [];
        state.readError = null;
        state.beforeQuery = null;
        t.mock.timers.setTime(new Date(instant).getTime());
        assert.equal(await games.displayAllGames(), true);
    };
    const refresh = async () => {
        el('refreshGamesBtn').click();
        await waitFor(() => el('loadingOverlay').hidden && !el('refreshGamesBtn').disabled);
    };

    await t.test('initial load has one toolbar action and no per-game refresh buttons', async () => {
        await seed();
        assert.equal(document.querySelectorAll('#refreshGamesBtn').length, 1);
        assert.equal(document.querySelectorAll('[id^="refresh-stamina-"]').length, 0);
        assert.match(el('refreshGamesBtn').textContent, /Atualizar dados/);
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 180/240');
        assert.match(el('estimatedStamina3').textContent, /indisponível/);
        assert.equal(el('newMaxStaminaAt3').textContent, 'Sem previsão válida.');
        assert.match(el('estimatedStamina4').textContent, /indisponível/);
        assert.doesNotMatch(el('gameListBody').textContent, /Calculada às/);
        assert.equal(state.writes.length, 0);
    });

    await t.test('one read advances every estimate using the same clock without writing', async () => {
        await seed();
        let reads = 0;
        state.beforeQuery = request => {
            assert.equal(request.table, 'games');
            assert.equal(request.operation, 'select');
            reads++;
        };
        const stored = structuredClone(state.games);
        t.mock.timers.setTime(new Date('2026-10-06T12:06:00Z').getTime());
        await refresh();
        assert.equal(reads, 1);
        for (const id of [1, 2]) assert.equal(el(`estimatedStamina${id}`).textContent, 'Resina estimada: 181/240');
        assert.deepEqual(state.games, stored);
        assert.equal(state.writes.length, 0);
    });

    await t.test('remote changes update clean fields while each edited field stays a draft', async () => {
        await seed();
        el('currentStamina1').value = '77';
        el('pendingTask2').value = 'Unsaved notes';
        for (const game of state.games.slice(0, 2)) {
            Object.assign(game, { current_stamina: 40, pending_tasks: 'Notes from another device',
                date_max_stamina: '2026-10-07T08:00:00Z' });
        }
        state.games[0].description = 'Renamed remotely';
        await refresh();
        assert.equal(el('currentStamina1').value, '77');
        assert.equal(el('pendingTask1').value, 'Notes from another device');
        assert.equal(el('currentStamina2').value, '40');
        assert.equal(el('pendingTask2').value, 'Unsaved notes');
        assert.match(el('gameListBody').textContent, /Renamed remotely/);
        for (const id of [1, 2]) assert.equal(el(`estimatedStamina${id}`).textContent, 'Resina estimada: 40/240');
        assert.match(el('gameListMessage').textContent, /Alterações não salvas foram mantidas/);
        await refresh();
        assert.equal(el('currentStamina1').value, '77');
        assert.equal(el('pendingTask2').value, 'Unsaved notes');
        assert.equal(state.writes.length, 0);
    });

    await t.test('empty and invalid stamina drafts and cleared notes are preserved verbatim', async () => {
        await seed();
        el('currentStamina1').value = '';
        el('currentStamina2').value = '-7';
        el('pendingTask1').value = '';
        await refresh();
        assert.equal(el('currentStamina1').value, '');
        assert.equal(el('currentStamina2').value, '-7');
        assert.equal(el('pendingTask1').value, '');
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 180/240');
        assert.equal(state.writes.length, 0);
    });

    await t.test('pending refresh blocks duplicates and preserves edits made during the read', async () => {
        await seed();
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let reads = 0;
        state.beforeQuery = () => { reads++; return gate; };
        el('refreshGamesBtn').click();
        assert.equal(el('refreshGamesBtn').disabled, true);
        assert.equal(el('loadingOverlay').hidden, false);
        assert.equal(el('loadingOverlay').querySelector('.loading-message').textContent, 'Atualizando dados...');
        el('refreshGamesBtn').click();
        await el('refreshGamesBtn').onclick();
        await waitFor(() => reads === 1);
        el('pendingTask1').value = 'Typed while pending';
        release();
        await waitFor(() => !el('refreshGamesBtn').disabled);
        assert.equal(reads, 1);
        assert.equal(el('pendingTask1').value, 'Typed while pending');
        assert.equal(state.writes.length, 0);
    });

    await t.test('read failure keeps rows and drafts and retry fetches without saving', async () => {
        await seed();
        el('pendingTask1').value = 'Unsaved draft';
        const before = el('gameListBody').innerHTML;
        state.readError = 'Network failure';
        await refresh();
        assert.equal(el('gameListBody').innerHTML, before);
        assert.equal(el('pendingTask1').value, 'Unsaved draft');
        assert.equal(el('gameListRetry').hidden, false);
        assert.equal(el('gameListMessage').getAttribute('role'), 'alert');
        assert.match(el('gameListMessage').textContent, /Não foi possível atualizar/);
        state.readError = null;
        state.games[0].current_stamina = 40;
        el('gameListRetry').click();
        await waitFor(() => el('gameListRetry').hidden && !el('refreshGamesBtn').disabled);
        assert.equal(el('currentStamina1').value, '40');
        assert.equal(el('pendingTask1').value, 'Unsaved draft');
        assert.equal(state.writes.length, 0);
    });

    await t.test('newly selected games appear and removed clean games disappear', async () => {
        await seed();
        state.games = [{ ...fixtures[0], id: 5, description: 'New selection' }];
        await refresh();
        assert.equal(document.querySelectorAll('#gameListBody tr').length, 1);
        assert.ok(el('currentStamina5'));
        assert.equal(el('currentStamina1'), null);
        state.games = [];
        await refresh();
        assert.equal(document.querySelectorAll('#gameListBody tr').length, 0);
        assert.equal(state.writes.length, 0);
    });

    await t.test('a removed game with a draft prevents replacement of the list', async () => {
        await seed();
        el('pendingTask1').value = 'Do not discard';
        const before = el('gameListBody').innerHTML;
        state.games = state.games.filter(game => game.id !== 1);
        await refresh();
        assert.equal(el('gameListBody').innerHTML, before);
        assert.equal(el('pendingTask1').value, 'Do not discard');
        assert.match(el('gameListMessage').textContent, /saiu da seleção/);
        assert.match(el('gameListMessage').textContent, /Copie o que precisar/);
        assert.equal(el('refreshGamesBtn').disabled, false);
        assert.equal(state.writes.length, 0);
    });

    await t.test('a response for a profile no longer active cannot replace the list', async () => {
        await seed();
        const before = el('gameListBody').innerHTML;
        state.beforeQuery = () => selectProfile('demo');
        await refresh();
        assert.equal(el('gameListBody').innerHTML, before);
        assert.equal(state.writes.length, 0);
    });

    await t.test('Save records real stamina and global refresh only reads that forecast', async () => {
        await seed();
        el('currentStamina1').value = '200';
        el('pendingTask1').value = 'Saved explicitly';
        el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(state.games[0].current_stamina, 200);
        assert.equal(state.games[0].pending_tasks, 'Saved explicitly');
        assert.equal(state.games[0].date_max_stamina, '2026-10-06T16:00:00.000Z');
        t.mock.timers.setTime(new Date('2026-10-06T12:06:00Z').getTime());
        await refresh();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 201/240');
        assert.equal(el('currentStamina1').value, '200');
        t.mock.timers.setTime(new Date('2026-10-07T12:00:00Z').getTime());
        await refresh();
        assert.equal(el('estimatedStamina1').textContent, 'Resina estimada: 240/240');
        assert.equal(state.writes.length, 1);
    });
});
