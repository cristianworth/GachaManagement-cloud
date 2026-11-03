import { getEventGame } from './eventGames.js';
import { activityKey, normalizeStarRailAssistantActivities } from './starRailAssistant.js';
import { resolveWuwaTimes } from './wuwa.js';
import { resolveNteTimes } from './nte.js';

// Public discovery contracts shared by the production synchronizer and static demo.
// This module has no database configuration, client or side effects.
export function candidateFromActivity(activity, game = getEventGame('genshin'), gameId) {
    return {
        source: game.source,
        ...(gameId !== undefined ? { game_id: gameId } : {}),
        external_id: game.identity === 'edition'
            ? `${activityKey(activity.name)}::${activity.sourceStartAt ?? activity.sourceEndAt ?? 'undated'}`
            : activityKey(activity.name),
        name: activity.name,
        type_name: null,
        source_start_at: activity.sourceStartAt,
        proposed_start_at: Object.hasOwn(activity, 'proposedStartAt') ? activity.proposedStartAt : activity.sourceStartAt,
        source_end_at: activity.sourceEndAt,
        proposed_end_at: activity.proposedEndAt,
        cover_url: activity.coverUrl,
        review_reason: activity.reviewReason,
    };
}

export function assignEditionKeys(candidates, existing) {
    for (const candidate of candidates) {
        const start = Date.parse(candidate.source_start_at);
        const end = Date.parse(candidate.source_end_at);
        if (candidates.some(row => row !== candidate && row.source === candidate.source &&
            activityKey(row.name) === activityKey(candidate.name) && !disjointPeriods(candidate, row))) {
            throw new Error('Calendar contains repeated activity names or ambiguous editions; refusing overlapping or incomplete occurrences.');
        }
        const history = existing.filter(row => row.source === candidate.source && activityKey(row.name) === activityKey(candidate.name));
        const matches = history.filter(row => row.external_id === candidate.external_id ||
            (candidate.source_start_at && sameInstant(row.source_start_at, candidate.source_start_at)) ||
            (!candidate.source_start_at && candidate.source_end_at && sameInstant(row.source_end_at, candidate.source_end_at)) ||
            (start < Date.parse(row.source_end_at) && Date.parse(row.source_start_at) < end));
        if (matches.length > 1) throw new Error(`Ambiguous edition for ${candidate.name}; refusing to change existing decisions.`);
        if (history.some(row => !matches.includes(row) && !disjointPeriods(candidate, row)
            && (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(Date.parse(row.source_start_at)) || !Number.isFinite(Date.parse(row.source_end_at))))) {
            throw new Error(`Ambiguous edition for ${candidate.name}: missing period; refusing to inherit decisions.`);
        }
        if (matches.length === 1) candidate.external_id = matches[0].external_id;
    }
    if (new Set(candidates.map(row => row.external_id)).size !== candidates.length) {
        throw new Error('Calendar contains repeated activity names or ambiguous editions; cannot assign stable candidate keys.');
    }
    return candidates;
}

function disjointPeriods(left, right) {
    return Date.parse(left.source_start_at) >= Date.parse(right.source_end_at)
        || Date.parse(right.source_start_at) >= Date.parse(left.source_end_at);
}
function sameInstant(left, right) {
    return left === right || (left && right && Date.parse(left) === Date.parse(right));
}

export function discoverEventCandidates(calendar, game, now = Date.now()) {
    if (!Number.isFinite(now)) throw new Error('Sync time must be a finite timestamp.');
    const resolveTimes = game.timePolicy === 'wuwa-america' ? resolveWuwaTimes
        : game.timePolicy === 'nte-america' ? resolveNteTimes : undefined;
    const { events, skipped } = normalizeStarRailAssistantActivities(calendar, now, { resolveTimes });
    if (!events.length) throw new Error('Calendar has no current events; refusing to hide existing candidates.');
    const candidates = events.map(activity => candidateFromActivity(activity, game));
    if (game.identity === 'edition') assignEditionKeys(candidates, []);
    return { candidates, skipped };
}
