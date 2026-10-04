// js\ui\formHandler.js
import { handleAddGame } from './gameUI.js';
import { handleAddTask } from './taskUI.js';
import Router from '../utils/router.js';
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';
import { withLoading } from './loadingState.js';
import { setFeedback } from './feedback.js';

export function initializeGameForm() {
    const gameForm = document.getElementById("game-form");
    gameForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        await submitForm('gameFormStatus', handleAddGame, '/');
    });

    const createGameBtn = document.getElementById("createGameBtn");
    if (createGameBtn) {
        createGameBtn.addEventListener("click", () => handleCallGameFormButton());
    }
}

function handleCallGameFormButton() {
    Router.navigateTo('/games/create');
    resetGameForm();
}

export function resetGameForm() {
    document.getElementById("gameId").value = '';
    document.getElementById("gameDescription").value = '';
    document.getElementById("abbreviation").value = '';
    document.getElementById('gameImageUrl').value = '';
    document.getElementById('gameFormStatus').hidden = true;
    document.getElementById("capStamina").value = 240;
    document.getElementById("staminaPerMinute").value = 6;
    setGameFormMessage();
}

export function setGameFormMessage() {
    const gameTask = document.getElementById("gameId").value;
    if (gameTask) {
        document.getElementById("submitGameForm").textContent = "Update";
        document.getElementById("game-form-title").textContent = "Update Game";
    } else {
        document.getElementById("submitGameForm").textContent = "Save";
        document.getElementById("game-form-title").textContent = "Create Game";
    }
}

export function initializeTaskForm() {
    const taskForm = document.getElementById("task-form");
    taskForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        await submitForm('taskFormStatus', handleAddTask, '/tasks');
    })

    const createTaskBtn = document.getElementById("createTaskBtn");
    if (createTaskBtn) {
        createTaskBtn.addEventListener("click", () => handleCallTaskFormButton());
    }

    const hasDateSelector = document.getElementById("hasDateSelector");
    if (hasDateSelector) {
        hasDateSelector.addEventListener("change", () => handleDateSelector(hasDateSelector.checked));
    }

    const refreshType = document.getElementById('refreshType');
    refreshType.addEventListener('change', () => {
        const preset = RefreshTypeEnum.presets.find(item => String(item.id) === refreshType.value);
        const days = preset.id === 8 ? document.getElementById('taskRepeatDays').value : preset.days;
        setTaskRecurrence(days, false, preset.id);
    });
    document.getElementById('taskRepeatDays').addEventListener('input', () => {
        refreshType.value = '8';
    });
}

export function setTaskRecurrence(days, sourceManaged = false, presetId = RefreshTypeEnum.findPresetId(days)) {
    document.getElementById('refreshType').value = String(presetId);
    document.getElementById('refreshType').disabled = sourceManaged;
    const repeats = presetId !== 0;
    const input = document.getElementById('taskRepeatDays');
    document.getElementById('taskRepeatDaysFields').hidden = !repeats;
    input.value = repeats ? days : '';
    input.disabled = !repeats || sourceManaged;
    input.required = repeats;
}

function handleCallTaskFormButton() {
    Router.navigateTo('/tasks/create');
    resetTaskForm();
}

export function resetTaskForm() {
    document.getElementById('taskGameId').disabled = false;
    setTaskRecurrence(null);
    document.getElementById('taskFormStatus').hidden = true;
    document.getElementById("taskId").value = '';
    document.getElementById("taskDescription").value = '';
    document.getElementById('taskCoverUrl').value = '';
    document.getElementById('taskCoverUrl').disabled = false;
    document.getElementById("expirationDay").value = 0;
    document.getElementById("expirationHour").value = 0;
    document.getElementById("expirationDate").value = '';
    setDateSelector(false);
    setTaskFormMessage();
}

export function setDateSelector(hasDateSelector) {
    document.getElementById("hasDateSelector").checked = hasDateSelector;
    handleDateSelector(hasDateSelector);
}

export function setTaskFormMessage() {
    const idTask = document.getElementById("taskId").value;
    if (idTask) {
        document.getElementById("submitTaskForm").textContent = "Update";
        document.getElementById("task-form-title").textContent = "Update Task";
    } else {
        document.getElementById("submitTaskForm").textContent = "Save";
        document.getElementById("task-form-title").textContent = "Create Task";
    }
}

function handleDateSelector(hasDateSelector) {
    if (hasDateSelector) {
        document.getElementById("divExpirationDate").hidden = false;
        document.getElementById("divExpirationDayAndHour").hidden = true;
    } else {
        document.getElementById("divExpirationDate").hidden = true;
        document.getElementById("divExpirationDayAndHour").hidden = false;
    }
}

async function submitForm(statusId, save, route) {
    const status = document.getElementById(statusId);
    const submit = status.closest('form').querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const task = statusId === 'taskFormStatus';
    submit.disabled = true;
    setFeedback(statusId);
    try {
        await withLoading(task ? 'Salvando tarefa...' : 'Salvando jogo...', async () => {
            await save();
            await Router.navigateTo(route, { successMessage: task ? 'Tarefa salva.' : 'Jogo salvo.' });
        });
    } catch (error) {
        console.error('Failed to save form:', error);
        setFeedback(statusId, `Não foi possível salvar ${task ? 'a tarefa' : 'o jogo'}. Seus dados foram mantidos no formulário. Tente novamente.`, 'error');
    } finally {
        submit.disabled = false;
    }
}
