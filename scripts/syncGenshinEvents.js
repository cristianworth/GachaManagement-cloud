import {
    STAR_RAIL_ASSISTANT_GENSHIN_URL,
    STAR_RAIL_ASSISTANT_GENSHIN_SOURCE,
    genshinActivityKey,
    normalizeStarRailAssistantGenshin,
} from '../js/events/starRailAssistantGenshin.js';
import { pathToFileURL } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config/supabase.config.js';

export const LEGACY_GENSHIN_EVENT_SOURCE = 'ennead-genshin-calendar';

async function readJson(response, label) {
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
}

async function fetchCalendar() {
    return readJson(await fetch(STAR_RAIL_ASSISTANT_GENSHIN_URL), 'StarRailAssistant Genshin');
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

async function fetchExistingCandidates() {
    const url = databaseUrl('event_candidates');
    url.searchParams.set('select', '*');
    const response = await databaseRequest(url);
    return (await response.json()).filter(candidate =>
        candidate.source === STAR_RAIL_ASSISTANT_GENSHIN_SOURCE ||
        candidate.source === LEGACY_GENSHIN_EVENT_SOURCE);
}

export function candidateFromActivity(activity) {
    return {
        source: STAR_RAIL_ASSISTANT_GENSHIN_SOURCE,
        external_id: genshinActivityKey(activity.name),
        name: activity.name,
        type_name: null,
        source_start_at: activity.sourceStartAt,
        source_end_at: activity.sourceEndAt,
        proposed_end_at: activity.proposedEndAt,
        cover_url: activity.coverUrl,
        review_reason: activity.reviewReason,
    };
}

function sameInstant(left, right) {
    return left === right || (left && right && Date.parse(left) === Date.parse(right));
}

export function reconcileCandidate(existing, candidate, seenAt) {
    if (!existing) return { ...candidate, status: 'pending', is_active: true, last_seen_at: seenAt };

    // A proposal can change when our conversion improves, even if the source deadline did not.
    const deadlineChanged = !sameInstant(existing.source_end_at, candidate.source_end_at);
    const changedAfterApproval = 'O prazo mudou na fonte desde a aprovação; revisar antes de atualizar a tarefa.';
    const next = {
        ...candidate,
        is_active: true,
        status: deadlineChanged && existing.status === 'approved' ? 'pending' : existing.status,
        review_reason: deadlineChanged && existing.status === 'approved'
            ? changedAfterApproval
            : existing.status === 'pending' && existing.review_reason === changedAfterApproval
                ? changedAfterApproval
                : candidate.review_reason,
        last_seen_at: seenAt,
    };
    next.changed = ['source', 'external_id', 'name', 'type_name', 'cover_url', 'review_reason', 'status', 'is_active']
        .some(field => existing[field] !== next[field]) ||
        ['source_start_at', 'source_end_at', 'proposed_end_at']
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
    await databaseRequest(url, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(data),
    });
    return data.status === 'pending' && existing.status !== 'pending'
        ? 'review'
        : existing.source === LEGACY_GENSHIN_EVENT_SOURCE ? 'migrated'
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

async function main() {
    const calendar = await fetchCalendar();
    const { events, skipped } = normalizeStarRailAssistantGenshin(calendar);
    if (!events.length) throw new Error('Calendar has no current events; refusing to hide existing candidates.');
    const candidates = events.map(candidateFromActivity);
    if (new Set(candidates.map(candidate => candidate.external_id)).size !== candidates.length) {
        throw new Error('Calendar contains repeated activity names; cannot assign stable candidate keys.');
    }
    if (process.argv.includes('--dry-run')) {
        console.table(candidates.map(({ external_id, name, source_end_at, proposed_end_at, review_reason }) => ({
            external_id, name, source_end_at, proposed_end_at, review_reason,
        })));
        console.log(`${candidates.length} candidates; ${skipped} omitted.`);
        return;
    }

    const existing = await fetchExistingCandidates();
    const current = new Map(existing
        .filter(row => row.source === STAR_RAIL_ASSISTANT_GENSHIN_SOURCE)
        .map(row => [row.external_id, row]));
    const legacy = new Map();
    for (const row of existing.filter(row => row.source === LEGACY_GENSHIN_EVENT_SOURCE)) {
        const key = genshinActivityKey(row.name);
        if (legacy.has(key)) throw new Error(`Multiple legacy candidates share the name ${row.name}.`);
        legacy.set(key, row);
    }
    const seenAt = new Date().toISOString();
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
    console.log({ ...counts, skipped });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
