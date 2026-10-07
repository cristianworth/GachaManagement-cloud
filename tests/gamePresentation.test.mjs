import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDomHarness, waitFor } from './helpers/domHarness.mjs';

test('Games uses the NTE icon and starts every typed To-do item with a bullet', async t => {
    const { dom, state, close } = createDomHarness();
    t.after(close);
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Presentation tests stay offline'); });
    const games = await import('../js/ui/gameUI.js');
    const el = id => document.getElementById(id);
    const seed = async (overrides = {}) => {
        state.games = [{ id: 1, description: 'Neverness to Everness', abbreviation: 'NTE',
            img: 'img/default-icon.png', current_stamina: 80, cap_stamina: 320, stamina_per_minute: 6,
            pending_tasks: '', ...overrides }];
        state.writes = [];
        assert.equal(await games.displayAllGames(), true);
        return el('pendingTask1');
    };
    const input = (editor, value, { start = value.length, end = start, direction = 'none', isComposing = false } = {}) => {
        editor.value = value;
        editor.setSelectionRange(start, end, direction);
        editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing }));
    };
    const enter = (editor, options = {}) => {
        const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
        editor.dispatchEvent(event);
        return event;
    };

    await t.test('legacy NTE placeholder and missing images use the real bundled asset without writes', async () => {
        const bytes = await readFile(new URL('../img/nte-icon.png', import.meta.url));
        assert.ok(bytes.length > 0, 'The bundled NTE image must exist on disk');
        for (const img of ['img/default-icon.png', '', null, 'img/nte-icon.png']) {
            await seed({ img });
            const icon = document.querySelector('#gameListBody img');
            assert.match(icon.src, /\/img\/nte-icon\.png$/);
            assert.equal(icon.alt, 'Neverness to Everness Icon');
            assert.equal(state.writes.length, 0);
        }
    });

    await t.test('custom NTE images and other games retain their configured image and failure fallback', async () => {
        for (const img of ['https://example.com/custom-nte.png', 'img/zzz-icon.png']) {
            await seed({ img });
            assert.ok(document.querySelector('#gameListBody img').src.endsWith(img));
        }
        await seed({ abbreviation: 'CUSTOM' });
        const icon = document.querySelector('#gameListBody img');
        assert.match(icon.src, /\/img\/default-icon\.png$/);
        await seed({ img: 'https://example.com/unavailable.png' });
        document.querySelector('#gameListBody img').dispatchEvent(new dom.window.Event('error'));
        assert.match(document.querySelector('#gameListBody img').src, /\/img\/default-icon\.png$/);
    });

    await t.test('typing the first character adds one bullet and keeps the caret after the text', async () => {
        const editor = await seed();
        assert.equal(editor.value, '', 'Loading an empty note must not create a dirty bullet');
        input(editor, 'F');
        assert.equal(editor.value, '• F');
        assert.equal(editor.selectionStart, 3);
        input(editor, '• First item');
        assert.equal(editor.value, '• First item');
        assert.equal(editor.selectionStart, 12);
        assert.equal(state.writes.length, 0);
    });

    await t.test('pasting multiple lines preserves indentation, blank lines and existing bullets', async () => {
        const editor = await seed();
        input(editor, 'First\n  Second\n\n• Existing\n\tThird');
        assert.equal(editor.value, '• First\n  • Second\n\n• Existing\n\t• Third');
        assert.equal(editor.selectionStart, editor.value.length);
        input(editor, editor.value);
        assert.equal(editor.value, '• First\n  • Second\n\n• Existing\n\t• Third');
    });

    await t.test('formatting preserves a backward selection across newly marked lines', async () => {
        const editor = await seed();
        input(editor, 'First\nSecond', { start: 2, end: 9, direction: 'backward' });
        assert.equal(editor.value, '• First\n• Second');
        assert.equal(editor.selectionStart, 4);
        assert.equal(editor.selectionEnd, 13);
        assert.equal(editor.selectionDirection, 'backward');
    });

    await t.test('Enter continues the list and also marks an existing unbulleted first item', async () => {
        const editor = await seed({ pending_tasks: 'Old first item' });
        assert.equal(editor.value, 'Old first item', 'Loading existing notes must not rewrite them');
        editor.setSelectionRange(editor.value.length, editor.value.length);
        assert.equal(enter(editor).defaultPrevented, true);
        assert.equal(editor.value, '• Old first item\n• ');
        assert.equal(editor.selectionStart, editor.value.length);
        input(editor, `${editor.value}Second item`);
        assert.equal(editor.value, '• Old first item\n• Second item');
        assert.equal(enter(editor).defaultPrevented, true);
        assert.equal(editor.value, '• Old first item\n• Second item\n• ');
        const before = editor.value;
        assert.equal(enter(editor).defaultPrevented, false);
        assert.equal(editor.value, before, 'An empty bullet does not force another bullet');
    });

    await t.test('IME composition is left alone until it finishes and cleared notes stay empty', async () => {
        const editor = await seed();
        input(editor, '日', { isComposing: true });
        assert.equal(editor.value, '日');
        assert.equal(enter(editor, { isComposing: true }).defaultPrevented, false);
        editor.dispatchEvent(new dom.window.CompositionEvent('compositionend', { data: '日' }));
        assert.equal(editor.value, '• 日');
        input(editor, '');
        assert.equal(editor.value, '');
        input(editor, '  \n\t');
        assert.equal(editor.value, '  \n\t');
    });

    await t.test('bulleted drafts survive refresh and only Save persists their exact text', async () => {
        const editor = await seed();
        input(editor, 'First\nSecond');
        const expected = '• First\n• Second';
        el('refreshGamesBtn').click();
        await waitFor(() => !el('refreshGamesBtn').disabled);
        assert.equal(el('pendingTask1').value, expected);
        assert.equal(state.games[0].pending_tasks, '');
        assert.equal(state.writes.length, 0);
        el('save-game-1').click();
        await waitFor(() => el('loadingOverlay').hidden);
        assert.equal(state.games[0].pending_tasks, expected);
        assert.equal(state.writes.length, 1);
        await games.displayAllGames();
        assert.equal(el('pendingTask1').value, expected);
    });
});
