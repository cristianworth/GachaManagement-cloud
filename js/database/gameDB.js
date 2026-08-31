// js/database/gameDB.js
//
// Repositório de jogos. Mantém a mesma API pública de antes (mesmos nomes e
// assinaturas de função), mas agora persiste no Supabase em vez do IndexedDB,
// permitindo sincronizar os dados entre navegador e celular.

import { getClient, Tables } from './supabaseClient.js';
import { gameToRow, gameFromRow } from './mappers/gameMapper.js';
import { allGames } from '../data/Game.js';

function games() {
    return getClient().from(Tables.GAMES);
}

export async function addGame(game) {
    try {
        const { data, error } = await games().insert(gameToRow(game)).select().single();
        if (error) throw error;
        console.log('New Game added:', data);
        return gameFromRow(data);
    } catch (error) {
        console.error('Failed to add game:', error);
        return null;
    }
}

export async function updateGame(game) {
    // Usado principalmente para atualizar a stamina na tela principal.
    if (!game.id) {
        return;
    }

    try {
        const { error } = await games().update(gameToRow(game)).eq('id', game.id);
        if (error) throw error;
    } catch (error) {
        console.error('Erro ao atualizar o jogo:', error);
    }
}

export async function deleteGameById(gameId) {
    try {
        const { error } = await games().delete().eq('id', gameId);
        if (error) throw error;
    } catch (error) {
        console.error(`Failed to delete game with ID ${gameId}:`, error);
    }
}

export async function fetchAllGames() {
    // Carrega todos os jogos para a tela principal, ordenados pela data de
    // stamina máxima (mesmo comportamento da versão anterior).
    try {
        const { data, error } = await games().select('*').order('date_max_stamina', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(gameFromRow);
    } catch (error) {
        console.error('Erro ao buscar todos os jogos:', error);
        return [];
    }
}

export async function fetchGameById(id) {
    try {
        const { data, error } = await games().select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return gameFromRow(data);
    } catch (error) {
        console.error('Erro ao buscar o jogo pelo ID:', error);
        return null;
    }
}

export async function populateInitialGames() {
    // Semeia os jogos padrão apenas na primeira execução (banco vazio).
    try {
        if (await hasAnyGame()) {
            return;
        }

        console.log('No games found. Populating initial data...');
        for (const game of allGames) {
            await addGame(game);
        }
    } catch (error) {
        console.error('Error populating initial games data:', error);
    }
}

export async function hasAnyGame() {
    try {
        const { data, error } = await games().select('id').limit(1);
        if (error) throw error;
        return (data ?? []).length > 0;
    } catch (error) {
        console.error('Error checking if any game exists:', error);
        return false;
    }
}
