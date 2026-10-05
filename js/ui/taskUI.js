// js\ui\taskUI.js
import { createEventCover } from './eventCover.js';
import { cleanupExpiredHsrEvents, ignoreImportedTask, restoreEventApiDeadline } from '../database/eventCandidateDB.js';
import { fetchAllGames } from '../database/gameDB.js';
import { Task } from '../data/Task.js';
import { fetchAllTasks, completeTask, fetchTaskById, addTask, updateTask, deleteTaskById, createWeeklyTasksForGame } from '../database/taskDB.js';
import { WEEKLY_BATCHES } from '../data/weeklyTasks.js';
import { formatDateForDisplay, formatDateForInput, getExpirationDate } from '../utils/dateUtils.js';
import { resetTaskForm, setDateSelector, setTaskFormMessage, setTaskRecurrence } from './formHandler.js'
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';
import Router from '../utils/router.js';
import { filterTasks } from '../utils/taskFilters.js';
import { withLoading } from './loadingState.js';
import { setFeedback } from './feedback.js';

let loadedTasks = [];
let filterInitialized = false;
let loadedGames = [];
let creatingWeeklies = false;
let weeklyGameDataLoaded = false;

export async function displayAllTasks({ successMessage = '' } = {}) {
    return withLoading('Carregando tarefas...', async () => {
        const retry = document.getElementById('taskListRetry');
        if (retry) {
            retry.hidden = true;
            retry.onclick = () => displayAllTasks();
        }
        setFeedback('taskListMessage');
        try {
            await cleanupExpiredHsrEvents();
            const [tasks, games] = await Promise.all([fetchAllTasks(), fetchAllGames()]);
            updateTaskList(tasks, games);
            setFeedback('taskListMessage', successMessage);
            return true;
        } catch (error) {
            weeklyGameDataLoaded = false;
            document.getElementById('createWeekliesBtn').disabled = true;
            console.error('Failed to load task list:', error);
            setFeedback('taskListMessage', successMessage
                ? `${successMessage} Porém, não foi possível atualizar a lista. Use Tentar novamente para recarregar os dados.`
                : 'Não foi possível carregar as tarefas. Os dados exibidos podem estar desatualizados. Tente novamente.', 'error');
            if (retry) retry.hidden = false;
            return false;
        }
    });
}

function updateTaskList(tasks, games) {
    loadedTasks = tasks;
    loadedGames = games;
    weeklyGameDataLoaded = true;
    const filter = document.getElementById('taskGameFilter');
    const selectedGame = filter.value;
    filter.replaceChildren(new Option('All games', ''));
    for (const game of games) filter.add(new Option(game.description, String(game.id)));
    filter.value = [...filter.options].some(option => option.value === selectedGame) ? selectedGame : '';
    const refreshFilter = document.getElementById('taskRefreshTypeFilter');
    if (!filterInitialized) {
        refreshFilter.replaceChildren(new Option('All intervals', ''));
        for (const refreshType of RefreshTypeEnum.presets) {
            refreshFilter.add(new Option(refreshType.value, String(refreshType.id)));
        }
        filter.addEventListener('change', renderTaskList);
        refreshFilter.addEventListener('change', renderTaskList);
        document.getElementById('taskHideCompleted').addEventListener('change', renderTaskList);
        document.getElementById('createWeekliesBtn').addEventListener('click', handleCreateWeeklies);
        filterInitialized = true;
    }
    renderTaskList();
}

function renderTaskList() {
    const gameId = document.getElementById('taskGameFilter').value;
    const game = loadedGames.find(game => String(game.id) === gameId);
    document.getElementById('createWeekliesBtn').disabled = creatingWeeklies || !weeklyGameDataLoaded
        || !WEEKLY_BATCHES.some(batch => batch.abbreviation === game?.abbreviation);
    const refreshType = document.getElementById('taskRefreshTypeFilter').value;
    const hideCompleted = document.getElementById('taskHideCompleted').checked;
    const tasks = filterTasks(loadedTasks, { gameId, interval: refreshType, hideCompleted });
    const gameScheduleBody = document.getElementById("gameScheduleBody");
    gameScheduleBody.innerHTML = ''; // clear data

    tasks.forEach(task => {
        const row = createTaskRow(task);
        gameScheduleBody.appendChild(row);
        addTaskEventListeners(task);
    });
    document.getElementById('taskListStatus').textContent = tasks.length
        ? `${tasks.length} activities` : 'No activities match the selected filters.';
}

