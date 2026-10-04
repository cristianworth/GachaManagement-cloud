import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_GAMES } from '../js/events/eventGames.js';

for (const game of EVENT_GAMES) for (const hosted of [false, true]) test(`${game.abbreviation} review opens through ${hosted ? 'the GitHub Pages redirect' : 'a direct local route'}`, async t => {
    const elements = new Map(['eventReviewTitle', 'eventReviewList', 'eventReviewStatus']
        .map(id => [id, { textContent: '', replaceChildren() {} }]));
    const pages = ['games', 'eventReview'].map(page => ({ dataset: { page }, style: {} }));
    const base = hosted ? '/GachaManagement-cloud' : '';
    const location = { hostname: hosted ? 'cristianworth.github.io' : 'localhost',
        pathname: hosted ? `${base}/` : `/events/${game.key}`, hash: hosted ? `#/events/${game.key}` : '' };
    const original = { window: globalThis.window, document: globalThis.document, history: globalThis.history };
    t.after(() => Object.assign(globalThis, original));
    const query = { select() { return this; }, eq() { return this; }, or() { return this; },
        order() { return Promise.resolve({ data: [], error: null }); } };
    globalThis.window = { location, addEventListener() {},
        supabase: { createClient: () => ({ from: () => query }) } };
    globalThis.document = { getElementById: id => elements.get(id),
        querySelector: () => null, querySelectorAll: () => pages };
    globalThis.history = { replaceState: (_state, _title, path) => { location.pathname = path; } };
    const { default: Router } = await import(`../js/utils/router.js?event-route-${game.key}-${hosted}`);
    await Router.init();
    assert.equal(location.pathname, `${base}/events/${game.key}`);
    assert.equal(pages.find(page => page.dataset.page === 'eventReview').style.display, 'block');
    assert.equal(elements.get('eventReviewTitle').textContent, `Eventos encontrados: ${game.name}`);
    assert.ok(Router.routes['/events/wuwa']);
    assert.ok(Router.routes['/events/nte']);
    assert.equal(elements.get('eventReviewStatus').textContent, 'Nenhum evento precisa de revisão.');
});
