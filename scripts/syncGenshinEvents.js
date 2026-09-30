import {
    GENSHIN_CALENDAR_URL,
    GENSHIN_EVENT_SOURCE,
    normalizeGenshinEvents,
} from '../js/events/genshinCalendar.js';
import { pathToFileURL } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config/supabase.config.js';

async function readJson(response, label) {
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
}

async function fetchCalendar() {
    return readJson(await fetch(GENSHIN_CALENDAR_URL), 'Genshin calendar');
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
    url.searchParams.set('source', `eq.${GENSHIN_EVENT_SOURCE}`);
    const response = await databaseRequest(url);
    return response.json();
}

function sameInstant(left, right) {
    return left === right || (left && right && Date.parse(left) === Date.parse(right));
}

export function reconcileCandidate(existing, candidate, seenAt) {
    if (!existing) return { ...candidate, status: 'pending', is_active: true, last_seen_at: seenAt };

    const deadlineChanged = !sameInstant(existing.source_end_at, candidate.source_end_at) ||
        !sameInstant(existing.proposed_end_at, candidate.proposed_end_at);
    const changedAfterApproval = 'O prazo mudou na fonte desde a aprovação; revisar antes de atualizar a tarefa.';
    const next = {
        ...candidate,
        is_active: true,
        status: deadlineChanged && existing.status !== 'pending' ? 'pending' : existing.status,
        review_reason: deadlineChanged && existing.status === 'approved'
            ? changedAfterApproval
            : existing.status === 'pending' && existing.review_reason === changedAfterApproval
                ? changedAfterApproval
                : candidate.review_reason,
        last_seen_at: seenAt,
    };
    next.changed = ['name', 'type_name', 'review_reason', 'status', 'is_active']
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
    if (!calendar.events?.length) throw new Error('Calendar has no events; refusing to hide existing candidates.');
    const { candidates, skipped } = normalizeGenshinEvents(calendar);
    if (process.argv.includes('--dry-run')) {
        console.table(candidates.map(({ external_id, name, source_end_at, proposed_end_at, review_reason }) => ({
            external_id, name, source_end_at, proposed_end_at, review_reason,
        })));
        console.log(`${candidates.length} candidates; ${skipped} omitted.`);
        return;
    }

    const existing = new Map((await fetchExistingCandidates()).map(row => [row.external_id, row]));
    const seenAt = new Date().toISOString();
    const counts = { new: 0, updated: 0, review: 0, unchanged: 0, inactive: 0 };
    const seenIds = new Set();
    for (const candidate of candidates) {
        seenIds.add(candidate.external_id);
        const result = await saveCandidate(existing.get(candidate.external_id), candidate, seenAt);
        counts[result]++;
    }
    for (const previous of existing.values()) {
        if (!seenIds.has(previous.external_id) && await markMissingCandidateInactive(previous)) counts.inactive++;
    }
    console.log({ ...counts, skipped });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
