import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const migrations = [
    '2026-09-29-genshin-events.sql', '2026-09-30-event-cover.sql', '2026-10-01-task-cover.sql',
    '2026-10-02-hsr-events.sql', '2026-10-02-auto-events.sql', '2026-10-02-zzz-events.sql',
    '2026-10-03-task-repeat-days.sql', '2026-10-03-wuwa-events.sql', '2026-10-04-nte-events.sql',
    '2026-10-04-weekly-batches.sql',
    '2026-10-05-profile-model.sql',
    '2026-10-05-profile-contracts.sql',
];
export const readProjectFile = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

export async function createTestDatabase({ migrated = false } = {}) {
    const db = new PGlite();
    try {
        await db.exec('create role anon; create role authenticated; create role service_role;');
        // Supabase grants these defaults to its API roles. RLS still runs as anon in assertions.
        await db.exec(`grant usage on schema public to anon;
            alter default privileges in schema public grant select, insert, update, delete on tables to anon;
            alter default privileges in schema public grant usage, select on sequences to anon;`);
        if (migrated) {
            await db.exec(await readProjectFile('tests/fixtures/pre-events-schema.sql'));
            await db.exec(await readProjectFile('db/seed.sql'));
            await db.exec(`insert into public.tasks (description, refresh_type, game_id, expiration_date, is_done)
                select 'Existing weekly', 2, id, '2025-01-06T09:00:00Z', true from public.games where abbreviation = 'GI';`);
            for (const file of migrations) await db.exec(await readProjectFile(`db/migrations/${file}`));
        } else {
            await db.exec(await readProjectFile('db/schema.sql'));
            await db.exec(await readProjectFile('db/seed.sql'));
        }
        return db;
    } catch (error) {
        await db.close();
        throw error;
    }
}
