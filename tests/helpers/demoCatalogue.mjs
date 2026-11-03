import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { EVENT_GAMES } from '../../js/events/eventGames.js';

export const DEMO_CLOCK = Date.parse('2099-01-01T12:00:00Z');
export const demoImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
export const demoImageHash = createHash('sha256').update(demoImage).digest('hex');
export const demoImagePath = `img/demo-events/${demoImageHash}.png`;

export function demoCatalogue({now = DEMO_CLOCK, revision = 'a'.repeat(64)} = {}) {
    return {schemaVersion:1,revision,generatedAt:new Date(now).toISOString(),images:[],games:EVENT_GAMES.map(game=>({
        key:game.key,source:game.source,url:game.url,available:true,retained:false,capturedAt:new Date(now).toISOString(),events:[{
            source:game.source,external_id:`sample-${game.key}::2099-01-01T09:00:00.000Z`,name:`API sample ${game.abbreviation}`,
            source_start_at:'2099-01-01T09:00:00.000Z',source_end_at:'2099-01-10T08:59:59.000Z',
            proposed_start_at:'2099-01-01T09:00:00.000Z',proposed_end_at:'2099-01-10T08:59:59.000Z',
            cover_url:demoImagePath,review_reason:null,
        }],
    }))};
}

export async function writeDemoCatalogueFixture(name = 'fixture') {
    const directory = resolve('.local-deliveries/public-demo',name);
    await mkdir(join(directory,'images'),{recursive:true});
    await writeFile(join(directory,'catalogue.json'),JSON.stringify(demoCatalogue()));
    await writeFile(join(directory,'images',`${demoImageHash}.png`),demoImage);
    return directory;
}
