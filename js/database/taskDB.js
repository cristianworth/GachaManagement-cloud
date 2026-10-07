// js/database/taskDB.js
//
// The public repository API uses profile RPCs, which return tasks with their games.

import { taskToRow, taskFromRow } from './mappers/taskMapper.js';
import { WEEKLY_BATCHES } from '../data/weeklyTasks.js';
import { fetchAllGames } from './gameDB.js';
import { profileRpc } from './profileDB.js';

export async function addTask(task) {
    try {
        const data = await profileRpc('save_profile_task', { p_task: taskToRow(task) });
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
        await profileRpc('save_profile_task', { p_task_id: task.id, p_task: taskToRow(task) });
    } catch (error) {
        console.error('Erro ao atualizar a tarefa:', error);
        throw error;
    }
}

export async function deleteTaskById(taskId) {
    try {
        await profileRpc('remove_profile_task', { p_task_id: taskId });
    } catch (error) {
        console.error(`Failed to delete task with ID ${taskId}:`, error);
        throw error;
    }
}

export async function fetchAllTasks() {
    try {
        const data = await profileRpc('list_profile_tasks');
        return (data ?? []).map(taskFromRow);
    } catch (error) {
        console.error('Erro ao buscar todas as tarefas:', error);
        throw error;
    }
}

export async function fetchTaskById(id) {
    try {
        return (await fetchAllTasks()).find(task => task.id === Number(id)) ?? null;
    } catch (error) {
        console.error('Erro ao buscar a tarefa pelo ID:', error);
        throw error;
    }
}

export async function fetchTasksByGame(gameId) {
    try {
        return (await fetchAllTasks()).filter(task => task.gameId === Number(gameId));
    } catch (error) {
        console.error('Erro ao buscar tarefas do jogo:', error);
        throw error;
    }
}

export async function completeTask(taskId, isDone) {
    try {
        await profileRpc('complete_profile_task', { p_task_id: taskId, p_is_done: isDone });
    } catch (error) {
        console.error('Failed to update task:', error);
        throw error;
    }
}

export async function setTaskFavorite(taskId, isFavorite) {
    return profileRpc('set_profile_task_favorite', { p_task_id: taskId, p_is_favorite: isFavorite });
}

function resolveWeeklyGame(games, abbreviation) {
    const matches = games.filter(game => game.abbreviation === abbreviation);
    if (matches.length > 1) throw new Error(`Sigla de jogo ambígua: ${abbreviation}.`);
    return matches[0];
}

async function createWeeklyBatch(batch, game, explicit, now) {
    return profileRpc('create_profile_weekly_batch', {
        p_abbreviation: batch.abbreviation,
        p_game_id: game.id,
        p_definitions: batch.definitions,
        p_explicit: explicit,
        // Production uses the database clock; tests can inject a fixed instant.
        ...(now !== undefined ? { p_now: new Date(now).toISOString() } : {}),
    });
}

export async function createWeeklyTasksForGame(abbreviation, { now } = {}) {
    const batch = WEEKLY_BATCHES.find(batch => batch.abbreviation === abbreviation);
    if (!batch) throw new Error('Jogo sem lote semanal disponível.');
    const game = resolveWeeklyGame(await fetchAllGames(), abbreviation);
    if (!game) throw new Error(`Jogo não cadastrado: ${abbreviation}.`);
    return createWeeklyBatch(batch, game, true, now);
}

export async function populateInitialTasks({ now, explicit = false } = {}) {
    const games = await fetchAllGames();
    // Validate every enabled abbreviation before any write, even in an empty task table.
    const batches = WEEKLY_BATCHES.map(batch => ({ batch, game: resolveWeeklyGame(games, batch.abbreviation) }));
    for (const { batch, game } of batches) {
        if (game) await createWeeklyBatch(batch, game, explicit, now);
    }
}

export async function hasAnyTask() {
    try {
        return (await fetchAllTasks()).length > 0;
    } catch (error) {
        console.error('Error checking if any task exists:', error);
        throw error;
    }
}

export async function fetchAllOverdueTasks() {
    try {
        const now = new Date();
        return (await fetchAllTasks()).filter(task => task.expirationDate && task.expirationDate <= now);
    } catch (error) {
        console.error('Erro ao buscar tarefas expiradas:', error);
        throw error;
    }
}
