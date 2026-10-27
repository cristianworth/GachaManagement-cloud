export function validateAgendaEntry(value) {
    const result = { game_id: Number(value.game_id), kind: value.kind, title: String(value.title ?? '').trim(),
        version: String(value.version ?? '').trim(), starts_at: value.starts_at, ends_at: value.ends_at,
        source_url: String(value.source_url ?? '').trim(), image_url: String(value.image_url ?? '').trim(),
        timing_note: String(value.timing_note ?? '').trim() };
    if (!Number.isSafeInteger(result.game_id) || result.game_id <= 0) throw new Error('Escolha um jogo.');
    if (result.kind !== 'banner') throw new Error('Cadastre somente banners de personagens.');
    if (!result.title || result.title.length > 200 || result.version.length > 80) throw new Error('Informe um título de até 200 caracteres e versão de até 80.');
    if (result.timing_note.length > 300) throw new Error('Use até 300 caracteres na observação de horários.');
    for (const key of ['starts_at', 'ends_at']) {
        if (typeof result[key] !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result[key]) || !Number.isFinite(Date.parse(result[key]))) {
            throw new Error('Informe início e término válidos.');
        }
        result[key] = new Date(result[key]).toISOString();
    }
    if (Date.parse(result.ends_at) <= Date.parse(result.starts_at)) throw new Error('O término deve ser depois do início.');
    for (const key of ['source_url', 'image_url']) {
        if (!result[key]) continue;
        let url;
        try { url = new URL(result[key]); } catch { throw new Error('Use links HTTPS válidos.'); }
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /\s/.test(result[key])) throw new Error('Use links HTTPS válidos.');
    }
    return result;
}

export function agendaState(entry, now = new Date()) {
    return Date.parse(entry.ends_at) <= +now ? 'Encerrado' : Date.parse(entry.starts_at) > +now ? 'Em breve' : 'Em andamento';
}

export const formatAgendaDate = value => new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo',
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value));

export function getBannerVersionInfo(version = '') {
    const text = String(version).trim();
    const match = text.match(/^(.*?)\s*(?:[—–-]\s*)?(fase\s*([12])|versão inteira)$/i);
    return match ? {version:match[1].trim(), phase:match[3] ? Number(match[3]) : 'whole'} : {version:text, phase:null};
}

export function formatBannerVersion(version, phase) {
    const base = getBannerVersionInfo(version).version;
    if (!base) throw new Error('Informe a versão para agrupar os banners.');
    if (!['1','2','whole'].includes(String(phase))) throw new Error('Escolha a fase do banner.');
    return `${base} — ${phase === 'whole' ? 'versão inteira' : `Fase ${phase}`}`;
}

export function groupAgendaEntries(entries) {
    const result = [];
    const versions = new Map();
    for (const entry of entries) {
        if (!Number.isFinite(Date.parse(entry.starts_at)) || !Number.isFinite(Date.parse(entry.ends_at))
            || Date.parse(entry.ends_at) <= Date.parse(entry.starts_at)) continue;
        if (entry.kind !== 'banner') continue;
        const info = getBannerVersionInfo(entry.version);
        const key = JSON.stringify([entry.game_id,info.version.toLowerCase()]);
        if (!versions.has(key)) versions.set(key,[]);
        versions.get(key).push({entry,info});
    }
    for (const [versionKey, records] of versions) {
        const whole = records.filter(item=>item.info.phase === 'whole').map(item=>item.entry);
        const phases = new Map();
        for (const {entry,info} of records.filter(item=>item.info.phase !== 'whole')) {
            const key = info.phase && info.version ? String(info.phase) : `${entry.starts_at}|${entry.ends_at}`;
            if (!phases.has(key)) phases.set(key,{phase:info.phase,version:info.version,entries:[]});
            phases.get(key).entries.push(entry);
        }
        // A whole-version banner may be the only record covering the first half.
        // Use the confirmed second-half boundary, never an assumed 20-day midpoint.
        const second = phases.get('2');
        if (whole.length && second && !phases.has('1')) {
            const start = Math.min(...whole.map(item=>Date.parse(item.starts_at)));
            const boundary = Math.min(...second.entries.map(item=>Date.parse(item.starts_at)));
            if (start < boundary) phases.set('1',{phase:1,version:records[0].info.version,entries:[],
                starts_at:new Date(start).toISOString(),ends_at:new Date(boundary).toISOString(),endsAtNextPhase:true});
        }
        if (!phases.size && whole.length) phases.set('whole',{phase:'whole',version:records[0].info.version,entries:whole});
        for (const [phaseKey,phase] of phases) {
            const start = phase.starts_at ?? new Date(Math.min(...phase.entries.map(item=>Date.parse(item.starts_at)))).toISOString();
            const end = phase.ends_at ?? new Date(Math.max(...phase.entries.map(item=>Date.parse(item.ends_at)))).toISOString();
            const members = [...new Map([...phase.entries,...whole.filter(item=>Date.parse(item.starts_at)<Date.parse(end)
                && Date.parse(item.ends_at)>Date.parse(start))].map(item=>[item.id,item])).values()].sort((a,b)=>a.id-b.id);
            const anchor = phase.entries[0] ?? members[0];
            result.push({...anchor,kind:'banner',key:`${versionKey}:${phaseKey}`,version:phase.version,
                phase:phase.phase,title:phase.phase === 1 ? 'Primeira fase' : phase.phase === 2 ? 'Segunda fase'
                    : phase.phase === 'whole' ? 'Versão inteira' : 'Banner',members,
                triggers:phase.entries.length ? phase.entries : members,starts_at:start,ends_at:end,
                endsAtNextPhase:phase.endsAtNextPhase ?? false});
        }
    }
    return result;
}
