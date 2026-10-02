// js\ui\formHandler.js
import { handleAddGame } from './gameUI.js';
import { handleAddTask } from './taskUI.js';
import Router from '../utils/router.js';

export function initializeGameForm() {
    const gameForm = document.getElementById("game-form");
    gameForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        await handleAddGame();
        Router.navigateTo('/');
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
        await handleAddTask();
        Router.navigateTo('/tasks');
    })

    const createTaskBtn = document.getElementById("createTaskBtn");
    if (createTaskBtn) {
        createTaskBtn.addEventListener("click", () => handleCallTaskFormButton());
    }

    const hasDateSelector = document.getElementById("hasDateSelector");
    if (hasDateSelector) {
        hasDateSelector.addEventListener("change", () => handleDateSelector(hasDateSelector.checked));
    }
}

function handleCallTaskFormButton() {
    Router.navigateTo('/tasks/create');
    resetTaskForm();
}

export function resetTaskForm() {
    document.getElementById('taskGameId').disabled = false;
    document.getElementById('refreshType').disabled = false;
    document.getElementById("taskId").value = '';
    document.getElementById("taskDescription").value = '';
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
