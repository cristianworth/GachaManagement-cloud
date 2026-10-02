import { pathToFileURL } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config/supabase.config.js';
import {
    STAR_RAIL_ASSISTANT_GENSHIN_URL,
    STAR_RAIL_ASSISTANT_GENSHIN_SOURCE,
    genshinActivityKey,
    normalizeStarRailAssistantGenshin,
} from '../js/events/starRailAssistantGenshin.js';
import { LEGACY_GENSHIN_EVENT_SOURCE } from './syncGenshinEvents.js';

function normalizedName(value) {
    return genshinActivityKey(value ?? '');
}

function sameInstant(left, right) {
    return left && right && Date.parse(left) === Date.parse(right);
}

export function compareGenshinEvents(events, candidates, tasks) {
    return events.map(event => {
        const name = normalizedName(event.name);
        const matchingCandidates = candidates.filter(candidate => normalizedName(candidate.name) === name);
        const linkedTaskIds = new Set(matchingCandidates.map(candidate => candidate.task_id).filter(Boolean));
        const matchingTasks = tasks.filter(task =>
            normalizedName(task.description) === name || linkedTaskIds.has(task.id));
        const deadlineChanged = event.proposedEndAt && matchingTasks.some(task =>
            task.expiration_date && !sameInstant(event.proposedEndAt, task.expiration_date));
        const sourceDisagreement = matchingCandidates.some(candidate =>
            candidate.source_end_at && event.sourceEndAt &&
            !sameInstant(candidate.source_end_at, event.sourceEndAt));

        return {
            ...event,
            candidateIds: matchingCandidates.map(candidate => candidate.id),
            candidateStatuses: matchingCandidates.map(candidate => `${candidate.id}:${candidate.status}`),
            taskIds: matchingTasks.map(task => task.id),
            classification: deadlineChanged || sourceDisagreement
                ? 'revisar diferença de prazo'
                : matchingTasks.length
                    ? 'tarefa já cadastrada'
                    : matchingCandidates.length
                        ? 'candidato já cadastrado'
                        : 'novo',
        };
    });
}

async function readJson(response, label) {
    if (!response.ok) {
        throw new Error(`${label}: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
}

async function readTable(table, filters = {}) {
    const base = process.env.SUPABASE_URL || SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY;
    if (!base?.startsWith('https://') || !key) throw new Error('Supabase URL or public key is missing.');

    const url = new URL(`/rest/v1/${table}`, base);
    url.searchParams.set('select', '*');
    for (const [column, value] of Object.entries(filters)) url.searchParams.set(column, `eq.${value}`);
    return readJson(await fetch(url, { headers: { apikey: key } }), `Supabase ${table}`);
}

export async function previewStarRailAssistantGenshin() {
    const response = await fetch(STAR_RAIL_ASSISTANT_GENSHIN_URL);
    const calendar = await readJson(response, 'StarRailAssistant Genshin');
    const { events, skipped } = normalizeStarRailAssistantGenshin(calendar);

    const [games, candidates] = await Promise.all([
        readTable('games', { abbreviation: 'GI' }),
        readTable('event_candidates'),
    ]);
    if (games.length !== 1) throw new Error(`Expected one Genshin game, found ${games.length}.`);
    const genshinCandidates = candidates.filter(candidate =>
        candidate.source === STAR_RAIL_ASSISTANT_GENSHIN_SOURCE ||
        candidate.source === LEGACY_GENSHIN_EVENT_SOURCE);
    const tasks = await readTable('tasks', { game_id: games[0].id, refresh_type: 0 });
    const compared = compareGenshinEvents(events, genshinCandidates, tasks);

    console.table(compared.map(event => ({
        name: event.name,
        sourceEnd: event.rawEndTime,
        americaEndUtc: event.proposedEndAt,
        candidates: event.candidateStatuses.join(', '),
        tasks: event.taskIds.join(', '),
        result: event.classification,
        review: event.reviewReason,
    })));
    console.log(`${events.length} events; ${skipped} omitted. Read-only preview; no data was saved.`);
    return compared;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    previewStarRailAssistantGenshin().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
