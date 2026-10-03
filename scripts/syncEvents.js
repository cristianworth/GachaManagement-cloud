import { pathToFileURL } from 'node:url';
import { EVENT_GAMES, getEventGame } from '../js/events/eventGames.js';
import { syncGameEvents } from './eventSync.js';

export async function runSync(args = [], sync = syncGameEvents) {
    const unknown = args.find(arg => arg !== '--dry-run' && !arg.startsWith('--game='));
    if (unknown) throw new Error(`Unknown sync argument: ${unknown}`);
    const gameArgs = args.filter(arg => arg.startsWith('--game='));
    if (gameArgs.length > 1) throw new Error('Choose a single --game argument.');
    const games = gameArgs.length ? [getEventGame(gameArgs[0].slice(7))] : EVENT_GAMES;
    const results = [];
    for (const game of games) {
        try {
            results.push({ gameKey: game.key, ok: true, summary: await sync(game, { dryRun: args.includes('--dry-run') }) });
        } catch (error) {
            console.error(`Failed to sync ${game.name}:`, error);
            results.push({ gameKey: game.key, ok: false, error });
        }
    }
    return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const results = await runSync(process.argv.slice(2));
        if (results.some(result => !result.ok)) process.exitCode = 1;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
