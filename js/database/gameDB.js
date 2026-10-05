// js/database/gameDB.js
//
// Repositório de jogos. Mantém a mesma API pública de antes (mesmos nomes e
// assinaturas de função), mas agora persiste no Supabase em vez do IndexedDB,
// permitindo sincronizar os dados entre navegador e celular.

import { getClient, Tables } from './supabaseClient.js';
import { gameToRow, gameFromRow } from './mappers/gameMapper.js';
import { allGames } from '../data/Game.js';
import { profileRpc } from './profileDB.js';

function games() {
    return getClient().from(Tables.GAMES);
}

export async function addGame(game) {
    try {
        const data = await profileRpc('save_profile_game', { p_game: gameToRow(game) });
        console.log('New Game added:', data);
        return gameFromRow(data);
    } catch (error) {
        console.error('Failed to add game:', error);
        throw error;
    }
}

export async function updateGame(game) {
    // Usado principalmente para atualizar a stamina na tela principal.
    if (!game.id) {
        return;
    }

    try {
        await profileRpc('save_profile_game', { p_game_id: game.id, p_game: gameToRow(game) });
    } catch (error) {
        console.error('Erro ao atualizar o jogo:', error);
        throw error;
    }
}

export async function deleteGameById(gameId) {
    try {
        await profileRpc('remove_profile_game', { p_game_id: gameId });
    } catch (error) {
        console.error(`Failed to delete game with ID ${gameId}:`, error);
        throw error;
    }
}

export async function fetchAllGames() {
    // Carrega todos os jogos para a tela principal, ordenados pela data de
    // stamina máxima (mesmo comportamento da versão anterior).
    try {
        const data = await profileRpc('list_profile_games');
        return (data ?? []).map(gameFromRow);
    } catch (error) {
        console.error('Erro ao buscar todos os jogos:', error);
        throw error;
    }
}

export async function fetchGameById(id) {
    try {
        return (await fetchAllGames()).find(game => game.id === Number(id)) ?? null;
    } catch (error) {
        console.error('Erro ao buscar o jogo pelo ID:', error);
        throw error;
    }
}

export async function populateInitialGames() {
    // Semeia os jogos padrão apenas na primeira execução (banco vazio).
    try {
        if (await hasAnyGame()) {
            return;
        }

        console.log('No games found. Populating initial data...');
        const { error } = await getClient().rpc('initialize_game_catalogue', { p_games: allGames.map(gameToRow) });
        if (error) throw error;
    } catch (error) {
        console.error('Error populating initial games data:', error);
        throw error;
    }
}

export async function hasAnyGame() {
    try {
        const { data, error } = await games().select('id').limit(1);
        if (error) throw error;
        return (data ?? []).length > 0;
    } catch (error) {
        console.error('Error checking if any game exists:', error);
        throw error;
    }
}
