import assert from 'node:assert/strict';

// Run the real sync through its REST contract against a disposable PostgreSQL instance.
export function mockDatabaseFetch(t, db, game, getCalendar) {
    t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
        const url = new URL(input);
        if (url.href === game.url) return new Response(JSON.stringify(getCalendar()));
        let result;
        await db.exec('set role anon');
        try {
            if (url.pathname === '/rest/v1/games') {
                assert.equal(url.searchParams.get('abbreviation'), `eq.${game.abbreviation}`);
                result = (await db.query('select id from public.games where abbreviation=$1', [game.abbreviation])).rows;
            } else if (url.pathname === '/rest/v1/event_candidates' && !options.method) {
                assert.equal(url.searchParams.get('source'), game.key === 'genshin' ? `in.(${game.source},ennead-genshin-calendar)` : `eq.${game.source}`);
                result = (await db.query('select * from public.event_candidates where source = any($1::text[])',
                    [game.key === 'genshin' ? [game.source, 'ennead-genshin-calendar'] : [game.source]])).rows;
            } else if (url.pathname === '/rest/v1/event_candidates') {
                const row = JSON.parse(options.body);
                const columns = Object.keys(row);
                assert.ok(columns.every(column => /^[a-z_]+$/.test(column)));
                if (options.method === 'POST') {
                    assert.equal(url.searchParams.get('on_conflict'), 'source,external_id');
                    await db.query(`insert into public.event_candidates (${columns.join(',')}) values (${columns.map((_, i) => `$${i + 1}`).join(',')}) on conflict (source, external_id) do nothing`, Object.values(row));
                } else {
                    assert.equal(options.method, 'PATCH');
                    await db.query(`update public.event_candidates set ${columns.map((column, i) => `${column}=$${i + 1}`).join(',')} where id=$${columns.length + 1}`, [...Object.values(row), Number(url.searchParams.get('id').slice(3))]);
                }
                result = {};
            } else if (url.pathname === '/rest/v1/rpc/import_event_candidates') {
                assert.equal(JSON.parse(options.body).p_source, game.source);
                result = (await db.query('select public.import_event_candidates($1) as result', [game.source])).rows[0].result;
            } else if (url.pathname === '/rest/v1/rpc/cleanup_expired_imported_events') {
                assert.equal(JSON.parse(options.body).p_source, game.source);
                assert.equal(game.cleanupExpired, true, 'Only opted-in sources may clean their own tasks');
                result = (await db.query('select public.cleanup_expired_imported_events($1) as result', [game.source])).rows[0].result;
            } else throw new Error(`Unexpected sync request: ${url}`);
        } finally { await db.exec('reset role'); }
        return new Response(JSON.stringify(result));
    });
}
