export function validateAgendaEntry(value) {
    const result = { game_id: Number(value.game_id), kind: value.kind, title: String(value.title ?? '').trim(),
        version: String(value.version ?? '').trim(), starts_at: value.starts_at, ends_at: value.ends_at,
        source_url: String(value.source_url ?? '').trim(), image_url: String(value.image_url ?? '').trim(),
        timing_note: String(value.timing_note ?? '').trim() };
    if (!Number.isSafeInteger(result.game_id) || result.game_id <= 0) throw new Error('Escolha um jogo.');
    if (!['maintenance', 'banner'].includes(result.kind)) throw new Error('Escolha manutenção ou banner.');
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
