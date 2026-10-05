// js/database/taskDB.js
//
// Repositório de tarefas. Mantém a mesma API pública de antes, agora persistindo
// no Supabase. O jogo relacionado é trazido junto via embedding do Supabase
// (evitando o N+1 de buscar cada jogo individualmente).

import { getClient, Tables } from './supabaseClient.js';
import { taskToRow, taskFromRow } from './mappers/taskMapper.js';
import { WEEKLY_BATCHES } from '../data/weeklyTasks.js';
import { fetchAllGames } from './gameDB.js';

// `game:games(*)` embute a linha do jogo relacionado em cada tarefa.
const SELECT_WITH_GAME = '*, game:games(*), event_candidates(id,source), weekly_batch_items(definition_key)';

function tasks() {
    return getClient().from(Tables.TASKS);
}

export async function addTask(task) {
    try {
        const { data, error } = await tasks().insert(taskToRow(task)).select().single();
        if (error) throw error;
        console.log('New Task added:', data);
        return taskFromRow(data);
    } catch (error) {
        console.error('Failed to add task:', error);
        throw error;
    }
}

export async function updateTask(task) {
    if (!task.id) {
        console.log('Invalid task object id: ', task);
        return;
    }

    try {
        const { error } = await tasks().update(taskToRow(task)).eq('id', task.id);
        if (error) throw error;
    } catch (error) {
        console.error('Erro ao atualizar a tarefa:', error);
        throw error;
    }
}

export async function deleteTaskById(taskId) {
    try {
        const { error } = await tasks().delete().eq('id', taskId);
        if (error) throw error;
    } catch (error) {
        console.error(`Failed to delete task with ID ${taskId}:`, error);
        throw error;
    }
}

export async function fetchAllTasks() {
    try {
        const { data, error } = await tasks()
            .select(SELECT_WITH_GAME)
            .order('expiration_date', { ascending: true });
        if (error) throw error;
        return (data ?? []).map(taskFromRow);
    } catch (error) {
        console.error('Erro ao buscar todas as tarefas:', error);
        throw error;
    }
}

export async function fetchTaskById(id) {
    try {
        const { data, error } = await tasks().select(SELECT_WITH_GAME).eq('id', id).maybeSingle();
        if (error) throw error;
        return taskFromRow(data);
    } catch (error) {
        console.error('Erro ao buscar a tarefa pelo ID:', error);
        throw error;
    }
}

export async function fetchTasksByGame(gameId) {
    try {
        const { data, error } = await tasks().select(SELECT_WITH_GAME).eq('game_id', gameId);
        if (error) throw error;
        return (data ?? []).map(taskFromRow);
    } catch (error) {
        console.error('Erro ao buscar tarefas do jogo:', error);
        throw error;
    }
}

export async function completeTask(taskId, isDone) {
    try {
        const { error } = await tasks().update({ is_done: isDone }).eq('id', taskId);
        if (error) throw error;
    } catch (error) {
        console.error('Failed to update task:', error);
        throw error;
    }
}

function resolveWeeklyGame(games, abbreviation) {
    const matches = games.filter(game => game.abbreviation === abbreviation);
    if (matches.length > 1) throw new Error(`Sigla de jogo ambígua: ${abbreviation}.`);
    return matches[0];
}

async function createWeeklyBatch(batch, game, explicit, now) {
    const { data, error } = await getClient().rpc('create_weekly_batch', {
        p_abbreviation: batch.abbreviation,
        p_game_id: game.id,
        p_definitions: batch.definitions,
        p_explicit: explicit,
        // Production uses the database clock; tests can inject a fixed instant.
        ...(now !== undefined ? { p_now: new Date(now).toISOString() } : {}),
    });
    if (error) throw error;
    return data;
}

export async function createWeeklyTasksForGame(abbreviation, { now } = {}) {
    const batch = WEEKLY_BATCHES.find(batch => batch.abbreviation === abbreviation);
    if (!batch) throw new Error('Jogo sem lote semanal disponível.');
    const game = resolveWeeklyGame(await fetchAllGames(), abbreviation);
    if (!game) throw new Error(`Jogo não cadastrado: ${abbreviation}.`);
    return createWeeklyBatch(batch, game, true, now);
}

export async function populateInitialTasks({ now } = {}) {
    const games = await fetchAllGames();
    // Validate every enabled abbreviation before any write, even in an empty task table.
    const batches = WEEKLY_BATCHES.map(batch => ({ batch, game: resolveWeeklyGame(games, batch.abbreviation) }));
    for (const { batch, game } of batches) {
        if (game) await createWeeklyBatch(batch, game, false, now);
    }
}

export async function hasAnyTask() {
    try {
        const { data, error } = await tasks().select('id').limit(1);
        if (error) throw error;
        return (data ?? []).length > 0;
    } catch (error) {
        console.error('Error checking if any task exists:', error);
        throw error;
    }
}

export async function fetchAllOverdueTasks() {
    try {
        const now = new Date();
        const { data, error } = await tasks()
            .select(SELECT_WITH_GAME)
            .lte('expiration_date', now.toISOString());
        if (error) throw error;
        return (data ?? []).map(taskFromRow);
    } catch (error) {
        console.error('Erro ao buscar tarefas expiradas:', error);
        throw error;
    }
}
