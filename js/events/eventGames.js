// Only active sources participate in routes and writes; catalog entries can also stay planned.
export const EVENT_GAME_CATALOG = [
    { key: 'genshin', name: 'Genshin Impact', abbreviation: 'GI', source: 'starrailassistant-genshin', apiKey: 'ys' },
    { key: 'hsr', name: 'Honkai Star Rail', abbreviation: 'HSR', source: 'starrailassistant-hsr', apiKey: 'sr' },
    { key: 'zzz', name: 'Zenless Zone Zero', abbreviation: 'ZZZ', source: 'starrailassistant-zzz', apiKey: 'zzz' },
    { key: 'wuwa', name: 'Wuthering Waves', abbreviation: 'WuWa', source: 'starrailassistant-wuwa', apiKey: 'ww', timePolicy: 'wuwa-america', identity: 'edition', referenceUrl: 'https://game8.co/games/Wuthering-Waves/archives/453473' },
    { key: 'nte', name: 'Neverness to Everness', abbreviation: 'NTE', source: 'starrailassistant-nte', apiKey: 'nte', timePolicy: 'nte-america', identity: 'edition', referenceUrl: 'https://game8.co/games/Neverness-to-Everness/archives/598313' },
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
