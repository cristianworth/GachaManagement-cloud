const ASIA_OFFSET = '+08:00';
const MAX_SERVER_DIFFERENCE_MS = 13 * 60 * 60 * 1000;
const SOURCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function toUtc(value, offset) {
    if (typeof value !== 'string' || !SOURCE_DATE_PATTERN.test(value)) return null;
    const date = new Date(`${value}${offset}`);
    if (Number.isNaN(date.getTime())) return null;
    // Date accepts impossible days by rolling into the next month. Keep them in review.
    const local = new Date(`${value}Z`);
    if (local.toISOString().slice(0, 19) !== value) return null;
    return date.toISOString();
}

// The API has no activity ID. A name key lets recurring runs update the same candidate.
export function activityKey(name) {
    return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeStarRailAssistantActivities(calendar, now = Date.now()) {
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
        // Treat reset boundaries as server time; the reviewer can still adjust the proposal.
        // Other deadlines still give the reviewer a usable starting value.
        const proposedEndAt = serverTimeDeadline
            ? toUtc(activity.endTime, '-05:00')
            : sourceEndAt;
        const coverUrl = typeof activity.cover === 'string' && activity.cover.startsWith('https://')
            ? activity.cover
            : null;

        const proposedStartAt = validRange && activity.startTime.endsWith('T04:00:00')
            ? toUtc(activity.startTime, '-05:00')
            : sourceStartAt;

        events.push({
            name,
            rawStartTime: activity.startTime ?? null,
            rawEndTime: activity.endTime ?? null,
            sourceStartAt,
            proposedStartAt,
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
