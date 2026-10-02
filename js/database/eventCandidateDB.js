import { getClient, Tables } from './supabaseClient.js';
import { EVENT_GAMES, getEventGame } from '../events/eventGames.js';

export async function fetchPendingEventCandidates(game = getEventGame('genshin')) {
    const { data, error } = await getClient()
        .from(Tables.EVENT_CANDIDATES)
        .select('*')
        .eq('source', game.source)
        .eq('status', 'pending')
        .eq('is_active', true)
        .or(`proposed_end_at.is.null,proposed_end_at.gt.${new Date().toISOString()}`)
        .order('proposed_end_at', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
}

export async function approveEventCandidate(id, deadline, existingTaskId = null) {
    const { error } = await getClient().rpc('approve_event_candidate', {
        p_candidate_id: id,
        p_deadline: deadline,
        p_existing_task_id: existingTaskId,
    });
    if (error) throw error;
}

export async function ignoreEventCandidate(id) {
    const { error } = await getClient()
        .from(Tables.EVENT_CANDIDATES)
        .update({ status: 'ignored' })
        .eq('id', id);
    if (error) throw error;
}

export async function fetchEventReviewCounts() {
    const { data, error } = await getClient().from(Tables.EVENT_CANDIDATES)
        .select('source').in('source', EVENT_GAMES.map(game => game.source))
        .eq('status', 'pending').eq('is_active', true)
        .or(`proposed_end_at.is.null,proposed_end_at.gt.${new Date().toISOString()}`);
    if (error) throw error;
    return Object.fromEntries(EVENT_GAMES.map(game => [game.key,
        (data ?? []).filter(candidate => candidate.source === game.source).length]));
}

export async function cleanupExpiredHsrEvents() {
    const { error } = await getClient().rpc('cleanup_expired_hsr_events');
    if (error) throw error;
}

export async function ignoreImportedTask(taskId) {
    const { error } = await getClient().rpc('ignore_imported_task', { p_task_id: taskId });
    if (error) throw error;
}

export async function restoreEventApiDeadline(candidateId) {
    const { error } = await getClient().rpc('sync_event_candidate', {
        p_candidate_id: candidateId, p_force_api: true,
    });
    if (error) throw error;
}
