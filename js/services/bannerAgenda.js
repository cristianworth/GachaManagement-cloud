import { BANNER_GAMES, bannerPhasesFromData } from '../utils/bannerCatalogue.js';
import { getAppBasePath } from '../utils/appPaths.js';

let cached = null;
let loadedAt = 0;
let pending = null;
const CACHE_MS = 6 * 60_000;

export async function fetchBannerAgenda({force = false} = {}) {
    if (pending) return pending;
    if (!force && cached && Date.now() >= loadedAt && Date.now() - loadedAt < CACHE_MS) return cached;
    pending = Promise.all(BANNER_GAMES.map(async game=>{
        const url = new URL(`${getAppBasePath(window.location)}/js/data/banners/${game.file}`,window.location.href);
        const response = await fetch(url, {cache:'no-store'});
        if (!response.ok) throw new Error(`Falha ao ler os banners de ${game.name}.`);
        return bannerPhasesFromData(await response.json(), game);
    })).then(files=>{
        cached = files.flat(); loadedAt = Date.now(); return cached;
    });
    try { return await pending; }
    finally { pending = null; }
}
