import { PGliteWorker } from './vendor/pglite/worker/index.js';
import { createDemoClient, installDemo } from './database.js';
import { prepareDemoEvents, applyDemoCatalogue } from './events.js';
import { validateDemoCatalogue, describeDemoCatalogue } from './catalogue.js';
import { createDemoCoverChecker } from './covers.js';

let db;
let client;
let eventStatus = 'Preparando eventos da API…';
let pendingCatalogue = null;
let checkedAt = 0;

export const getDemoEventStatus = () => eventStatus;

export async function synchronizeDemoEvents({force = false} = {}) {
    if (pendingCatalogue) return pendingCatalogue;
    if (!force && Date.now() - checkedAt < 6 * 60_000) return;
    pendingCatalogue = (async () => {
        try {
            const response = await fetch(new URL('./catalogue.json',import.meta.url),{cache:'no-store'});
            if (!response.ok) throw new Error('Catalogue unavailable');
            const catalogue = validateDemoCatalogue(await response.json());
            const result = await applyDemoCatalogue(db,catalogue);
            const effective = {...catalogue,games:catalogue.games.map(entry => {
                const saved = result.state[entry.key];
                return saved ? {...entry,available:true,capturedAt:saved.capturedAt,
                    retained:entry.retained || !entry.available || result.failures.includes(entry.key)} : entry;
            })};
            eventStatus = describeDemoCatalogue(effective);
            if (result.failures.length) eventStatus += ' Algumas atualizações locais não puderam ser concluídas; os dados anteriores foram mantidos.';
        } catch {
            const state = (await db.query('select event_state from public.demo_metadata where id=1')).rows[0].event_state;
            eventStatus = 'Não foi possível atualizar o catálogo. '
                + (Object.keys(state).length ? 'Os eventos já salvos foram mantidos.' : 'Os exemplos locais continuam disponíveis.');
            await db.query('select public.cleanup_expired_imported_events()');
        } finally {
            checkedAt = Date.now();
            pendingCatalogue = null;
            window.dispatchEvent(new CustomEvent('demo:catalogue'));
        }
    })();
    return pendingCatalogue;
}
export async function initializeDemoDatabase() {
    if (!window.indexedDB || !navigator.locks || !window.BroadcastChannel || !window.Worker) {
        throw new Error('Este navegador não oferece o armazenamento necessário. Experimente uma versão recente do Chrome, Edge, Firefox ou Safari.');
    }
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    let timeout;
    const failure = new Promise((_, reject) => {
        worker.addEventListener('error', () => reject(new Error('Não foi possível iniciar a demonstração neste navegador.')));
        worker.addEventListener('message', event => {
            if (event.data?.type === 'demo-progress') {
                const status = document.querySelector('#demoStartup p');
                if (status) status.textContent = event.data.message;
            }
            if (event.data?.type === 'demo-startup-error') reject(new Error('Não foi possível abrir o armazenamento da demonstração. Confira o espaço e as permissões do navegador.'));
        });
        timeout = setTimeout(() => reject(new Error('A preparação demorou mais que o esperado. Recarregue para tentar novamente.')), 90_000);
    });
    // The path scopes storage away from the normal application's preferences.
    const id = `gacha-public-demo-v1-${encodeURIComponent(new URL('../', import.meta.url).pathname)}`;
    db = new PGliteWorker(worker, { dataDir: `idb://${id}`, id });
    try { await Promise.race([db.waitReady, failure]); }
    catch (error) { await db.close(); throw error; }
    finally { clearTimeout(timeout); }
    await prepareDemoEvents(db);
    const status = document.querySelector('#demoStartup p');
    if (status) status.textContent = 'Atualizando eventos da API no seu espaço local…';
    await synchronizeDemoEvents({force:true});
    client = createDemoClient(db,{beforeRead:()=>synchronizeDemoEvents(),coverAvailable:createDemoCoverChecker()});
}

export function getClient() {
    if (!client) throw new Error('A demonstração ainda está sendo preparada.');
    return client;
}
export const Tables = Object.freeze({ GAMES: 'games', TASKS: 'tasks', EVENT_CANDIDATES: 'event_candidates' });

export async function readDemoAgenda() {
    return (await db.query('select agenda from public.demo_metadata where id = 1')).rows[0].agenda;
}

export async function restoreDemoExamples(onProgress = () => {}) {
    const read = async name => {
        const response = await fetch(new URL(name, import.meta.url));
        if (!response.ok) throw new Error('Não foi possível ler os exemplos.');
        return response.text();
    };
    const [schema, seed] = await Promise.all([read('./schema.sql'), read('./catalogue.sql')]);
    await installDemo(db, schema, seed, { restore: true, onProgress });
    onProgress('Atualizando eventos e capas do último catálogo…');
    checkedAt = 0;
    await synchronizeDemoEvents({force:true});
}
