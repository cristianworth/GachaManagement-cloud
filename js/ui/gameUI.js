// js\ui\gameUI.js
import { Game } from '../data/Game.js';
import { fetchGameById, fetchAllGames, updateGame, addGame, deleteGameById } from '../database/gameDB.js';
import { calculateMaxStaminaDate, formatDateToDayHour } from '../utils/dateUtils.js';
import { resetGameForm, setGameFormMessage } from './formHandler.js';
import { getRandomColor } from '../utils/colorUtils.js';
import Router from '../utils/router.js';

export async function displayAllGames() {
    const games = await fetchAllGames();
    const gameListBody = document.getElementById("gameListBody");
    gameListBody.innerHTML = ''; // clear data

    games.forEach(game => {
        const row = createGameRow(game);
        gameListBody.appendChild(row);
        addGameEventListeners(game);
    });
}

function createGameRow(game) {
    let row = document.createElement("tr");
    const maxStaminaAt = formatDateToDayHour(game.dateMaxStamina);

    row.innerHTML = `
        <td>
            <img src=${game.img} alt="${game.description} Icon" class="icon">
        </td>
        <td>${game.description}</td>
        <td>
            <textarea id="pendingTask${game.id}" spellcheck="false">${game.pendingTasks || ''}</textarea>
        </td>
        <td>
            <input class="input-centered spacing-left" id="currentStamina${game.id}" type="number" value="${game.currentStamina | ''}" />
            <button class="spacing-left" id="save-game-${game.id}">Save</button>
        </td>
        <td>
            <span id="newMaxStaminaAt${game.id}" class="spacing-left red-text">${maxStaminaAt}<\span>
        </td>
        <td>
            <button class="spacing-left" id="edit-game-${game.id}">Edit</button>
            <button class="spacing-left" id="delete-game-${game.id}">Delete</button>
        </td>
    `;

    return row;
}

export function addGameEventListeners(game) {
    const saveGame = document.getElementById(`save-game-${game.id}`);
    const editGame = document.getElementById(`edit-game-${game.id}`);
    const deleteGame = document.getElementById(`delete-game-${game.id}`);

    if (saveGame)
        saveGame.addEventListener("click", () => handleGameSave(game.id));
    
    if (editGame)     
        editGame.addEventListener("click", () => handleGameEdit(game.id))
    
    if (deleteGame)     
        deleteGame.addEventListener("click", () => handleDelete(game.id))
    
}

async function handleGameSave(gameId) {
    setLoadingState(true);

    try {
        let game = await fetchGameById(gameId);
        const currentStamina = parseInt(document.getElementById(`currentStamina${game.id}`).value, 10);
        const pendingTask = document.getElementById(`pendingTask${gameId}`).value;

        if (!isNaN(currentStamina)) {
            game.currentStamina = currentStamina;
            game.pendingTasks = pendingTask;
            game.dateMaxStamina = calculateMaxStaminaDate(game);
            game.maxStaminaAt = formatDateToDayHour(game.dateMaxStamina);
            
            await updateGame(game);
            await displayAllGames();
        } else {
            alert("Please enter a valid number for stamina.");
        }
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    const loadingOverlay = document.getElementById("loadingOverlay");
    loadingOverlay.hidden = !isLoading;
}

async function handleGameEdit(gameId) {
    Router.navigateTo('/games/create');

    const game = await fetchGameById(gameId);
    if (game) {
        document.getElementById("gameId").value = game.id;
        setGameFormMessage();
        
        document.getElementById("gameDescription").value = game.description;
        document.getElementById("abbreviation").value = game.abbreviation;
        document.getElementById("capStamina").value = game.capStamina;
        document.getElementById("staminaPerMinute").value = game.staminaPerMinute;
    }
}

async function handleDelete(gameId) {
    await deleteGameById(gameId);
    await displayAllGames();
}

export async function handleAddGame() {
    const gameDescription = document.getElementById("gameDescription").value;
    const abbreviation = document.getElementById("abbreviation").value;
    const capStamina = document.getElementById("capStamina").value;
    const staminaPerMinute = document.getElementById("staminaPerMinute").value;

    const gameId = (document.getElementById("gameId").value) ? parseInt(document.getElementById("gameId").value) : undefined;
    
    const game = new Game(
        gameDescription, 
        abbreviation, 
        'img/default-icon.png',
        capStamina,
        staminaPerMinute,
        getRandomColor(),
        gameId
    );

    if (gameId) {
        await updateGame(game);
    } else {
        await addGame(game);
    }

    displayAllGames();
    resetGameForm();
}
