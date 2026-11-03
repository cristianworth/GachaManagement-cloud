import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { buildDemo, DEMO_BASE_PATH } from './buildDemo.js';
import { captureDemoCatalogue, DEMO_CATALOGUE_DIRECTORY } from './captureDemoCatalogue.js';

const arg = process.argv.find(value => value.startsWith('--port='));
const port = arg ? Number(arg.slice(7)) : 5503;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port.');
let fresh = false;
try { fresh = Date.now() - Date.parse(JSON.parse(await readFile(resolve(DEMO_CATALOGUE_DIRECTORY,'catalogue.json'),'utf8')).generatedAt) < 24 * 3600_000; }
catch { /* A first preview prepares its own public catalogue. */ }
if (!fresh || process.argv.includes('--refresh')) await captureDemoCatalogue();
const root = await buildDemo();
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.wasm':'application/wasm', '.data':'application/octet-stream', '.sql':'text/plain', '.png':'image/png',
    '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.gif':'image/gif' };
// This server only serves files. Database operations run entirely inside the visitor's browser.
createServer(async (request, response) => {
    const send = (status, type, body) => { response.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store' }); response.end(body); };
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (process.argv.includes('--verbose')) console.log(request.method, pathname);
        if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
        if (pathname === '/' || pathname === DEMO_BASE_PATH) {
            response.writeHead(302, { Location: `${DEMO_BASE_PATH}/` }); response.end(); return;
        }
        if (!pathname.startsWith(`${DEMO_BASE_PATH}/`)) return send(404, 'text/plain', 'Not found');
        const suffix = pathname.slice(DEMO_BASE_PATH.length + 1) || 'index.html';
        const path = resolve(root, suffix);
        if (!path.startsWith(root + sep)) return send(404, 'text/plain', 'Not found');
        try { send(200, types[extname(path)] ?? 'application/octet-stream', await readFile(path)); }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            send(404, 'text/html; charset=utf-8', await readFile(resolve(root, '404.html')));
        }
    } catch { send(500, 'text/plain', 'Demo resource unavailable'); }
}).listen(port, '127.0.0.1', () => console.log(`Demo estática: http://127.0.0.1:${port}${DEMO_BASE_PATH}/ — somente arquivos, banco no navegador.`));
