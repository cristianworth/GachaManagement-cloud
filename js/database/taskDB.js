// js/database/taskDB.js
//
// Repositório de tarefas. Mantém a mesma API pública de antes, agora persistindo
// no Supabase. O jogo relacionado é trazido junto via embedding do Supabase
// (evitando o N+1 de buscar cada jogo individualmente).

import { getClient, Tables } from './supabaseClient.js';
import { taskToRow, taskFromRow } from './mappers/taskMapper.js';
import { allTasks } from '../data/Task.js';

// `game:games(*)` embute a linha do jogo relacionado em cada tarefa.
const SELECT_WITH_GAME = '*, game:games(*)';

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
        return null;
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
    }
}

export async function deleteTaskById(taskId) {
    try {
        const { error } = await tasks().delete().eq('id', taskId);
        if (error) throw error;
    } catch (error) {
        console.error(`Failed to delete task with ID ${taskId}:`, error);
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
        return [];
    }
}

export async function fetchTaskById(id) {
    try {
        const { data, error } = await tasks().select(SELECT_WITH_GAME).eq('id', id).maybeSingle();
        if (error) throw error;
        return taskFromRow(data);
    } catch (error) {
        console.error('Erro ao buscar a tarefa pelo ID:', error);
        return null;
    }
}

export async function fetchTasksByGame(gameId) {
    try {
        const { data, error } = await tasks().select(SELECT_WITH_GAME).eq('game_id', gameId);
        if (error) throw error;
        return (data ?? []).map(taskFromRow);
    } catch (error) {
        console.error('Erro ao buscar tarefas do jogo:', error);
        return [];
    }
}

export async function completeTask(taskId, isDone) {
    try {
        const { error } = await tasks().update({ is_done: isDone }).eq('id', taskId);
        if (error) throw error;
    } catch (error) {
        console.error('Failed to update task:', error);
    }
}

export async function populateInitialTasks() {
    // Semeia as tarefas padrão apenas na primeira execução (banco vazio).
    try {
        if (await hasAnyTask()) {
            return;
        }

        console.log('No tasks found. Populating initial data...');
        for (const task of allTasks) {
            await addTask(task);
        }
    } catch (error) {
        console.error('Error populating initial tasks data:', error);
    }
}

export async function hasAnyTask() {
    try {
        const { data, error } = await tasks().select('id').limit(1);
        if (error) throw error;
        return (data ?? []).length > 0;
    } catch (error) {
        console.error('Error checking if any task exists:', error);
        return false;
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
        return [];
    }
}
