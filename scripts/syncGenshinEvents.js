import { pathToFileURL } from 'node:url';
import { getEventGame } from '../js/events/eventGames.js';
import { syncGameEvents } from './eventSync.js';
export { LEGACY_GENSHIN_EVENT_SOURCE, candidateFromActivity, reconcileCandidate } from './eventSync.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    syncGameEvents(getEventGame('genshin'), { dryRun: process.argv.includes('--dry-run') }).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
