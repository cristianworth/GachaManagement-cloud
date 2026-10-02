export const STAR_RAIL_ASSISTANT_GENSHIN_URL =
    'https://starrailassistant.top/api/v1/activity/ys-en-US.json';
export const STAR_RAIL_ASSISTANT_GENSHIN_SOURCE = 'starrailassistant-genshin';

const ASIA_OFFSET = '+08:00';
const MAX_SERVER_DIFFERENCE_MS = 13 * 60 * 60 * 1000;
const SOURCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function toUtc(value, offset) {
    if (typeof value !== 'string' || !SOURCE_DATE_PATTERN.test(value)) return null;
    const date = new Date(`${value}${offset}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The API has no activity ID. A name key lets recurring runs update the same candidate.
export function genshinActivityKey(name) {
    return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeStarRailAssistantGenshin(calendar, now = Date.now()) {
    if (!Array.isArray(calendar?.activities)) {
        throw new Error('StarRailAssistant response does not contain an activities array');
    }

    const events = [];
    let skipped = 0;

    for (const activity of calendar.activities) {
        const name = typeof activity?.name === 'string' ? activity.name.trim() : '';
        if (!name) {
            skipped++;
            continue;
        }

        const sourceStartAt = toUtc(activity.startTime, ASIA_OFFSET);
        const sourceEndAt = toUtc(activity.endTime, ASIA_OFFSET);
        if (sourceEndAt && Date.parse(sourceEndAt) + MAX_SERVER_DIFFERENCE_MS <= now) {
            skipped++;
            continue;
        }

        const validRange = sourceStartAt && sourceEndAt && sourceStartAt < sourceEndAt;
        const serverTimeDeadline = validRange && activity.endTime.endsWith('T03:59:59');
        // Only the 03:59:59 server-time pattern has a verified America conversion.
        // Other deadlines still give the reviewer a usable starting value.
        const proposedEndAt = serverTimeDeadline
            ? toUtc(activity.endTime, '-05:00')
            : sourceEndAt;
        const coverUrl = typeof activity.cover === 'string' && activity.cover.startsWith('https://')
            ? activity.cover
            : null;

        events.push({
            name,
            rawStartTime: activity.startTime ?? null,
            rawEndTime: activity.endTime ?? null,
            sourceStartAt,
            sourceEndAt,
            proposedEndAt,
            coverUrl,
            reviewReason: !sourceEndAt
                ? 'Data final ausente/inválida na fonte; informe o prazo manualmente.'
                : !validRange
                    ? 'Data de início ausente/inválida na fonte; confira o prazo antes de aprovar.'
                : !serverTimeDeadline
                    ? 'Prazo inicial usa o horário informado para Ásia; ajuste se o servidor América encerrar em outro horário.'
                    : null,
        });
    }

    return { events, skipped };
}
