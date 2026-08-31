// js/database/dbInit.js
//
// Inicialização do banco: semeia os dados iniciais (primeira execução) e roda a
// rotina que renova tarefas expiradas. A conexão em si vive em supabaseClient.js.

import { getClient, Tables } from './supabaseClient.js';
import { populateInitialGames } from './gameDB.js';
import { updateTask, populateInitialTasks, fetchAllOverdueTasks } from './taskDB.js';
import { displayAllTasks } from '../ui/taskUI.js';
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';
import { formatDateForDisplay } from '../utils/dateUtils.js';

/**
 * Ponto único de inicialização, chamado no boot da aplicação (js/index.js).
 * Substitui o antigo efeito colateral de `db.open()` no carregamento do módulo.
 */
export async function initializeDatabase() {
    await populateInitialGames();
    await populateInitialTasks();
    await updateExpiratedTasksRoutine();
}

/**
 * Limpa todas as tarefas e jogos e recria os dados iniciais. Tarefas são
 * apagadas antes dos jogos por causa da chave estrangeira.
 */
export async function clearDatabase() {
    try {
        const client = getClient();
        await client.from(Tables.TASKS).delete().gt('id', 0);
        await client.from(Tables.GAMES).delete().gt('id', 0);
        await initializeDatabase();
        console.log('Banco de dados resetado com sucesso!');
    } catch (error) {
        console.error('Erro ao resetar o banco de dados:', error);
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
        const daysToRefresh = RefreshTypeEnum.findDaysById(task.refreshType);
        if (!daysToRefresh) continue;

        const previousDate = new Date(task.expirationDate);
        task.isDone = false;
        task.expirationDate = new Date(previousDate);
        task.expirationDate.setDate(previousDate.getDate() + daysToRefresh);

        console.log(
            `updated ${task.gameDescription} expirated task ${task.description} ` +
            `from date ${formatDateForDisplay(previousDate)} to ${formatDateForDisplay(task.expirationDate)}`
        );

        await updateTask(task);
    }

    await displayAllTasks();
}
