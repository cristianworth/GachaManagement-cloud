import {readFileSync} from 'node:fs';
import {BANNER_GAMES} from '../../js/utils/bannerCatalogue.js';

export function mockBannerFiles(t) {
    const state={files:Object.fromEntries(BANNER_GAMES.map(game=>[game.file,JSON.parse(readFileSync(new URL(`../../js/data/banners/${game.file}`,import.meta.url),'utf8'))])),requests:[],error:null,beforeRead:null};
    t.mock.method(globalThis,'fetch',async(url,options)=>{
        const file=String(url).split('/').at(-1);
        if (!BANNER_GAMES.some(game=>game.file===file)) throw new Error(`Unexpected network request: ${url}`);
        state.requests.push({url:String(url),options});
        await state.beforeRead?.(file);
        if(state.error) throw new Error(state.error);
        return {ok:true,json:async()=>structuredClone(state.files[file])};
    });
    return state;
}
