import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_GAMES } from '../js/events/eventGames.js';
import { discoverEventCandidates, assignEditionKeys } from '../js/events/eventCatalogue.js';
import { validateDemoCatalogue, isCurrentDemoEvent, hasDemoEventCover } from '../demo/catalogue.js';

export const DEMO_CATALOGUE_DIRECTORY = fileURLToPath(new URL('../.local-deliveries/public-demo/catalogue/', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const imageFormat = bytes => bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
    : bytes.subarray(0,6).toString() === 'GIF89a' || bytes.subarray(0,6).toString() === 'GIF87a' ? 'gif'
    : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'webp' : null;

export async function captureDemoCatalogue({ directory = DEMO_CATALOGUE_DIRECTORY, fetcher = fetch, now = Date.now() } = {}) {
    await mkdir(join(directory,'images'),{recursive:true});
    let previous = null;
    try { previous = validateDemoCatalogue(JSON.parse(await readFile(join(directory,'catalogue.json'),'utf8'))); }
    catch { /* A first capture must succeed from public sources. */ }
    const images = new Map((previous?.images ?? []).map(image => [image.sourceUrl,image]));
    const downloads = new Map();
    const capturedAt = new Date(now).toISOString();
    async function cover(url) {
        if (!url) return null;
        if (downloads.has(url)) return downloads.get(url);
        const pending = (async () => {
            try {
                const response = await fetcher(url,{signal:AbortSignal.timeout(20_000)});
                if (!response.ok || Number(response.headers.get('content-length')) > 5_000_000) throw new Error('Image unavailable');
                const bytes = Buffer.from(await response.arrayBuffer());
                const format = imageFormat(bytes);
                if (!format || bytes.length > 5_000_000) throw new Error('Invalid image');
                const hash = digest(bytes);
                const file = `${hash}.${format}`;
                await writeFile(join(directory,'images',file),bytes);
                const image = {sourceUrl:url,path:`img/demo-events/${file}`,sha256:hash,bytes:bytes.length};
                images.set(url,image);
                return image.path;
            } catch {
                const old = images.get(url);
                if (old) {
                    try { await access(join(directory,'images',old.path.split('/').at(-1))); return old.path; }
                    catch { /* A missing cached image cannot represent this event. */ }
                }
                return null;
            }
        })();
        downloads.set(url,pending);
        return pending;
    }
    const games = [];
    for (const game of EVENT_GAMES) {
        const old = previous?.games.find(entry => entry.key === game.key && entry.available);
        try {
            const response = await fetcher(game.url,{signal:AbortSignal.timeout(20_000)});
            if (!response.ok) throw new Error('Calendar unavailable');
            const discovered = discoverEventCandidates(await response.json(),game,now);
            const candidates = discovered.candidates.filter(event=>isCurrentDemoEvent(event,now));
            let skipped = discovered.skipped + discovered.candidates.length - candidates.length;
            if (!candidates.length) throw new Error('Calendar has no current events');
            assignEditionKeys(candidates,old?.events ?? []);
            const events = [];
            // Limit concurrent downloads to one game's batch rather than every source at once.
            for (const event of candidates) {
                const coverUrl = await cover(event.cover_url);
                if (coverUrl) events.push({...event,cover_url:coverUrl});
                else skipped++;
            }
            games.push({key:game.key,source:game.source,url:game.url,available:true,capturedAt,retained:false,skipped,events});
        } catch {
            if (old) {
                const events = [];
                for (const event of old.events) {
                    if (!hasDemoEventCover(event.cover_url) || !isCurrentDemoEvent(event,now)) continue;
                    try { await access(join(directory,'images',event.cover_url.split('/').at(-1))); }
                    catch { continue; }
                    events.push(event);
                }
                games.push({...old,events,retained:true});
            }
            else games.push({key:game.key,source:game.source,url:game.url,available:false,capturedAt:null,retained:true,events:[]});
        }
    }
    if (!games.some(game => game.available)) throw new Error('Nenhum calendário pôde ser capturado. O artefato anterior foi mantido.');
    const used = new Set(games.flatMap(game=>game.events.map(event=>event.cover_url)));
    const catalogue = {schemaVersion:1,generatedAt:capturedAt,games,images:[...images.values()].filter(image=>used.has(image.path))};
    catalogue.revision = digest(JSON.stringify(catalogue));
    validateDemoCatalogue(catalogue);
    const temporary = join(directory,'catalogue.json.tmp');
    await writeFile(temporary,JSON.stringify(catalogue,null,2)+'\n');
    await rename(temporary,join(directory,'catalogue.json'));
    return catalogue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const catalogue = await captureDemoCatalogue();
    console.log(JSON.stringify({generatedAt:catalogue.generatedAt,games:catalogue.games.map(game=>({game:game.key,
        events:game.events.length,capturedAt:game.capturedAt,retained:game.retained})),images:catalogue.images.length},null,2));
}
