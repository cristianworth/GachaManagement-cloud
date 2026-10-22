export const GAME_DAILY_STATES = Object.freeze({
    pending: 'Pendente',
    return_later: 'Voltar depois',
    done: 'Feito por hoje',
});

// Known America server resets use fixed UTC offsets. Other games use Cristian's
// chosen default of 06:00 Brasilia (09:00 UTC); this is a personal tracking rule.
const RESET_HOURS_UTC = Object.freeze({ GI: 9, HSR: 9, ZZZ: 9, WuWa: 9, NTE: 10 });
const DAY_MS = 24 * 60 * 60_000;

export function getGameDailyCycleStart(abbreviation, now = new Date()) {
    const hour = Object.hasOwn(RESET_HOURS_UTC, abbreviation) ? RESET_HOURS_UTC[abbreviation] : 9;
    const instant = new Date(now).getTime();
    if (hour === undefined || !Number.isFinite(instant)) return null;
    const offset = hour * 60 * 60_000;
    return new Date(Math.floor((instant - offset) / DAY_MS) * DAY_MS + offset).toISOString();
}

export function sortGamesByDailyState(games, now = new Date()) {
    const rank = {pending:0,return_later:1,done:2};
    return games.map((game, index) => {
        const deadline = game.dateMaxStamina ? new Date(game.dateMaxStamina).getTime() : NaN;
        return {game,index,rank:rank[getGameDailyState(game, now)] ?? 0,
            deadline:Number.isFinite(deadline) ? deadline : Infinity};
    }).sort((a,b) => a.rank-b.rank || a.deadline-b.deadline || a.index-b.index).map(item => item.game);
}

export function getGameDailyState(game, now = new Date()) {
    const cycle = getGameDailyCycleStart(game.abbreviation, now);
    if (!cycle) return null;
    const saved = game.dailyState;
    return saved?.cycle_start === cycle && Object.hasOwn(GAME_DAILY_STATES, saved.state)
        ? saved.state : 'pending';
}

export function createGameDailyState(abbreviation, state, now = new Date()) {
    const cycle = getGameDailyCycleStart(abbreviation, now);
    if (!cycle) throw new Error('Não foi possível determinar o ciclo diário deste jogo.');
    if (!Object.hasOwn(GAME_DAILY_STATES, state)) throw new Error('Estado diário inválido.');
    return { state, cycle_start: cycle };
}
