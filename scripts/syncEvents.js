import { EVENT_GAMES, getEventGame } from '../js/events/eventGames.js';
import { syncGameEvents } from './eventSync.js';

const gameArg = process.argv.find(arg => arg.startsWith('--game='));
const games = gameArg ? [getEventGame(gameArg.slice(7))] : EVENT_GAMES;
for (const game of games) {
    try {
        await syncGameEvents(game, { dryRun: process.argv.includes('--dry-run') });
    } catch (error) {
        console.error(`Failed to sync ${game.name}:`, error);
        process.exitCode = 1;
    }
}
