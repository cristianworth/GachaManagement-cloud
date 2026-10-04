import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

export function createDomHarness() {
    // Scripts and external resources stay disabled: no production client is executed.
    const dom = new JSDOM(readFileSync(new URL('../../index.html', import.meta.url), 'utf8'), { url: 'http://localhost:5500/' });
    const originals = Object.fromEntries(['window', 'document', 'history', 'Option'].map(key => [key, globalThis[key]]));
    for (const key of Object.keys(originals)) globalThis[key] = dom.window[key];
    const state = { games: [], tasks: [], candidates: [], writes: [], error: null, readError: null,
        beforeQuery: null, queryError: null, rpcErrors: {} };
    const client = {
        from(table) {
            if (!['games', 'tasks', 'event_candidates'].includes(table)) throw new Error(`Unexpected table ${table}`);
            let operation = 'select';
            let payload;
            let single = false;
            let limit;
            const filters = [];
            const query = {
                select() { return this; },
                insert(value) { operation = 'insert'; payload = value; return this; },
                update(value) { operation = 'update'; payload = value; return this; },
                delete() { operation = 'delete'; return this; },
                limit(value) { limit = value; return this; },
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
                    return Promise.resolve().then(async () => {
                        const request = { table, operation, payload };
                        await state.beforeQuery?.(request);
                        const rows = state[table === 'event_candidates' ? 'candidates' : table];
                        let matches = rows.filter(row => filters.every(filter => filter(row)));
                        if (limit !== undefined) matches = matches.slice(0, limit);
                        const error = state.queryError?.(request) ?? (operation === 'select' ? state.readError : state.error);
                        if (operation !== 'select') {
                            state.writes.push({ table, operation, payload: structuredClone(payload) });
                            if (error) return { data: null, error: new Error(error) };
                            if (operation === 'insert') {
                                const row = { id: Math.max(0, ...rows.map(item => item.id)) + 1, ...payload };
                                rows.push(row);
                                return { data: single ? row : [row], error: null };
                            }
                            if (operation === 'delete') matches.forEach(row => rows.splice(rows.indexOf(row), 1));
                            else matches.forEach(row => Object.assign(row, payload));
                        }
                        if (error) return { data: null, error: new Error(error) };
                        return { data: single ? matches[0] ?? null : matches, error: null };
                    }).then(resolve, reject);
                },
            };
            return query;
        },
        async rpc(name, payload) {
            if (!['cleanup_expired_hsr_events', 'ignore_imported_task', 'sync_event_candidate'].includes(name)) throw new Error(`Unexpected RPC ${name}`);
            await state.beforeQuery?.({ operation: 'rpc', name, payload });
            if (state.rpcErrors[name]) return { data: null, error: new Error(state.rpcErrors[name]) };
            if (name === 'ignore_imported_task') {
                state.tasks = state.tasks.filter(row => row.id !== payload.p_task_id);
            }
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
