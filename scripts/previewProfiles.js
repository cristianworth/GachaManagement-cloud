import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { createTestDatabase } from '../tests/helpers/testDatabase.mjs';
import { seedPreviewEventFixtures } from './previewEventFixtures.js';

// Serve the real frontend against disposable SQL, without loading the production client/config.
const root = fileURLToPath(new URL('../', import.meta.url));
const db = await createTestDatabase();
await db.exec('set role anon');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--events')) throw new Error('Use only --events to load synthetic event scenarios.');
if (args.includes('--events')) {
    await seedPreviewEventFixtures(db);
    console.log('Synthetic events: CRAN expired, Demo with a future manual deadline, Convidado recurring; next editions open.');
}
const functions = new Set([
    'initialize_game_catalogue', 'profile_game_catalogue', 'list_profile_games', 'set_profile_games',
    'save_profile_game', 'remove_profile_game', 'list_profile_tasks', 'save_profile_task',
    'complete_profile_task', 'set_profile_task_favorite', 'remove_profile_task', 'list_profile_candidates', 'ignore_profile_candidate',
    'ignore_profile_task', 'approve_profile_candidate', 'restore_profile_api_deadline',
    'create_profile_weekly_batch', 'cleanup_expired_imported_events', 'cleanup_expired_hsr_events', 'reset_application_data',
]);
const clientScript = `
window.supabase = { createClient() {
    async function request(body) {
        const response = await fetch('/__preview/query', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (result.error) result.error = new Error(result.error.message);
        return result;
    }
    return {
        rpc(name, params = {}) { return request({ name, params }); },
        from(table) {
            return {
                select() { return this; }, order() { return this; }, limit() { return this; },
                then(resolve, reject) { return request({ table }).then(resolve, reject); },
            };
        },
    };
} };
`;
const contentTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};
function send(response, status, type, body) {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
}
async function query(request) {
    let body = '';
    for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error('Preview request too large');
    }
    const { table, name, params = {} } = JSON.parse(body);
    if (table === 'profiles') return (await db.query('select id,name from profiles order by sort_order')).rows;
    if (table === 'games') return (await db.query('select id from games limit 1')).rows;
    if (!functions.has(name)) throw new Error('Unsupported preview operation');
    const keys = Object.keys(params);
    if (!keys.every(key => /^p_[a-z_]+$/.test(key))) throw new Error('Invalid preview parameter');
    const values = keys.map(key => ['p_game', 'p_task', 'p_definitions', 'p_games'].includes(key)
        ? JSON.stringify(params[key]) : params[key]);
    const result = await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, values);
    return result.rows[0].result;
}
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (request.method === 'POST' && pathname === '/__preview/query') {
            try { send(response, 200, 'application/json', JSON.stringify({ data: await query(request), error: null })); }
            catch (error) { send(response, 400, 'application/json', JSON.stringify({ data: null, error: { message: error.message } })); }
            return;
        }
        if (request.method !== 'GET') { send(response, 405, 'text/plain', 'Method not allowed'); return; }
        if (pathname === '/__preview/client.js') { send(response, 200, 'text/javascript', clientScript); return; }
        if (pathname === '/js/config/supabase.config.js') {
            send(response, 200, 'text/javascript', `export const SUPABASE_URL = 'http://localhost';
                export const SUPABASE_ANON_KEY = 'preview'; export const isSupabaseConfigured = () => true;`);
            return;
        }
        const asset = /^\/(js|css|img)\//.test(pathname);
        const path = resolve(root, asset ? pathname.slice(1) : 'index.html');
        if (!path.startsWith(resolve(root) + sep) || (asset && !contentTypes[extname(path)])) {
            send(response, 404, 'text/plain', 'Not found'); return;
        }
        let content = await readFile(path);
        if (!asset) {
            content = content.toString()
                .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="/__preview/client.js"></script>')
                .replace(/^.*<link[^>]+https:\/\/fonts\.[^>]+>.*$/gm, '')
                .replace('<body>', '<body><p style="margin:12px;text-align:center">Prévia local — banco temporário, separado do Supabase. Os dados somem ao parar o servidor.</p>');
        }
        send(response, 200, contentTypes[extname(path)] ?? 'text/plain', content);
    } catch (error) {
        send(response, error.code === 'ENOENT' ? 404 : 500, 'text/plain', 'Preview resource unavailable');
    }
});
server.listen(5501, '127.0.0.1', () => console.log('Prévia de perfis: http://127.0.0.1:5501 — banco descartável, sem acesso ao Supabase.'));
async function stop() { server.close(); await db.close(); process.exit(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
