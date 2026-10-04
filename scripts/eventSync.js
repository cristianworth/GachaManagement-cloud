import { getEventGame } from '../js/events/eventGames.js';
import { activityKey, normalizeStarRailAssistantActivities } from '../js/events/starRailAssistant.js';
import { resolveWuwaTimes } from '../js/events/wuwa.js';
import { resolveNteTimes } from '../js/events/nte.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config/supabase.config.js';

export const LEGACY_GENSHIN_EVENT_SOURCE = 'ennead-genshin-calendar';

async function readJson(response, label) {
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
}

async function fetchCalendar(game) {
    return readJson(await fetch(game.url), `StarRailAssistant ${game.name}`);
}

function databaseUrl(path) {
    const base = process.env.SUPABASE_URL || SUPABASE_URL;
    if (!base || !base.startsWith('https://')) {
        throw new Error('Set SUPABASE_URL to the HTTPS Supabase project URL.');
    }
    return new URL(`/rest/v1/${path}`, base);
}

async function databaseRequest(url, options = {}) {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY;
    if (!key) throw new Error('Set SUPABASE_PUBLISHABLE_KEY or configure the public key in the app.');

    const response = await fetch(url, {
        ...options,
        headers: {
            apikey: key,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!response.ok) {
        throw new Error(`Supabase request failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response;
}

async function fetchExistingCandidates(game) {
    const url = databaseUrl('event_candidates');
    url.searchParams.set('select', '*');
    url.searchParams.set('source', game.key === 'genshin'
        ? `in.(${game.source},${LEGACY_GENSHIN_EVENT_SOURCE})` : `eq.${game.source}`);
    const response = await databaseRequest(url);
    return response.json();
}

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

// Reuse persisted edition keys when deadlines change. Disjoint periods create a new edition.
export function assignEditionKeys(candidates, existing) {
    for (const candidate of candidates) {
        const start = Date.parse(candidate.source_start_at);
        const end = Date.parse(candidate.source_end_at);
        if (candidates.some(row => row !== candidate && row.source === candidate.source &&
            activityKey(row.name) === activityKey(candidate.name) &&
            start < Date.parse(row.source_end_at) && Date.parse(row.source_start_at) < end)) {
            throw new Error('Calendar contains repeated activity names or ambiguous editions; refusing overlapping occurrences.');
        }
        const matches = existing.filter(row => row.source === candidate.source && activityKey(row.name) === activityKey(candidate.name))
            .filter(row => row.external_id === candidate.external_id ||
                (candidate.source_start_at && sameInstant(row.source_start_at, candidate.source_start_at)) ||
                (!candidate.source_start_at && candidate.source_end_at && sameInstant(row.source_end_at, candidate.source_end_at)) ||
                (start < Date.parse(row.source_end_at) && Date.parse(row.source_start_at) < end));
        if (matches.length > 1) throw new Error(`Ambiguous edition for ${candidate.name}; refusing to change existing decisions.`);
        if (matches.length === 1) candidate.external_id = matches[0].external_id;
    }
    if (new Set(candidates.map(row => row.external_id)).size !== candidates.length) {
        throw new Error('Calendar contains repeated activity names or ambiguous editions; cannot assign stable candidate keys.');
    }
    return candidates;
}

function sameInstant(left, right) {
    return left === right || (left && right && Date.parse(left) === Date.parse(right));
}

export function reconcileCandidate(existing, candidate, seenAt) {
    if (!existing) return { ...candidate, status: 'pending', is_active: true, last_seen_at: seenAt };

    const next = {
        ...candidate,
        is_active: true,
        status: existing.status,
        review_reason: candidate.review_reason,
        last_seen_at: seenAt,
    };
    next.changed = ['source', 'external_id', 'game_id', 'name', 'type_name', 'cover_url', 'review_reason', 'status', 'is_active']
        .some(field => existing[field] !== next[field]) ||
        ['source_start_at', 'source_end_at', 'proposed_start_at', 'proposed_end_at']
            .some(field => !sameInstant(existing[field], next[field]));
    return next;
}

async function saveCandidate(existing, candidate, seenAt) {
    const next = reconcileCandidate(existing, candidate, seenAt);
    const { changed, ...data } = next;
    if (!existing) {
        const url = databaseUrl('event_candidates');
        url.searchParams.set('on_conflict', 'source,external_id');
        await databaseRequest(url, {
            method: 'POST',
            headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(data),
        });
        return 'new';
    }

    const url = databaseUrl('event_candidates');
    url.searchParams.set('id', `eq.${existing.id}`);
    // The UI may have ignored this event since our initial read; do not overwrite its decision.
    delete data.status;
    await databaseRequest(url, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(data),
    });
    return existing.source === LEGACY_GENSHIN_EVENT_SOURCE ? 'migrated'
            : changed ? 'updated' : 'unchanged';
}

async function markMissingCandidateInactive(existing) {
    if (!existing.is_active) return false;
    const url = databaseUrl('event_candidates');
    url.searchParams.set('id', `eq.${existing.id}`);
    await databaseRequest(url, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: false }),
    });
    return true;
}

export async function syncGameEvents(game, { dryRun = false, now = Date.now() } = {}) {
    getEventGame(game.key);
    if (!Number.isFinite(now)) throw new Error('Sync time must be a finite timestamp.');
    const calendar = await fetchCalendar(game);
    const resolveTimes = game.timePolicy === 'wuwa-america' ? resolveWuwaTimes
        : game.timePolicy === 'nte-america' ? resolveNteTimes : undefined;
    const { events, skipped } = normalizeStarRailAssistantActivities(calendar, now, { resolveTimes });
    if (!events.length) throw new Error('Calendar has no current events; refusing to hide existing candidates.');
    let gameId;
    if (!dryRun) {
        const url = databaseUrl('games');
        url.searchParams.set('select', 'id');
        url.searchParams.set('abbreviation', `eq.${game.abbreviation}`);
        const rows = await (await databaseRequest(url)).json();
        if (rows.length !== 1) throw new Error(`Expected one registered game for ${game.abbreviation}.`);
        gameId = rows[0].id;
    }
    const candidates = events.map(activity => candidateFromActivity(activity, game, gameId));
    if (game.identity === 'edition') assignEditionKeys(candidates, []);
    if (new Set(candidates.map(candidate => candidate.external_id)).size !== candidates.length) {
        throw new Error('Calendar contains repeated activity names; cannot assign stable candidate keys.');
    }
    if (dryRun) {
        console.table(candidates.map(({ external_id, name, source_end_at, proposed_end_at, review_reason }) => ({
            external_id, name, source_end_at, proposed_end_at, review_reason,
        })));
        console.log(`${candidates.length} candidates; ${skipped} omitted.`);
        return { gameKey: game.key, dryRun: true, candidates, skipped };
    }

    const existing = await fetchExistingCandidates(game);
    if (game.identity === 'edition') assignEditionKeys(candidates, existing);
    const current = new Map(existing
        .filter(row => row.source === game.source)
        .map(row => [row.external_id, row]));
    const legacy = new Map();
    for (const row of existing.filter(row => row.source === LEGACY_GENSHIN_EVENT_SOURCE)) {
        const key = activityKey(row.name);
        if (legacy.has(key)) throw new Error(`Multiple legacy candidates share the name ${row.name}.`);
        legacy.set(key, row);
    }
    const seenAt = new Date(now).toISOString();
    const counts = { new: 0, migrated: 0, updated: 0, review: 0, unchanged: 0, inactive: 0 };
    const seenRowIds = new Set();
    for (const candidate of candidates) {
        const previous = current.get(candidate.external_id) ?? legacy.get(candidate.external_id);
        if (previous) seenRowIds.add(previous.id);
        const result = await saveCandidate(previous, candidate, seenAt);
        counts[result]++;
    }
    for (const previous of existing) {
        if (!seenRowIds.has(previous.id) && await markMissingCandidateInactive(previous)) counts.inactive++;
    }
    const importResponse = await databaseRequest(databaseUrl('rpc/import_event_candidates'), {
        method: 'POST', body: JSON.stringify({ p_source: game.source }),
    });
    const expiredTasksRemoved = game.key === 'hsr'
        ? await (await databaseRequest(databaseUrl('rpc/cleanup_expired_hsr_events'), {
            method: 'POST', body: '{}',
        })).json() : 0;
    const summary = { ...counts, skipped, tasks: await importResponse.json(), expiredTasksRemoved };
    console.log(game.name, summary);
    return { gameKey: game.key, dryRun: false, ...summary };
}
