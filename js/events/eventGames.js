export const EVENT_GAMES = [
    { key: 'genshin', name: 'Genshin Impact', abbreviation: 'GI', source: 'starrailassistant-genshin', apiKey: 'ys' },
    { key: 'hsr', name: 'Honkai Star Rail', abbreviation: 'HSR', source: 'starrailassistant-hsr', apiKey: 'sr' },
    { key: 'zzz', name: 'Zenless Zone Zero', abbreviation: 'ZZZ', source: 'starrailassistant-zzz', apiKey: 'zzz' },
].map(game => ({ ...game, url: `https://starrailassistant.top/api/v1/activity/${game.apiKey}-en-US.json` }));

export function getEventGame(key) {
    const game = EVENT_GAMES.find(game => game.key === key);
    if (!game) throw new Error(`Unsupported event game: ${key}`);
    return game;
}
