// js/database/dbInit.js
//
// Inicialização do banco: semeia os dados iniciais (primeira execução) e roda a
// rotina que renova tarefas expiradas. A conexão em si vive em supabaseClient.js.

import { cleanupExpiredImportedEvents } from './eventCandidateDB.js';
import { getClient } from './supabaseClient.js';
import { populateInitialGames } from './gameDB.js';
import { updateTask, populateInitialTasks, fetchAllOverdueTasks } from './taskDB.js';
import { displayAllTasks } from '../ui/taskUI.js';
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';
import { formatDateForDisplay, getNextRecurringDeadline } from '../utils/dateUtils.js';

/**
 * Ponto único de inicialização, chamado no boot da aplicação (js/index.js).
 * Substitui o antigo efeito colateral de `db.open()` no carregamento do módulo.
 */
export async function initializeDatabase() {
    await populateInitialGames();
    await populateInitialTasks();
    await cleanupExpiredImportedEvents();
    await updateExpiratedTasksRoutine();
}

/**
 * Explicitly resets all application data, including weekly decisions, in one
 * transaction. Initial data is recreated only after the reset succeeds.
 */
export async function clearDatabase() {
    try {
        const { error } = await getClient().rpc('reset_application_data');
        if (error) throw error;
        await initializeDatabase();
        console.log('Banco de dados resetado com sucesso!');
    } catch (error) {
        console.error('Erro ao resetar o banco de dados:', error);
        throw error;
    }
}

/**
 * Renova tarefas recorrentes já vencidas: reabre a tarefa e empurra a data de
 * expiração para o próximo ciclo, conforme o tipo de recorrência.
 */
export async function updateExpiratedTasksRoutine() {
    const expiredTasks = await fetchAllOverdueTasks();
    if (!expiredTasks || expiredTasks.length === 0) {
        return;
    }

    for (const task of expiredTasks) {
        const daysToRefresh = RefreshTypeEnum.getRepeatDays(task);
        if (!daysToRefresh) continue;

        const previousDate = new Date(task.expirationDate);
        task.expirationDate = getNextRecurringDeadline(previousDate, daysToRefresh, new Date(), {
            utc: Boolean(task.weeklyDefinitionKey) && task.refreshType === 2 && daysToRefresh === 7,
        });
        task.isDone = false;

        console.log(
            `updated ${task.gameDescription} expirated task ${task.description} ` +
            `from date ${formatDateForDisplay(previousDate)} to ${formatDateForDisplay(task.expirationDate)}`
        );

        await updateTask(task);
    }

    await displayAllTasks();
}
