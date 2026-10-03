import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getCatalogGame } from '../js/events/eventGames.js';

export async function captureEventFixture(key) {
    const game = getCatalogGame(key);
    const response = await fetch(game.url);
    if (!response.ok) throw new Error(`Fixture request failed with HTTP ${response.status}`);
    const raw = (await response.text()).replace(/\r\n/g, '\n');
    const calendar = JSON.parse(raw);
    if (!Array.isArray(calendar.activities) || !calendar.activities.length) {
        throw new Error('Refusing to replace a fixture with a missing or empty activities array.');
    }
    const file = `${game.apiKey}-en-US.json`;
    const manifestUrl = new URL('../tests/fixtures/manifest.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const capturedAt = new Date().toISOString();
    manifest[key] = { file, url: game.url, locale: 'en-US', capturedAt, referenceTime: capturedAt,
        sha256: createHash('sha256').update(raw).digest('hex'), activityCount: calendar.activities.length };
    await writeFile(new URL(`../tests/fixtures/${file}`, import.meta.url), raw);
    await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${game.name}: ${calendar.activities.length} activities captured in ${file}. Review expected dates and counts before committing.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.length !== 3) throw new Error('Usage: node scripts/captureEventFixture.js <game-key>');
        await captureEventFixture(process.argv[2]);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