function createTaskRow(task) {
    let row = document.createElement("tr");
    if (task.game && task.game.color) {
        row.style.backgroundColor = task.game.color;
    }

    row.innerHTML = `
        <td>
            <input type="checkbox" id="task-checkbox-${task.id}" ${task.isDone ? "checked" : ""}>
        </td>
        <td class="task-game-description"></td>
        <td class="task-description"></td>
        <td>${RefreshTypeEnum.describe(task)}</td>
        <td>${formatDateForDisplay(task.expirationDate)}</td>
        <td class="list-action-cell">
            <div class="list-actions">
                <button class="button-edit" id="edit-task-${task.id}"><span class="button-icon" aria-hidden="true">&#9998;</span> Edit</button>
                <button class="button-delete" id="delete-task-${task.id}"><span class="button-icon" aria-hidden="true">${task.eventCandidateId ? '&#8856;' : '&#128465;'}</span> ${task.eventCandidateId ? 'Ignorar' : 'Delete'}</button>
                ${task.eventCandidateId && task.eventDeadlineManual ? `<button class="button-neutral" id="restore-deadline-${task.id}" type="button">Usar prazo da API</button>` : ''}
            </div>
        </td>
    `;

    const summary = document.createElement('div');
    row.querySelector('.task-game-description').textContent = task.gameDescription;
    summary.className = 'task-summary';
    summary.appendChild(createEventCover(task.coverUrl, 'task-cover'));
    const description = document.createElement('span');
    description.textContent = task.description;
    if (task.startAt && task.startAt > new Date()) {
        const start = document.createElement('small');
        start.className = 'task-start';
        start.textContent = `Começa em ${task.startAt.toLocaleString('pt-BR')}`;
        description.appendChild(start);
    }
    summary.appendChild(description);
    row.querySelector('.task-description').appendChild(summary);
    if (task.eventCandidateId && task.eventDeadlineManual) {
        const note = document.createElement('small');
        note.className = 'task-deadline-note';
        note.textContent = 'Prazo ajustado manualmente';
        row.cells[4].appendChild(note);
    }

    return row;
}

function addTaskEventListeners(task) {
    const checkbox = document.getElementById(`task-checkbox-${task.id}`);
    const editButton = document.getElementById(`edit-task-${task.id}`);
    const deleteButton = document.getElementById(`delete-task-${task.id}`);
    const restoreButton = document.getElementById(`restore-deadline-${task.id}`);
    if (deleteButton) {
        deleteButton.title = task.eventCandidateId
            ? 'Remove esta tarefa e impede que o evento seja recriado pela sincronização.'
            : 'Exclui esta tarefa.';
    }

    if (checkbox) 
        checkbox.addEventListener("change", () => handleTaskCompletion(task, checkbox))
 
    if (editButton)
        editButton.addEventListener("click", () => handleTaskEdit(task.id))

    if (deleteButton) 
        deleteButton.addEventListener("click", () => handleDelete(task));
    if (restoreButton) restoreButton.addEventListener('click', () => runTaskAction(task, {
        loadingMessage: 'Restaurando prazo da API...',
        successMessage: 'Prazo da API restaurado.',
        errorMessage: 'Não foi possível restaurar o prazo. Confira se a fonte possui uma data válida e tente novamente.',
        save: () => restoreEventApiDeadline(task.eventCandidateId),
    }));
}

async function handleCreateWeeklies() {
    if (creatingWeeklies) return;
    const game = loadedGames.find(game => String(game.id) === document.getElementById('taskGameFilter').value);
    if (!game) return;
    creatingWeeklies = true;
    const button = document.getElementById('createWeekliesBtn');
    button.disabled = true;
    setFeedback('taskListMessage');
    try {
        await withLoading('Criando weeklies...', async () => {
            const result = await createWeeklyTasksForGame(game.abbreviation);
            const message = result.created || result.preserved
                ? `Lote inicial registrado: ${result.created} criada(s), ${result.preserved} existente(s) preservada(s) com seus dados e repetição atuais.`
                : 'Lote inicial já registrado. A criação é única por jogo; nenhuma tarefa foi recriada.';
            await displayAllTasks({ successMessage: message });
        });
    } catch (error) {
        console.error('Failed to create weekly batch:', error);
        setFeedback('taskListMessage', 'Não foi possível criar as weeklies. As tarefas existentes foram preservadas. Tente novamente.', 'error');
    } finally {
        creatingWeeklies = false;
        renderTaskList();
    }
}

async function runTaskAction(task, { loadingMessage, successMessage, errorMessage, save, onSaved, onError }) {
    const controls = [...document.getElementById(`task-checkbox-${task.id}`).closest('tr').querySelectorAll('input, button')];
    const disabledStates = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    setFeedback('taskListMessage');
    try {
        return await withLoading(loadingMessage, async () => {
            try {
                await save();
            } catch (error) {
                console.error('Failed to change task:', error);
                onError?.();
                setFeedback('taskListMessage', errorMessage, 'error');
                return false;
            }
            onSaved?.();
            return displayAllTasks({ successMessage });
        });
    } finally {
        controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    }
}

