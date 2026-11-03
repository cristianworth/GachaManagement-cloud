import { PGlite } from './vendor/pglite/index.js';
import { worker } from './vendor/pglite/worker/index.js';
import { installDemo } from './database.js';

worker({
    async init(options) {
        try {
            postMessage({ type: 'demo-progress', message: 'Carregando o banco da demonstração…' });
            const readAsset = async name => {
                const response = await fetch(new URL(`./vendor/pglite/${name}`, import.meta.url));
                if (!response.ok) throw new Error('Não foi possível carregar a demonstração.');
                return response;
            };
            // Resolve downloads explicitly so an unavailable asset rejects startup instead of
            // leaving Emscripten's asynchronous initialization waiting indefinitely.
            const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
                readAsset('pglite.wasm').then(response => response.arrayBuffer()).then(WebAssembly.compile),
                readAsset('initdb.wasm').then(response => response.arrayBuffer()).then(WebAssembly.compile),
                readAsset('pglite.data').then(response => response.blob()),
            ]);
            postMessage({ type: 'demo-progress', message: 'Arquivos carregados. Abrindo seu armazenamento local…' });
            const db = new PGlite({ dataDir: options.dataDir, relaxedDurability: false,
                pgliteWasmModule, initdbWasmModule, fsBundle });
            await db.waitReady;
            postMessage({ type: 'demo-progress', message: 'Preparando os exemplos fictícios…' });
            const exists = (await db.query("select to_regclass('public.demo_metadata') as name")).rows[0].name;
            if (!exists) {
                await db.exec(`do $$ begin
                    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
                    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
                    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
                end $$;`);
                const read = async name => {
                    const response = await fetch(new URL(name, import.meta.url));
                    if (!response.ok) throw new Error('Não foi possível preparar os exemplos.');
                    return response.text();
                };
                const [schema, seed] = await Promise.all([read('./schema.sql'), read('./catalogue.sql')]);
                await installDemo(db, schema, seed);
            } else await db.exec('set role anon');
            postMessage({ type: 'demo-progress', message: 'Abrindo a interface…' });
            return db;
        } catch (error) {
            postMessage({ type: 'demo-startup-error', message: error.message });
            throw error;
        }
    },
});
