import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomHarness } from './helpers/domHarness.mjs';
import { createEventCover } from '../js/ui/eventCover.js';

test('covers accept bundled demo assets and keep the HTTPS/error contracts of the normal app', t => {
    const harness = createDomHarness();
    t.after(()=>harness.close());
    const local = createEventCover(`img/demo-events/${'a'.repeat(64)}.webp`,'task-cover');
    assert.ok(local.src.endsWith(`/img/demo-events/${'a'.repeat(64)}.webp`));
    assert.equal(local.loading,'lazy');
    assert.equal(local.referrerPolicy,'no-referrer');
    assert.equal(createEventCover('https://example.com/cover.png','task-cover').src,'https://example.com/cover.png');
    for (const invalid of ['http://example.com/a.png','img/../js/config/supabase.config.js','//example.com/a.png','javascript:alert(1)']) {
        assert.ok(createEventCover(invalid,'task-cover').src.endsWith('/img/event-placeholder.svg'));
    }
    local.dispatchEvent(new window.Event('error'));
    assert.ok(local.src.endsWith('/img/event-placeholder.svg'));
});
