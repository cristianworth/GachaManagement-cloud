import { EVENT_GAMES } from '../js/events/eventGames.js';
import { allGames } from '../js/data/Game.js';

const icons = new Set(allGames.map(game => game.img));
export const hasDemoEventCover = value => /^img\/demo-events\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(value ?? '');
// Read old snapshots so existing visitors can upgrade without resetting their data.
export const isDemoCover = value => icons.has(value) || hasDemoEventCover(value);
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

export const isCurrentDemoEvent = (event, now) => event.proposed_end_at
    ? Date.parse(event.proposed_end_at) > now
    : !event.source_end_at || Date.parse(event.source_end_at) > now;

export const isVisibleDemoTask = (task, now) => hasDemoEventCover(task.cover_url)
    && (task.expiration_date == null || Date.parse(task.expiration_date) > now);

export function validateDemoCatalogue(value) {
    if (value?.schemaVersion !== 1 || !instant(value.generatedAt) || !/^[a-f0-9]{64}$/.test(value.revision ?? '')
        || !Array.isArray(value.games) || value.games.length !== EVENT_GAMES.length) throw new Error('Catálogo da demo inválido.');
    const keys = new Set();
    for (const entry of value.games) {
        const game = EVENT_GAMES.find(game => game.key === entry.key);
        if (!game || keys.has(entry.key) || entry.source !== game.source || typeof entry.available !== 'boolean'
            || (entry.available && !instant(entry.capturedAt)) || !Array.isArray(entry.events)) throw new Error('Fonte da demo inválida.');
        keys.add(entry.key);
        const ids = new Set();
        for (const event of entry.events) {
            if (!entry.available || event.source !== game.source || typeof event.external_id !== 'string' || !event.external_id
                || event.external_id.length > 1000 || ids.has(event.external_id) || typeof event.name !== 'string' || !event.name.trim()
                || !isDemoCover(event.cover_url) || (event.review_reason != null && typeof event.review_reason !== 'string')
                || ['source_start_at','source_end_at','proposed_start_at','proposed_end_at'].some(key => event[key] != null && !instant(event[key]))) {
                throw new Error('Evento da demo inválido.');
            }
            ids.add(event.external_id);
        }
    }
    return value;
}

export function describeDemoCatalogue(catalogue, now = Date.now()) {
    const date = new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'short' });
    const available = catalogue.games.filter(game => game.available);
    const stale = catalogue.games.filter(game => !game.available || game.retained || now - Date.parse(game.capturedAt) > 48 * 3600_000);
    const oldest = available.length ? Math.min(...available.map(game => Date.parse(game.capturedAt))) : null;
    const names = stale.map(entry => EVENT_GAMES.find(game => game.key === entry.key).name);
    return `${oldest ? `Eventos da API · última coleta em ${date.format(oldest)} (Brasília).` : 'Eventos da API ainda indisponíveis.'}`
        + (names.length ? ` Coleta pendente para ${names.join(', ')}. Os dados disponíveis foram mantidos.` : '')
        + ' Banners e progresso são exemplos da demo.';
}
