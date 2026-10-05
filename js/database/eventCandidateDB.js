import { getClient } from './supabaseClient.js';
import { EVENT_GAMES, getEventGame } from '../events/eventGames.js';
import { profileRpc } from './profileDB.js';

export async function fetchPendingEventCandidates(game = getEventGame('genshin')) {
    return (await profileRpc('list_profile_candidates', { p_source: game.source })) ?? [];
}

export async function approveEventCandidate(id, deadline, existingTaskId = null) {
    await profileRpc('approve_profile_candidate', {
        p_candidate_id: id,
        p_deadline: deadline,
        p_existing_task_id: existingTaskId,
    });
}

export async function ignoreEventCandidate(id) {
    await profileRpc('ignore_profile_candidate', { p_candidate_id: id });
}

export async function fetchEventReviewCounts() {
    const data = await profileRpc('list_profile_candidates');
    return Object.fromEntries(EVENT_GAMES.map(game => [game.key,
        (data ?? []).filter(candidate => candidate.source === game.source).length]));
}

export async function cleanupExpiredHsrEvents() {
    const { error } = await getClient().rpc('cleanup_expired_hsr_events');
    if (error) throw error;
}

export async function ignoreImportedTask(taskId) {
    await profileRpc('ignore_profile_task', { p_task_id: taskId });
}

export async function restoreEventApiDeadline(candidateId) {
    await profileRpc('restore_profile_api_deadline', {
        p_candidate_id: candidateId,
    });
}