async function handleTaskCompletion(task, checkbox) {
    const isDone = checkbox.checked;
    await runTaskAction(task, {
        loadingMessage: 'Salvando conclusão...',
        successMessage: isDone ? 'Tarefa concluída.' : 'Tarefa reaberta.',
        errorMessage: 'Não foi possível salvar a conclusão. A seleção anterior foi restaurada. Tente novamente.',
        save: () => completeTask(task.id, isDone),
        onSaved: () => { task.isDone = isDone; renderTaskList(); },
        onError: () => { checkbox.checked = task.isDone; },
    });
}

async function handleTaskEdit (taskId) {
    try {
        await withLoading('Carregando tarefa...', async () => {
            const task = await fetchTaskById(taskId);
            if (!task) throw new Error('Task not found.');
            await Router.navigateTo('/tasks/create');
            resetTaskForm();
            document.getElementById("taskId").value = task.id;
            document.getElementById("taskGameId").value = task.gameId;
            setTaskFormMessage();

            document.getElementById("taskDescription").value = task.description;
            document.getElementById('taskCoverUrl').value = task.coverUrl ?? '';
            document.getElementById('taskCoverUrl').disabled = Boolean(task.eventCandidateId);
            document.getElementById("expirationDay").value = 0;
            document.getElementById("expirationHour").value = 0;

            setDateSelector(true);
            document.getElementById("expirationDate").value = task.expirationDate
                ? `${formatDateForInput(task.expirationDate)}:${String(task.expirationDate.getSeconds()).padStart(2, '0')}` : '';
            setTaskRecurrence(RefreshTypeEnum.getRepeatDays(task), Boolean(task.eventCandidateId));
            document.getElementById('taskGameId').disabled = Boolean(task.eventCandidateId);
        });
    } catch (error) {
        console.error('Failed to open task:', error);
        setFeedback('taskListMessage', 'Não foi possível abrir a tarefa. Recarregue a lista e tente novamente.', 'error');
    }
}    

async function handleDelete(task) {
    const imported = Boolean(task.eventCandidateId);
    await runTaskAction(task, {
        loadingMessage: imported ? 'Ignorando evento...' : 'Excluindo tarefa...',
        successMessage: imported ? 'Evento ignorado. Ele não será recriado pela sincronização.' : 'Tarefa excluída.',
        errorMessage: imported ? 'Não foi possível ignorar o evento. Ele continua na lista. Tente novamente.'
            : 'Não foi possível excluir a tarefa. Ela continua na lista. Tente novamente.',
        save: () => imported ? ignoreImportedTask(task.id) : deleteTaskById(task.id),
        onSaved: () => {
            loadedTasks = loadedTasks.filter(row => row.id !== task.id);
            renderTaskList();
        },
    });
}

export async function handleAddTask() {
    const selectGame = document.getElementById("taskGameId");
    const gameId = parseInt(selectGame.value);
    const gameDescription = selectGame.options[selectGame.selectedIndex].text;
    const taskDescription = document.getElementById("taskDescription").value;
    const repeats = document.getElementById('refreshType').value !== '0';
    const repeatDays = repeats ? Number(document.getElementById('taskRepeatDays').value) : null;
    if (repeats && (!Number.isInteger(repeatDays) || repeatDays < 1 || repeatDays > 2147483647)) {
        throw new Error('Enter a positive whole number of days.');
    }
    const refreshType = RefreshTypeEnum.findPresetId(repeatDays);

    const hasDateSelector = document.getElementById("hasDateSelector").checked;
    let expirationDate = new Date();
    if (hasDateSelector) {
        expirationDate = new Date(document.getElementById("expirationDate").value);
    } else {
        const expirationDay = parseInt(document.getElementById("expirationDay").value) | 0;
        const expirationHour = parseInt(document.getElementById("expirationHour").value) | 0;    
        expirationDate = getExpirationDate(expirationDay, expirationHour);
    }

    const taskId = document.getElementById("taskId").value ? parseInt(document.getElementById("taskId").value) : undefined;
    const existingTask = taskId ? await fetchTaskById(taskId) : null;
    if (taskId && !existingTask) throw new Error('Task not found. Reload the list before saving.');

    const task = new Task(
        taskDescription,
        expirationDate,
        refreshType,
        gameId,
        gameDescription,
        taskId,
    );
    const coverInput = document.getElementById('taskCoverUrl');
    task.repeatDays = repeatDays;
    if (existingTask) task.isDone = existingTask.isDone;
    if (!coverInput.disabled) task.coverUrl = coverInput.value.trim() || null;
    
    if (taskId) {
        await updateTask(task);
    } else {
        await addTask(task);
    }

    resetTaskForm();
}

