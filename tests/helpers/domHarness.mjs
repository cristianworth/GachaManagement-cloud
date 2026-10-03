import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

export function createDomHarness() {
    // Scripts and external resources stay disabled: no production client is executed.
    const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), { url: 'http://localhost:5500/' });
    const originals = Object.fromEntries(['window', 'document', 'history', 'Option'].map(key => [key, globalThis[key]]));
    for (const key of Object.keys(originals)) globalThis[key] = dom.window[key];
    const state = { games: [], tasks: [], candidates: [], writes: [], error: null };
    const client = {
        from(table) {
            if (!['games', 'tasks', 'event_candidates'].includes(table)) throw new Error(`Unexpected table ${table}`);
            let operation = 'select';
            let payload;
            let single = false;
            const filters = [];
            const query = {
                select() { return this; },
                insert(value) { operation = 'insert'; payload = value; return this; },
                update(value) { operation = 'update'; payload = value; return this; },
                eq(key, value) { filters.push(row => row[key] === value); return this; },
                in(key, values) { filters.push(row => values.includes(row[key])); return this; },
                or(value) {
                    if (!value.startsWith('proposed_end_at.is.null,proposed_end_at.gt.')) throw new Error(`Unexpected filter ${value}`);
                    const now = Date.parse(value.slice('proposed_end_at.is.null,proposed_end_at.gt.'.length));
                    filters.push(row => !row.proposed_end_at || Date.parse(row.proposed_end_at) > now);
                    return this;
                },
                order() { return this; },
                single() { single = true; return this; },
                maybeSingle() { single = true; return this; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => {
                        const rows = state[table === 'event_candidates' ? 'candidates' : table];
                        const matches = rows.filter(row => filters.every(filter => filter(row)));
                        if (operation !== 'select') {
                            state.writes.push({ table, operation, payload: structuredClone(payload) });
                            if (state.error) return { data: null, error: new Error(state.error) };
                            if (operation === 'insert') {
                                const row = { id: Math.max(0, ...rows.map(item => item.id)) + 1, ...payload };
                                rows.push(row);
                                return { data: single ? row : [row], error: null };
                            }
                            matches.forEach(row => Object.assign(row, payload));
                        }
                        return { data: single ? matches[0] ?? null : matches, error: null };
                    }).then(resolve, reject);
                },
            };
            return query;
        },
        async rpc(name) {
            if (name !== 'cleanup_expired_hsr_events') throw new Error(`Unexpected RPC ${name}`);
            return { data: 0, error: null };
        },
    };
    dom.window.supabase = { createClient: () => client };
    return { dom, state, close() {
        dom.window.close();
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    } };
}

export async function waitFor(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    throw new Error('DOM action did not settle');
}
