// This adapter exposes only the public operations used by the real repositories.
// Its caller supplies a local PGlite instance; there is no network backend.
import { hasDemoEventCover, isCurrentDemoEvent, isVisibleDemoTask } from './catalogue.js';
export const DEMO_RPC_NAMES = new Set([
    'list_game_agenda', 'game_agenda_catalogue', 'save_game_agenda', 'delete_game_agenda',
    'initialize_game_catalogue', 'profile_game_catalogue', 'list_profile_games', 'set_profile_games',
    'save_profile_game', 'remove_profile_game', 'list_profile_tasks', 'save_profile_task',
    'complete_profile_task', 'set_profile_task_favorite', 'remove_profile_task', 'list_profile_candidates',
    'ignore_profile_candidate', 'ignore_profile_task', 'approve_profile_candidate', 'restore_profile_api_deadline',
    'list_profile_task_batch', 'choose_profile_task_batch', 'task_batch_cover_catalogue', 'task_batch_catalogue',
    'create_profile_task_batch', 'create_profile_endgame_batch', 'create_profile_weekly_batch',
    'cleanup_expired_imported_events', 'cleanup_expired_hsr_events', 'reset_application_data',
]);
const jsonParameters = new Set(['p_game', 'p_task', 'p_definitions', 'p_games', 'p_items']);

export function createDemoClient(db, { beforeRead = async () => {}, now = Date.now, coverAvailable = async () => true } = {}) {
    return {
        async rpc(name, params = {}) {
            try {
                if (!DEMO_RPC_NAMES.has(name)) throw new Error('Operação indisponível na demonstração.');
                if (name === 'list_profile_tasks' || name === 'list_profile_games') await beforeRead();
                const keys = Object.keys(params);
                if (!keys.every(key => /^p_[a-z_]+$/.test(key))) throw new Error('Parâmetro inválido.');
                const values = keys.map(key => jsonParameters.has(key) ? JSON.stringify(params[key]) : params[key]);
                const result = await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`, values);
                let data = result.rows[0].result;
                const instant = now();
                if (name === 'list_profile_tasks') data = data.filter(task => isVisibleDemoTask(task, instant));
                if (name === 'list_profile_candidates') data = data.filter(event =>
                    hasDemoEventCover(event.cover_url) && isCurrentDemoEvent(event, instant));
                if (name === 'list_profile_tasks' || name === 'list_profile_candidates') {
                    const available = await Promise.all(data.map(row => coverAvailable(row.cover_url)));
                    data = data.filter((_, index) => available[index]);
                    // Loading a cover may cross a deadline; never return a newly expired row.
                    if (name === 'list_profile_tasks') data = data.filter(task => isVisibleDemoTask(task, now()));
                    else data = data.filter(event => isCurrentDemoEvent(event, now()));
                }
                return { data, error: null };
            } catch (error) { return { data: null, error }; }
        },
        from(table) {
            return {
                select() { return this; }, order() { return this; }, limit() { return this; },
                then(resolve, reject) {
                    const sql = table === 'profiles' ? 'select id,name from public.profiles order by sort_order'
                        : table === 'games' ? 'select id from public.games limit 1' : null;
                    const request = sql ? db.query(sql).then(result => ({ data: result.rows, error: null }),
                        error => ({ data: null, error }))
                        : Promise.resolve({ data: null, error: new Error('Tabela indisponível na demonstração.') });
                    return request.then(resolve, reject);
                },
            };
        },
    };
}

export async function installDemo(db, schema, seed, { restore = false, now = Date.now(), onProgress = () => {} } = {}) {
    const { seedDemo } = await import('./seed.js');
    await db.transaction(async tx => {
        await tx.exec('reset role');
        if (restore) await tx.exec('drop schema public cascade; create schema public;');
        await tx.exec(`grant usage on schema public to anon;
            alter default privileges in schema public grant select, insert, update, delete on tables to anon;
            alter default privileges in schema public grant usage, select on sequences to anon;`);
        // The installation file has its own transaction wrappers. The surrounding
        // transaction must own the whole restore, including seeding and metadata.
        await tx.exec(schema.replace(/^[\t ]*(?:begin|commit);[\t ]*\r?$/gmi,''));
        await tx.exec(seed);
        onProgress('Preparando jogos, tarefas e anotações de exemplo…');
        await tx.exec(`create table public.demo_metadata (
            id integer primary key check (id = 1), seeded_at timestamptz not null, agenda jsonb not null,
            event_state jsonb not null default '{}', examples_version integer not null default 2);`);
        await seedDemo(tx, now);
        await tx.exec('set role anon');
    });
}
