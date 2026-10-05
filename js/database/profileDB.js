import { getClient } from './supabaseClient.js';
import { getProfileId } from '../services/profileSession.js';

export async function profileRpc(name, params = {}) {
    // Capture the actor before awaiting: a pending write must never change profiles.
    const { data, error } = await getClient().rpc(name, { ...params, p_profile_id: getProfileId() });
    if (error) throw error;
    return data;
}

export async function fetchProfiles() {
    const { data, error } = await getClient().from('profiles').select('id,name').order('sort_order');
    if (error) throw error;
    return data ?? [];
}

export async function fetchGameCatalogue() {
    return (await profileRpc('profile_game_catalogue')) ?? [];
}

export async function saveSelectedGames(gameIds, { createWeeklies = false } = {}) {
    return profileRpc('set_profile_games', { p_game_ids: gameIds, p_create_weeklies: createWeeklies });
}
