import { readFile } from 'node:fs/promises';
import { BANNER_GAMES, validateBannerCatalogue } from '../js/utils/bannerCatalogue.js';

const requested = process.argv.slice(2);
const games = requested.length ? BANNER_GAMES.filter(game=>requested.some(value=>value.toLowerCase() === game.abbreviation.toLowerCase())) : BANNER_GAMES;
if (requested.some(value=>!games.some(game=>game.abbreviation.toLowerCase() === value.toLowerCase()))) {
    throw new Error('Use GI, HSR, ZZZ, WuWa ou NTE, ou nenhum argumento para validar todos.');
}
let total = 0;
for (const game of games) {
    const data = JSON.parse(await readFile(new URL(`../js/data/banners/${game.file}`,import.meta.url),'utf8'));
    total += validateBannerCatalogue(data,game.abbreviation).length;
}
console.log(`${games.length} jogos e ${total} fases válidas.`);
