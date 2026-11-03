import { getEventGame } from '../js/events/eventGames.js';
import { activityKey } from '../js/events/starRailAssistant.js';
import { candidateFromActivity, assignEditionKeys, discoverEventCandidates } from '../js/events/eventCatalogue.js';
export { candidateFromActivity, assignEditionKeys };
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
    const { candidates, skipped } = discoverEventCandidates(calendar, game, now);
    let gameId;
    if (!dryRun) {
        const url = databaseUrl('games');
        url.searchParams.set('select', 'id');
        url.searchParams.set('abbreviation', `eq.${game.abbreviation}`);
        const rows = await (await databaseRequest(url)).json();
        if (rows.length !== 1) throw new Error(`Expected one registered game for ${game.abbreviation}.`);
        gameId = rows[0].id;
    }
    if (gameId !== undefined) for (const candidate of candidates) candidate.game_id = gameId;
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
    // Old GI sources participate in the same period checks, never name-only adoption.
    const identityExisting = existing.map(row => row.source === LEGACY_GENSHIN_EVENT_SOURCE ? { ...row, source: game.source } : row);
    if (game.identity === 'edition') assignEditionKeys(candidates, identityExisting);
    const previousCandidates = candidates.map(candidate => {
        const matches = existing.filter(row => row.external_id === candidate.external_id && activityKey(row.name) === activityKey(candidate.name));
        if (matches.length > 1) throw new Error(`Ambiguous edition for ${candidate.name}; refusing duplicate identities.`);
        return matches[0];
    });
    const seenAt = new Date(now).toISOString();
    const counts = { new: 0, migrated: 0, updated: 0, review: 0, unchanged: 0, inactive: 0 };
    const cleanupExpired = async () => game.cleanupExpired
        ? (await databaseRequest(databaseUrl('rpc/cleanup_expired_imported_events'), {
            method: 'POST', body: JSON.stringify({ p_source: game.source }),
        })).json() : 0;
    // Close elapsed personal deadlines before a feed correction can extend them.
    // Identity checks above must finish before any write, including cleanup.
    const expiredBeforeImport = await cleanupExpired();
    const seenRowIds = new Set();
    for (const [index, candidate] of candidates.entries()) {
        const previous = previousCandidates[index];
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
    const expiredTasksRemoved = expiredBeforeImport + await cleanupExpired();
    const summary = { ...counts, skipped, tasks: await importResponse.json(), expiredTasksRemoved };
    console.log(game.name, summary);
    return { gameKey: game.key, dryRun: false, ...summary };
}
