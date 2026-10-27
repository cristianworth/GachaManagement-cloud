export const BANNER_GAMES = Object.freeze([
    {abbreviation:'GI', name:'Genshin Impact', file:'gi.json'},
    {abbreviation:'HSR', name:'Honkai Star Rail', file:'hsr.json'},
    {abbreviation:'ZZZ', name:'Zenless Zone Zero', file:'zzz.json'},
    {abbreviation:'WuWa', name:'Wuthering Waves', file:'wuwa.json'},
    {abbreviation:'NTE', name:'Neverness to Everness', file:'nte.json'},
]);

export const isBannerPhaseId = value => typeof value === 'string' && /^[a-z0-9]+-[a-z0-9.-]+-phase-[12]$/.test(value) && value.length <= 100;

function https(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !/\s/.test(value); }
    catch { return false; }
}

function validInstant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return false;
    const instant = Date.parse(value);
    if (!Number.isFinite(instant)) return false;
    const offset = value.match(/([+-])(\d\d):(\d\d)$/);
    const minutes = offset ? (Number(offset[2])*60+Number(offset[3])) * (offset[1] === '+' ? 1 : -1) : 0;
    return new Date(instant+minutes*60_000).toISOString().slice(0,19) === value.slice(0,19);
}

export function validateBannerCatalogue(value, abbreviation) {
    if (!Array.isArray(value)) throw new Error(`${abbreviation}: o catálogo deve ser uma lista.`);
    const ids = new Set();
    const versions = new Set();
    for (const phase of value) {
        if (!phase || !isBannerPhaseId(phase.id) || !phase.id.startsWith(`${abbreviation.toLowerCase()}-`)
            || ids.has(phase.id)) throw new Error(`${abbreviation}: ID de fase inválido ou duplicado.`);
        ids.add(phase.id);
        if (typeof phase.version !== 'string' || !phase.version.trim() || phase.version.length > 50 || ![1,2].includes(phase.phase)) {
            throw new Error(`${phase.id}: informe versão e fase 1 ou 2.`);
        }
        if (phase.id !== `${abbreviation.toLowerCase()}-${phase.version}-phase-${phase.phase}`) throw new Error(`${phase.id}: ID deve acompanhar jogo, versão e fase.`);
        const key = `${phase.version}:${phase.phase}`;
        if (versions.has(key)) throw new Error(`${phase.id}: versão/fase duplicada.`);
        versions.add(key);
        for (const field of ['starts_at','ends_at']) {
            if (!validInstant(phase[field])) throw new Error(`${phase.id}: ${field} precisa de data válida com fuso explícito.`);
        }
        if (Date.parse(phase.ends_at) <= Date.parse(phase.starts_at)) throw new Error(`${phase.id}: término deve ser posterior ao início.`);
        if (!Array.isArray(phase.sources) || !phase.sources.length || !phase.sources.every(https)) throw new Error(`${phase.id}: informe fontes HTTPS.`);
        if (phase.timing_note != null && (typeof phase.timing_note !== 'string' || phase.timing_note.length > 500)) throw new Error(`${phase.id}: observação inválida.`);
        if (!Array.isArray(phase.characters) || !phase.characters.length) throw new Error(`${phase.id}: informe personagens.`);
        const names = new Set();
        for (const character of phase.characters) {
            if (!character || typeof character.name !== 'string' || !character.name.trim() || character.name.length > 200
                || names.has(character.name.trim().toLowerCase())) throw new Error(`${phase.id}: personagem inválido ou duplicado.`);
            names.add(character.name.trim().toLowerCase());
            if (character.image_url && !https(character.image_url)) throw new Error(`${phase.id}: imagem precisa de HTTPS.`);
            if (character.whole_version != null && typeof character.whole_version !== 'boolean') throw new Error(`${phase.id}: versão inteira precisa de booleano.`);
        }
    }
    for (const phase of value.filter(item=>item.phase === 1)) {
        const second = value.find(item=>item.version === phase.version && item.phase === 2);
        if (second && Date.parse(phase.ends_at)>Date.parse(second.starts_at)) throw new Error(`${phase.id}: primeira fase sobrepõe a segunda.`);
    }
    return value;
}

export function bannerPhasesFromData(data, game) {
    return validateBannerCatalogue(data, game.abbreviation).map(phase => ({...phase,
        abbreviation:game.abbreviation, game_name:game.name, kind:'banner',
        title:phase.phase === 1 ? 'Primeira fase' : 'Segunda fase', source_url:phase.sources[0],
        members:phase.characters.map(character=>({title:character.name,image_url:character.image_url ?? '',whole_version:character.whole_version === true})),
    }));
}

export function attachBannerAgenda(games, catalogue) {
    return games.map(game=>({...game,agenda:catalogue.filter(phase=>phase.abbreviation === game.abbreviation)
        .map(phase=>({...phase,read:game.bannerReads?.[phase.id] ?? null}))}));
}
