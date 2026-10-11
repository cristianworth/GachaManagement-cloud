import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export async function buildDesignPreview() {
    const destination = resolve(projectRoot, '.local-deliveries/anime-design/build');
    await mkdir(destination, { recursive: true });
    for (const folder of ['js', 'css', 'img']) {
        await cp(resolve(projectRoot, folder), resolve(destination, folder), {
            recursive: true,
            filter: source => !source.endsWith('supabase.config.js'),
        });
    }
    await mkdir(resolve(destination, 'js/config'), { recursive: true });
    await writeFile(resolve(destination, 'js/config/supabase.config.js'),
        "export const SUPABASE_URL = 'http://localhost'; export const SUPABASE_ANON_KEY = 'preview'; export const isSupabaseConfigured = () => true;\n");
    let html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
    html = html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', '<script src="/__preview/client.js"></script>')
        .replace(/^.*<link[^>]+https:\/\/fonts\.[^>]+>.*$/gm, '');
    await writeFile(resolve(destination, 'index.html'), html);
    await writeFile(resolve(destination, 'README.txt'), 'Gacha Management — full anime design preview build.\nRun from the project: node scripts/previewProfiles.js --design --port=5502\nUses original app modules and disposable PostgreSQL; does not connect to Supabase.\nData persists across reloads until the preview server stops.\n');
    return destination;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log(await buildDesignPreview());
}
