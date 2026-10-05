// js\ui\gameUI.js
import { Game } from '../data/Game.js';
import { fetchGameById, fetchAllGames, updateGame, addGame, deleteGameById } from '../database/gameDB.js';
import { calculateMaxStaminaDate, formatDateToDayHour } from '../utils/dateUtils.js';
import { resetGameForm, setGameFormMessage } from './formHandler.js';
import { getRandomColor } from '../utils/colorUtils.js';
import Router from '../utils/router.js';
import { createGameIcon } from './eventCover.js';
import { withLoading } from './loadingState.js';
import { setFeedback } from './feedback.js';

export async function displayAllGames({ successMessage = '' } = {}) {
    return withLoading('Carregando jogos...', async () => {
        const retry = document.getElementById('gameListRetry');
        if (retry) {
            retry.hidden = true;
            retry.onclick = () => displayAllGames();
        }
        setFeedback('gameListMessage');
        try {
            const games = await fetchAllGames();
            renderGameList(games);
            setFeedback('gameListMessage', successMessage || (games.length ? '' : 'Nenhum jogo selecionado. Use Selecionar jogos para começar.'));
            return true;
        } catch (error) {
            console.error('Failed to load game list:', error);
            setFeedback('gameListMessage', successMessage
                ? `${successMessage} Porém, não foi possível atualizar a lista. Use Tentar novamente para recarregar os dados.`
                : 'Não foi possível carregar os jogos. Os dados exibidos podem estar desatualizados. Tente novamente.', 'error');
            if (retry) retry.hidden = false;
            return false;
        }
    });
}

