import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildDesignPreview } from '../scripts/buildDesignPreview.js';

test('full design build retains every real page and DOM contract with an isolated database client', async () => {
    const original = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const buildRoot = await buildDesignPreview();
    const built = await readFile(resolve(buildRoot, 'index.html'), 'utf8');
    const before = new JSDOM(original).window.document;
    const after = new JSDOM(built).window.document;
    const ids = document => [...document.querySelectorAll('[id]')].map(element => element.id);
    assert.deepEqual(ids(after), ids(before), 'Every existing control and page hook must remain in the build');
    assert.deepEqual([...after.querySelectorAll('[data-page]')].map(page => page.dataset.page),
        [...before.querySelectorAll('[data-page]')].map(page => page.dataset.page));
    assert.ok(after.querySelector('script[src="/__preview/client.js"]'));
    assert.equal(after.querySelector('script[src*="supabase-js"]'), null);
    const config = await readFile(resolve(buildRoot, 'js/config/supabase.config.js'), 'utf8');
    assert.match(config, /SUPABASE_URL = 'http:\/\/localhost'/);
    assert.match(config, /SUPABASE_ANON_KEY = 'preview'/);
    for (const file of ['js/index.js', 'js/ui/appShell.js', 'js/ui/gameUI.js', 'js/ui/taskUI.js', 'js/ui/eventReviewUI.js', 'js/utils/router.js', 'css/sangonomiya.css']) {
        assert.equal(await readFile(resolve(buildRoot, file), 'utf8'), await readFile(new URL(`../${file}`, import.meta.url), 'utf8'),
            `The preview must use the real ${file}`);
    }
    assert.ok((await readFile(resolve(buildRoot, 'img/sangonomiya.png'))).length > 0);
    assert.equal(after.querySelector('script[src="design-preview/shell.js"]'), null,
        'The test build must not inject a second shell beside the production shell');

    // Exercise the shell transformation: retaining hooks in the build alone is insufficient.
    const ui = new JSDOM(built, {url:'http://localhost/'});
    const shell = await readFile(resolve(buildRoot, 'js/ui/appShell.js'), 'utf8');
    const navigations = [];
    let currentPath = '/';
    const router = { BASE_PATH:'/GachaManagement-cloud', getCurrentPath: () => currentPath, navigateTo: path => navigations.push(path) };
    new Function('document', 'window', 'Router', 'getSelectedProfileId', 'MutationObserver',
        shell.replace(/^import .*;\r?\n/gm, '').replace('export function initializeAppShell()', 'function initializeAppShell()') + '\ninitializeAppShell();')(
        ui.window.document, ui.window, router, () => 'cran', ui.window.MutationObserver);
    assert.deepEqual(ids(ui.window.document).sort(), ids(before).sort(),
        'Applying the new layout must neither drop nor duplicate an existing control');
    const pages = ui.window.document.querySelectorAll('.app-content > [data-page]');
    assert.equal(pages.length, before.querySelectorAll('[data-page]').length);
    const taskLink = ui.window.document.querySelector('[data-app-route="/tasks"]');
    assert.equal(taskLink.getAttribute('href'), '/GachaManagement-cloud/tasks', 'Native links retain the hosting base path');
    assert.equal(ui.window.document.querySelector('[data-app-route="/"]').getAttribute('aria-current'), 'page');
    taskLink.click();
    assert.deepEqual(navigations, ['/tasks'], 'New navigation uses the existing public router');
    assert.equal(ui.window.document.getElementById('taskBatchDialog').tagName, 'DIALOG');
    assert.equal(ui.window.document.getElementById('saveProfileGamesBtn').closest('[data-page]').dataset.page, 'profileGames');
    assert.equal(ui.window.document.querySelector('.version-badge').textContent, before.querySelector('.version-badge').textContent);
    assert.equal(ui.window.document.querySelector('.app-project-link').href, before.querySelector('.main-title a').href);
    assert.equal(ui.window.document.querySelector('.app-preview-label'), null, 'The production shell must not show test-only labels');
    assert.equal(ui.window.document.querySelectorAll('.app-nav a').length,2,'Frequent destinations stay in the primary navigation');
    assert.equal(ui.window.document.getElementById('viewTasksBtn'),null,'Tasks already has a primary navigation link');
    const settings=ui.window.document.querySelector('.app-settings');
    const summary=settings.querySelector('summary');
    assert.equal(settings.querySelectorAll('a').length,2);
    assert.equal(settings.open,false);
    summary.click();assert.equal(settings.open,true);
    ui.window.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(settings.open,false);assert.equal(ui.window.document.activeElement,summary);
    summary.click();
    settings.querySelector('[data-app-route="/agenda"]').click();
    assert.equal(settings.open,false);assert.equal(navigations.at(-1),'/agenda');
    for (const path of ['/tasks', '/events', '/agenda']) {
        currentPath = path;
        ui.window.dispatchEvent(new ui.window.PopStateEvent('popstate'));
        assert.equal(ui.window.document.querySelector(`[data-app-route="${path}"]`).getAttribute('aria-current'), 'page');
        assert.equal(ui.window.document.querySelectorAll('[aria-current="page"]').length, 1);
    }
    currentPath='/profile/games';ui.window.dispatchEvent(new ui.window.PopStateEvent('popstate'));
    assert.equal(ui.window.document.querySelector('[data-app-route="/"]').getAttribute('aria-current'),'page');
    assert.equal(ui.window.document.querySelector('[data-app-route="/profile/games"]'),null,'Game selection has one contextual entry');
    ui.window.close();
});
