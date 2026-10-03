// Planned sources are available for fixture capture, but never for routes or writes.
export const EVENT_GAME_CATALOG = [
    { key: 'genshin', name: 'Genshin Impact', abbreviation: 'GI', source: 'starrailassistant-genshin', apiKey: 'ys' },
    { key: 'hsr', name: 'Honkai Star Rail', abbreviation: 'HSR', source: 'starrailassistant-hsr', apiKey: 'sr' },
    { key: 'zzz', name: 'Zenless Zone Zero', abbreviation: 'ZZZ', source: 'starrailassistant-zzz', apiKey: 'zzz' },
    { key: 'wuwa', name: 'Wuthering Waves', abbreviation: 'WuWa', source: 'starrailassistant-wuwa', apiKey: 'ww', status: 'planned' },
    { key: 'nte', name: 'Neverness to Everness', abbreviation: 'NTE', source: 'starrailassistant-nte', apiKey: 'nte', status: 'planned' },
].map(game => ({ status: 'active', ...game, url: `https://starrailassistant.top/api/v1/activity/${game.apiKey}-en-US.json` }));

export const EVENT_GAMES = EVENT_GAME_CATALOG.filter(game => game.status === 'active');

export function getCatalogGame(key) {
    const game = EVENT_GAME_CATALOG.find(game => game.key === key);
    if (!game) throw new Error(`Unsupported catalog game: ${key}`);
    return game;
}

export function getEventGame(key) {
    const game = EVENT_GAMES.find(game => game.key === key);
    if (!game) throw new Error(`Unsupported event game: ${key}`);
    return game;
}
