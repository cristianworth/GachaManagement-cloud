import { getClient } from './supabaseClient.js';
import { validateAgendaEntry } from '../utils/gameAgenda.js';

async function rpc(name, params = {}) {
    const { data, error } = await getClient().rpc(name, params);
    if (error) throw error;
    return data;
}

export const fetchGameAgenda = () => rpc('list_game_agenda');
export const fetchAgendaCatalogue = () => rpc('game_agenda_catalogue');
export const saveAgendaEntry = (entry, id = null) => rpc('save_game_agenda', { p_entry: validateAgendaEntry(entry), p_id: id });
export const deleteAgendaEntry = id => rpc('delete_game_agenda', { p_id: id });