function renderGameList(games) {
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
        <td class="game-icon-cell"></td>
        <td class="game-description"></td>
        <td>
            <textarea
                id="pendingTask${game.id}"
                class="pending-task-editor"
                rows="4"
                spellcheck="true"
                placeholder="• Exemplo de tarefa&#10;• Outra tarefa"
            ></textarea>
        </td>
        <td>
            <div class="game-stamina-controls">
                <input class="input-centered" id="currentStamina${game.id}" type="number" value="${game.currentStamina | ''}" />
                <button class="button-save" id="save-game-${game.id}"><span class="button-icon" aria-hidden="true">&#10003;</span> Save</button>
            </div>
        </td>
        <td>
            <span id="newMaxStaminaAt${game.id}" class="spacing-left red-text">${maxStaminaAt}<\span>
        </td>
        <td class="list-action-cell">
            <div class="list-actions">
                <button class="button-edit" id="edit-game-${game.id}"><span class="button-icon" aria-hidden="true">&#9998;</span> Edit</button>
                <button class="button-delete" id="delete-game-${game.id}"><span class="button-icon" aria-hidden="true">&#128465;</span> Delete</button>
            </div>
        </td>
    `;

    row.querySelector('.game-icon-cell').appendChild(createGameIcon(game.img, game.description));
    row.querySelector('.game-description').textContent = game.description;
    row.querySelector('.pending-task-editor').setAttribute('aria-label', `Tarefas pendentes de ${game.description}`);
    row.querySelector('.pending-task-editor').value = game.pendingTasks || '';
    row.querySelector('.button-delete').textContent = 'Ocultar jogo';
    return row;
}

export function addGameEventListeners(game) {
    const saveGame = document.getElementById(`save-game-${game.id}`);
    const editGame = document.getElementById(`edit-game-${game.id}`);
    const deleteGame = document.getElementById(`delete-game-${game.id}`);
    const pendingTaskEditor = document.getElementById(`pendingTask${game.id}`);

    if (saveGame)
        saveGame.addEventListener("click", () => handleGameSave(game.id));
    
    if (editGame)     
        editGame.addEventListener("click", () => handleGameEdit(game.id))
    
    if (deleteGame)     
        deleteGame.addEventListener("click", () => handleDelete(game.id))

    if (pendingTaskEditor)
        pendingTaskEditor.addEventListener("keydown", handleBulletPoint)
    
}

function handleBulletPoint(event) {
    if (event.key !== "Enter") return;

    const editor = event.currentTarget;
    const lineStart = editor.value.lastIndexOf("\n", editor.selectionStart - 1) + 1;
    const currentLine = editor.value.slice(lineStart, editor.selectionStart);

    if (!currentLine.trim() || currentLine.trim() === "•") return;

    event.preventDefault();
    const bullet = currentLine.match(/^\s*•\s*/)?.[0] || "• ";
    const beforeCursor = editor.value.slice(0, editor.selectionStart);
    const afterCursor = editor.value.slice(editor.selectionEnd);
    const nextValue = `${beforeCursor}\n${bullet}${afterCursor}`;
    const nextCursor = beforeCursor.length + bullet.length + 1;

    editor.value = nextValue;
    editor.setSelectionRange(nextCursor, nextCursor);
}

async function handleGameSave(gameId) {
    const currentStamina = parseInt(document.getElementById(`currentStamina${gameId}`).value, 10);
    if (Number.isNaN(currentStamina)) {
        setFeedback('gameListMessage', 'Informe um número válido para a stamina antes de salvar.', 'error');
        return;
    }
    await runGameAction(gameId, {
        loadingMessage: 'Salvando jogo...', successMessage: 'Stamina e anotações salvas.',
        errorMessage: 'Não foi possível salvar o jogo. Sua stamina e suas anotações foram mantidas na tela. Tente novamente.',
        save: async () => {
            const game = await fetchGameById(gameId);
            if (!game) throw new Error('Game not found.');
            const pendingTask = document.getElementById(`pendingTask${gameId}`).value;
            game.currentStamina = currentStamina;
            game.pendingTasks = pendingTask;
            game.dateMaxStamina = calculateMaxStaminaDate(game);
            game.maxStaminaAt = formatDateToDayHour(game.dateMaxStamina);
            
            await updateGame(game);
        },
    });
}

async function runGameAction(gameId, { loadingMessage, successMessage, errorMessage, save }) {
    const row = document.getElementById(`delete-game-${gameId}`).closest('tr');
    const buttons = [...row.querySelectorAll('button')];
    const disabledStates = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    setFeedback('gameListMessage');
    try {
        await withLoading(loadingMessage, async () => {
            try {
                await save();
            } catch (error) {
                console.error('Failed to change game:', error);
                setFeedback('gameListMessage', errorMessage, 'error');
                return;
            }
            await displayAllGames({ successMessage });
        });
    } finally {
        buttons.forEach((button, index) => { button.disabled = disabledStates[index]; });
    }
}

async function handleGameEdit(gameId) {
    try {
        await withLoading('Carregando jogo...', async () => {
            const game = await fetchGameById(gameId);
            if (!game) throw new Error('Game not found.');
            Router.navigateTo('/games/create');
            resetGameForm();
            document.getElementById("gameId").value = game.id;
            setGameFormMessage();
        
            document.getElementById("gameDescription").value = game.description;
            document.getElementById("abbreviation").value = game.abbreviation;
            document.getElementById('gameImageUrl').value = game.img?.startsWith('https://') ? game.img : '';
            document.getElementById("capStamina").value = game.capStamina;
            document.getElementById("staminaPerMinute").value = game.staminaPerMinute;
        });
    } catch (error) {
        console.error('Failed to open game:', error);
        setFeedback('gameListMessage', 'Não foi possível abrir o jogo. Recarregue a lista e tente novamente.', 'error');
    }
}

async function handleDelete(gameId) {
    await runGameAction(gameId, {
        loadingMessage: 'Ocultando jogo...', successMessage: 'Jogo ocultado neste perfil. Você pode selecioná-lo novamente.',
        errorMessage: 'Não foi possível ocultar o jogo. Ele continua na lista. Tente novamente.',
        save: async () => {
            await deleteGameById(gameId);
            document.getElementById(`delete-game-${gameId}`).closest('tr').remove();
        },
    });
}

export async function handleAddGame() {
    const gameDescription = document.getElementById("gameDescription").value;
    const abbreviation = document.getElementById("abbreviation").value;
    const capStamina = document.getElementById("capStamina").value;
    const staminaPerMinute = document.getElementById("staminaPerMinute").value;
    const imageUrl = document.getElementById('gameImageUrl').value.trim();

    const gameId = (document.getElementById("gameId").value) ? parseInt(document.getElementById("gameId").value) : undefined;
    
    const existingGame = gameId ? await fetchGameById(gameId) : null;
    if (gameId && !existingGame) throw new Error('Game not found. Reload the list before saving.');
    const image = imageUrl || (existingGame?.img?.startsWith('img/') ? existingGame.img : 'img/default-icon.png');
    const game = existingGame ? Object.assign(existingGame, {
        description: gameDescription, abbreviation, img: image, capStamina, staminaPerMinute,
    }) : new Game(
        gameDescription, 
        abbreviation, 
        image,
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

    resetGameForm();
}
