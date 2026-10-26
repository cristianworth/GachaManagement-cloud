const BRASILIA_OFFSET = 3 * 60 * 60_000;
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
});

export function toBrasiliaInput(value) {
    const instant = value ? Date.parse(value) : NaN;
    return Number.isFinite(instant) ? new Date(instant - BRASILIA_OFFSET).toISOString().slice(0, 16) : '';
}

export function fromBrasiliaInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Informe uma data e hora válidas.');
    const instant = new Date(`${value}:00-03:00`);
    if (!Number.isFinite(instant.getTime()) || toBrasiliaInput(instant.toISOString()) !== value) {
        throw new Error('Informe uma data e hora válidas.');
    }
    return instant.toISOString();
}

export function getGameNotifications(games, now = new Date()) {
    const instant = new Date(now).getTime();
    if (!Number.isFinite(instant)) return [];
    const result = [];
    for (const game of games.filter(game => Array.isArray(game.agenda))) {
        for (const entry of game.agenda) {
            if (!['maintenance', 'banner'].includes(entry.kind) || !Number.isFinite(Date.parse(entry.starts_at))
                || !Number.isFinite(Date.parse(entry.ends_at)) || Date.parse(entry.ends_at) <= Date.parse(entry.starts_at)) continue;
            if (game.noticePreferences?.[entry.kind] === false) continue;
            const untilStart = Date.parse(entry.starts_at) - instant;
            const ongoing = untilStart <= 0;
            if (untilStart > 48 * 3600_000 || instant >= Date.parse(entry.ends_at) || (entry.kind === 'banner' && ongoing)) continue;
            const stage = ongoing ? 'ongoing' : untilStart <= 24 * 3600_000 ? '24h' : '48h';
            const signature = JSON.stringify([entry.kind, entry.title, entry.version, entry.starts_at, entry.ends_at]);
            const at = dateFormat.format(new Date(entry.starts_at));
            const end = dateFormat.format(new Date(entry.ends_at));
            const minutes = Math.ceil((Date.parse(ongoing ? entry.ends_at : entry.starts_at) - instant) / 60_000);
            const countdown = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
            const title = `${entry.version ? `Versão ${entry.version}: ` : ''}${entry.title}`;
            const details = entry.kind === 'banner' ? `Próximo banner: ${title} — em ${countdown}. ${at} até ${end} (Brasília).`
                : `${title}. ${ongoing ? `Manutenção prevista em andamento. Retorno em ${countdown}.` : `Manutenção em ${countdown}.`} Início: ${at}. Retorno previsto: ${end} (Brasília).`;
            const text = `${details}${entry.timing_note ? ` ${entry.timing_note}` : ''}`;
            result.push({kind:entry.kind, state:ongoing ? 'ongoing' : 'upcoming', text,
                gameId:game.id, gameName:game.description, abbreviation:game.abbreviation,
                agendaId:entry.id, key:`${game.id}:agenda:${entry.id}`, startsAt:entry.starts_at, signature, stage,
                unread:entry.read?.signature !== signature || entry.read?.stage !== stage});
        }
    }
    return result.sort((a,b) => Number(b.unread) - Number(a.unread)
        || Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.key.localeCompare(b.key));
}

export function validateNoticePreferences(value) {
    if (!value || typeof value.maintenance !== 'boolean' || typeof value.banner !== 'boolean') {
        throw new Error('Preferências de notificações inválidas.');
    }
    return { maintenance: value.maintenance, banner: value.banner };
}
