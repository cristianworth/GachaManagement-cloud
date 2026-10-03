import test from 'node:test';
import assert from 'node:assert/strict';

for (const hosted of [false, true]) test(`ZZZ review opens through ${hosted ? 'the GitHub Pages redirect' : 'a direct local route'}`, async t => {
    const elements = new Map(['eventReviewTitle', 'eventReviewList', 'eventReviewStatus']
        .map(id => [id, { textContent: '', replaceChildren() {} }]));
    const pages = ['games', 'eventReview'].map(page => ({ dataset: { page }, style: {} }));
    const base = hosted ? '/GachaManagement-cloud' : '';
    const location = { hostname: hosted ? 'cristianworth.github.io' : 'localhost',
        pathname: hosted ? `${base}/` : '/events/zzz', hash: hosted ? '#/events/zzz' : '' };
    const original = { window: globalThis.window, document: globalThis.document, history: globalThis.history };
    t.after(() => Object.assign(globalThis, original));
    const query = { select() { return this; }, eq() { return this; }, or() { return this; },
        order() { return Promise.resolve({ data: [], error: null }); } };
    globalThis.window = { location, addEventListener() {},
        supabase: { createClient: () => ({ from: () => query }) } };
    globalThis.document = { getElementById: id => elements.get(id),
        querySelector: () => null, querySelectorAll: () => pages };
    globalThis.history = { replaceState: (_state, _title, path) => { location.pathname = path; } };
    const { default: Router } = await import(`../js/utils/router.js?event-route-${hosted}`);
    await Router.init();
    assert.equal(location.pathname, `${base}/events/zzz`);
    assert.equal(pages.find(page => page.dataset.page === 'eventReview').style.display, 'block');
    assert.equal(elements.get('eventReviewTitle').textContent, 'Eventos encontrados: Zenless Zone Zero');
    assert.equal(elements.get('eventReviewStatus').textContent, 'Nenhum evento precisa de revisão.');
});
