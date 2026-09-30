import { getClient, Tables } from './supabaseClient.js';

export async function fetchPendingEventCandidates() {
    const { data, error } = await getClient()
        .from(Tables.EVENT_CANDIDATES)
        .select('*')
        .eq('status', 'pending')
        .eq('is_active', true)
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
