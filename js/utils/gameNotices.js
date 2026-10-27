import { groupAgendaEntries } from './gameAgenda.js';

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
        const phases = game.agenda.filter(item=>Array.isArray(item.members));
        const individual = game.agenda.filter(item=>!Array.isArray(item.members)).map(item=>({...item,game_id:game.id}));
        for (const entry of [...phases,...groupAgendaEntries(individual)]) {
            if (entry.kind !== 'banner' || !Number.isFinite(Date.parse(entry.starts_at))
                || !Number.isFinite(Date.parse(entry.ends_at)) || Date.parse(entry.ends_at) <= Date.parse(entry.starts_at)) continue;
            if (game.noticePreferences?.[entry.kind] === false) continue;
            const untilEnd = Date.parse(entry.ends_at) - instant;
            if (instant < Date.parse(entry.starts_at) || untilEnd > 48 * 3600_000 || untilEnd <= 0) continue;
            const stage = untilEnd <= 24 * 3600_000 ? '24h' : '48h';
            const triggers = entry.triggers ?? (entry.characters ? [entry] : entry.members);
            const contents = entry.members.map(member=>[member.kind,member.title,member.version,member.starts_at,member.ends_at]);
            const signature = JSON.stringify(['phase-end',entry.phase,entry.starts_at,entry.ends_at,contents]);
            const at = dateFormat.format(new Date(entry.starts_at));
            const end = dateFormat.format(new Date(entry.ends_at));
            const minutes = Math.ceil(untilEnd / 60_000);
            const countdown = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
            const title = `${entry.version ? `Versão ${entry.version}: ` : ''}${entry.title} — ${entry.members.map(member=>member.title).join(' / ')}`;
            const details = `${title}. Termina em ${countdown}. Período: ${at} até ${end} (Brasília).`;
            const text = `${details}${entry.timing_note ? ` ${entry.timing_note}` : ''}`;
            result.push({kind:'banner', state:'ending', text,
                gameId:game.id, gameName:game.description, abbreviation:game.abbreviation,
                agendaId:triggers[0].id, agendaIds:triggers.map(member=>member.id),
                displayLabel:entry.kind === 'banner' && entry.phase ? entry.title : null,
                key:`${game.id}:agenda:${triggers[0].id}`, startsAt:entry.starts_at, endsAt:entry.ends_at, signature, stage,
                unread:triggers.some(member=>member.read?.signature !== signature || member.read?.stage !== stage)});
        }
    }
    return result.sort((a,b) => Number(b.unread) - Number(a.unread)
        || Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.key.localeCompare(b.key));
}

export function validateNoticePreferences(value) {
    if (!value || typeof value.banner !== 'boolean') {
        throw new Error('Preferências de notificações inválidas.');
    }
    return { banner: value.banner };
}
