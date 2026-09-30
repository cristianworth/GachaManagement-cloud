export const GENSHIN_CALENDAR_URL = 'https://api.ennead.cc/mihoyo/genshin/calendar?lang=en-us';
export const GENSHIN_EVENT_SOURCE = 'ennead-genshin-calendar';

const SERVER_OFFSET_MS = 13 * 60 * 60 * 1000;
const EXCLUDED_TYPES = new Set(['Test Run', 'In-Person', 'Web']);

function timestampToIso(value) {
    if (!Number.isInteger(value) || value <= 0) return null;
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hasStandardServerDeadline(isoDate) {
    // 03:59:59 on the Asia server (UTC+8) is 19:59:59 UTC on the previous day.
    return isoDate?.slice(11, 19) === '19:59:59';
}

export function normalizeGenshinEvents(calendar, now = Date.now()) {
    if (!Array.isArray(calendar?.events)) {
        throw new Error('Calendar response does not contain an events array');
    }

    const candidates = [];
    let skipped = 0;

    for (const event of calendar.events) {
        if (!Number.isInteger(event.id) || event.id <= 0 ||
            typeof event.name !== 'string' || !event.name.trim() ||
            EXCLUDED_TYPES.has(event.type_name)) {
            skipped++;
            continue;
        }

        const sourceStartAt = timestampToIso(event.start_time);
        const sourceEndAt = timestampToIso(event.end_time);
        if (sourceEndAt && Date.parse(sourceEndAt) + SERVER_OFFSET_MS <= now) {
            skipped++;
            continue;
        }

        const validRange = sourceStartAt && sourceEndAt && sourceStartAt < sourceEndAt;
        const standardDeadline = validRange && hasStandardServerDeadline(sourceEndAt);
        const proposedEndAt = standardDeadline
            ? new Date(Date.parse(sourceEndAt) + SERVER_OFFSET_MS).toISOString()
            : null;
        const reviewReason = !validRange
            ? 'Data de início ou fim ausente/inválida na fonte.'
            : !standardDeadline
                ? 'Horário final diferente de 03:59:59 no servidor Ásia; conferir regra do evento.'
                : null;

        candidates.push({
            source: GENSHIN_EVENT_SOURCE,
            external_id: String(event.id),
            name: event.name.trim(),
            type_name: event.type_name ?? null,
            source_start_at: sourceStartAt,
            source_end_at: sourceEndAt,
            proposed_end_at: proposedEndAt,
            review_reason: reviewReason,
        });
    }

    return { candidates, skipped };
}
