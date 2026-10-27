// js\ui\gameUI.js
import { Game, allGames } from '../data/Game.js';
import { fetchGameById, fetchAllGames, updateGame, addGame, deleteGameById, saveGameDailyState } from '../database/gameDB.js';
import { calculateMaxStaminaDate, estimateCurrentStamina, formatDateToDayHour } from '../utils/dateUtils.js';
import { resetGameForm, setGameFormMessage } from './formHandler.js';
import { getRandomColor } from '../utils/colorUtils.js';
import Router from '../utils/router.js';
import { createGameIcon } from './eventCover.js';
import { withLoading } from './loadingState.js';
import { setFeedback } from './feedback.js';
import { getProfileId, getSelectedProfileId } from '../services/profileSession.js';
import { startSilentRefresh } from './silentRefresh.js';
import { GAME_DAILY_STATES, getGameDailyState, sortGamesByDailyState } from '../utils/gameDailyState.js';
import { fillGameNoticeFields, readGameNoticeChanges } from './gameNotices.js';
import { setNotificationGames } from './gameNotifications.js';

let refreshingGames = false;
let renderedGames = [];
let renderedGamesProfile = null;
let staminaEstimateTimer = null;

export function stopStaminaEstimateTimer() {
    if (staminaEstimateTimer !== null) window.clearInterval(staminaEstimateTimer);
    staminaEstimateTimer = null;
    document.removeEventListener('visibilitychange', handleEstimateVisibility);
}

function canUpdateEstimates() {
    return !document.hidden && document.querySelector('[data-page="games"]').style.display !== 'none'
        && renderedGamesProfile === getSelectedProfileId();
}

function refreshStaminaEstimates() {
    if (!canUpdateEstimates()) return;
    const now = new Date();
    for (const game of renderedGames) {
        const row = document.getElementById(`estimatedStamina${game.id}`)?.closest('tr');
        if (row) {
            updateStaminaEstimate(row, game, now);
            updateGameDailyControl(row, game, now);
        }
    }
    reorderGameRows(now);
}

function reorderGameRows(now = new Date()) {
    const sorted = sortGamesByDailyState(renderedGames, now);
    if (sorted.every((game, index) => game === renderedGames[index])) return;
    const focused = document.activeElement;
    const selection = typeof focused?.selectionStart === 'number'
        ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    const rows = new Map([...document.querySelectorAll('#gameListBody tr')].map(row =>
        [Number(row.dataset.gameId), row]));
    const list = document.getElementById('gameListBody');
    sorted.forEach(game => { const row = rows.get(game.id); if (row) list.appendChild(row); });
    renderedGames = sorted;
    if (focused?.isConnected && document.activeElement !== focused && document.activeElement === document.body) {
        focused.focus({preventScroll:true});
        if (selection) focused.setSelectionRange(...selection);
    }
}

function handleEstimateVisibility() {
    if (staminaEstimateTimer !== null) window.clearInterval(staminaEstimateTimer);
    staminaEstimateTimer = null;
    if (!renderedGames.length || !canUpdateEstimates()) return;
    // Recompute from the saved forecast after background throttling, rather than counting ticks.
    refreshStaminaEstimates();
    staminaEstimateTimer = window.setInterval(refreshStaminaEstimates, 60_000);
}

function startStaminaEstimateTimer() {
    stopStaminaEstimateTimer();
    document.addEventListener('visibilitychange', handleEstimateVisibility);
    handleEstimateVisibility();
}

async function handleRetryGames() {
    if (refreshingGames) return;
    refreshingGames = true;
    const button = document.getElementById('gameListRetry');
    if (button) button.disabled = true;
    try {
        return await displayAllGames({ preserveDrafts: true });
    } finally {
        refreshingGames = false;
        if (button) button.disabled = false;
    }
}

export async function displayAllGames({ successMessage = '', preserveDrafts = false, silent = false, canApply = () => true } = {}) {
    const load = async () => {
        const retry = document.getElementById('gameListRetry');
        if (retry && !silent) {
            retry.hidden = true;
            retry.onclick = handleRetryGames;
        }
        if (!silent) setFeedback('gameListMessage');
        try {
            const profileId = getProfileId();
            const games = await fetchAllGames();
            if (profileId !== getSelectedProfileId()) return false;
            if (!canApply()) return null;
            // Read drafts after the request so edits made while it was pending also survive.
            const drafts = preserveDrafts ? collectGameDrafts() : new Map();
            const availableFields = new Set(games.flatMap(game => [`currentStamina${game.id}`, `pendingTask${game.id}`]));
            if ([...drafts.keys()].some(id => !availableFields.has(id))) {
                if (!silent) setFeedback('gameListMessage', 'Um jogo com alterações não salvas saiu da seleção. A lista foi mantida para preservar seus rascunhos. Copie o que precisar antes de recarregar a página.', 'error');
                return false;
            }
            const focused = silent ? document.activeElement : null;
            renderGameList(games, drafts);
            if (focused?.id) (document.getElementById(focused.id) ?? document.getElementById('selectGamesBtn'))?.focus();
            startSilentRefresh('games', canApply => displayAllGames({ preserveDrafts: true, silent: true, canApply }), () => refreshingGames);
            const message = successMessage || (games.length ? '' : 'Nenhum jogo selecionado. Use Selecionar jogos para começar.');
            if (!silent) setFeedback('gameListMessage', drafts.size ? `${message} Alterações não salvas foram mantidas. As estimativas usam os dados salvos.` : message);
            await setNotificationGames(games, profileId);
            return true;
        } catch (error) {
            console.error('Failed to load game list:', error);
            if (silent) return false;
            setFeedback('gameListMessage', preserveDrafts
                ? 'Não foi possível atualizar os dados. A lista e seus rascunhos foram mantidos. Use Tentar novamente.' : successMessage
                ? `${successMessage} Porém, não foi possível atualizar a lista. Use Tentar novamente para recarregar os dados.`
                : 'Não foi possível carregar os jogos. Os dados exibidos podem estar desatualizados. Tente novamente.', 'error');
            if (retry) retry.hidden = false;
            return false;
        }
    };
    return silent ? load() : withLoading(preserveDrafts ? 'Atualizando dados...' : 'Carregando jogos...', load);
}

function collectGameDrafts() {
    const fields = document.querySelectorAll('#gameListBody input[id^="currentStamina"], #gameListBody textarea[id^="pendingTask"]');
    return new Map([...fields].filter(field => field.value !== field.defaultValue).map(field => [field.id, field.value]));
}

function renderGameList(games, drafts = new Map()) {
    const now = new Date();
    renderedGames = sortGamesByDailyState(games, now);
    renderedGamesProfile = getSelectedProfileId();
    const gameListBody = document.getElementById("gameListBody");
    gameListBody.innerHTML = ''; // clear data
    renderedGames.forEach(game => {
        const row = createGameRow(game, now);
        gameListBody.appendChild(row);
        addGameEventListeners(game);
    });
    for (const [id, value] of drafts) document.getElementById(id).value = value;
    startStaminaEstimateTimer();
}

function createGameRow(game, now) {
    let row = document.createElement("tr");
    row.dataset.gameId = String(game.id);

    row.innerHTML = `
        <td class="game-icon-cell"></td>
        <td class="game-description">
            <span class="game-name"></span>
            <div class="game-daily-control">
                <label for="daily-state-${game.id}">Hoje</label>
                <select id="daily-state-${game.id}"></select>
            </div>
        </td>
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
            <div class="game-stamina-estimate">
                <output id="estimatedStamina${game.id}" aria-live="polite"></output>
                <span id="newMaxStaminaAt${game.id}" class="red-text"></span>
            </div>
        </td>
        <td class="list-action-cell">
            <div class="list-actions">
                <button class="button-edit" id="edit-game-${game.id}"><span class="button-icon" aria-hidden="true">&#9998;</span> Edit</button>
                <button class="button-delete" id="delete-game-${game.id}"><span class="button-icon" aria-hidden="true">&#128465;</span> Delete</button>
            </div>
        </td>
    `;

    // Older seeds stored a placeholder for NTE; keep explicitly configured images.
    const iconUrl = game.abbreviation === 'NTE' && (!game.img || game.img === 'img/default-icon.png')
        ? allGames.find(preset => preset.abbreviation === 'NTE').img : game.img;
    row.querySelector('.game-icon-cell').appendChild(createGameIcon(iconUrl, game.description));
    row.querySelector('.game-name').textContent = game.description;
    const dailyState = row.querySelector('.game-daily-control select');
    dailyState.setAttribute('aria-label', `Estado diário de ${game.description}`);
    for (const [value, label] of Object.entries(GAME_DAILY_STATES)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        dailyState.append(option);
    }
    row.querySelector('.pending-task-editor').setAttribute('aria-label', `Tarefas pendentes de ${game.description}`);
    row.querySelector('.pending-task-editor').defaultValue = game.pendingTasks || '';
    row.querySelector('.button-delete').textContent = 'Ocultar jogo';
    updateStaminaEstimate(row, game, now);
    updateGameDailyControl(row, game, now);
    return row;
}

function updateStaminaEstimate(row, game, now = new Date()) {
    const estimate = estimateCurrentStamina(game, now);
    row.querySelector(`#estimatedStamina${game.id}`).textContent = estimate === null
        ? 'Estimativa indisponível. Salve a resina e confira o cadastro.'
        : `Resina estimada: ${estimate}/${Number(game.capStamina)}`;
    row.querySelector(`#newMaxStaminaAt${game.id}`).textContent = estimate === null
        ? 'Sem previsão válida.' : formatDateToDayHour(game.dateMaxStamina, now);
}

function updateGameDailyControl(row, game, now = new Date()) {
    const select = row.querySelector('.game-daily-control select');
    const state = getGameDailyState(game, now);
    row.dataset.dailyState = state ?? 'unavailable';
    if (row.dataset.dailySaving !== 'true') select.value = state ?? '';
}

async function handleGameDailyChange(game, select) {
    const profileId = getProfileId();
    if (renderedGamesProfile !== profileId || select.disabled) return;
    const row = select.closest('tr');
    const state = select.value;
    const hadFocus = document.activeElement === select;
    const controls = [...row.querySelectorAll('button, select')];
    const disabled = controls.map(control => control.disabled);
    const isCurrent = () => profileId === getSelectedProfileId() && renderedGames.includes(game)
        && row.isConnected && document.querySelector('[data-page="games"]').style.display !== 'none';
    row.dataset.dailySaving = 'true';
    controls.forEach(control => { control.disabled = true; });
    setFeedback('gameListMessage');
    await withLoading('Salvando estado diário...', async () => {
        try {
            game.dailyState = await saveGameDailyState(game.id, game.abbreviation, state);
            if (isCurrent()) setFeedback('gameListMessage', 'Estado diário salvo.');
        } catch (error) {
            console.error('Failed to save daily game state:', error);
            if (isCurrent()) setFeedback('gameListMessage', 'Não foi possível salvar o estado diário. A marcação anterior foi mantida. Tente novamente.', 'error');
        } finally {
            delete row.dataset.dailySaving;
            controls.forEach((control, index) => { control.disabled = disabled[index]; });
            if (isCurrent()) {
                updateGameDailyControl(row, game);
                reorderGameRows();
                if (hadFocus && document.activeElement === document.body) select.focus();
            }
        }
    });
}

export function addGameEventListeners(game) {
    const saveGame = document.getElementById(`save-game-${game.id}`);
    const editGame = document.getElementById(`edit-game-${game.id}`);
    const deleteGame = document.getElementById(`delete-game-${game.id}`);
    const pendingTaskEditor = document.getElementById(`pendingTask${game.id}`);
    const dailyState = document.getElementById(`daily-state-${game.id}`);
    if (dailyState) dailyState.addEventListener('change', () => handleGameDailyChange(game, dailyState));
    if (saveGame)
        saveGame.addEventListener("click", () => handleGameSave(game.id));
    
    if (editGame)     
        editGame.addEventListener("click", () => handleGameEdit(game.id))
    
    if (deleteGame)     
        deleteGame.addEventListener("click", () => handleDelete(game.id))

    if (pendingTaskEditor) {
        pendingTaskEditor.addEventListener('keydown', handleBulletPoint);
        pendingTaskEditor.addEventListener('input', handleTodoInput);
        pendingTaskEditor.addEventListener('compositionend', handleTodoInput);
    }
    
}

function handleTodoInput(event) {
    if (!event.isComposing) formatTodoEditor(event.currentTarget);
}

function formatTodoEditor(editor) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const direction = editor.selectionDirection;
    let startOffset = 0;
    let endOffset = 0;
    const value = editor.value.replace(/^[ \t]*(?=[^\s•])/gm, (indent, offset) => {
        const insertion = offset + indent.length;
        if (insertion <= start) startOffset += 2;
        if (insertion <= end) endOffset += 2;
        return `${indent}• `;
    });
    if (value === editor.value) return;
    editor.value = value;
    editor.setSelectionRange(start + startOffset, end + endOffset, direction);
}

function handleBulletPoint(event) {
    if (event.key !== "Enter" || event.isComposing) return;

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
    formatTodoEditor(editor);
}

async function handleGameSave(gameId) {
    const field = document.getElementById(`currentStamina${gameId}`);
    const notes = document.getElementById(`pendingTask${gameId}`);
    const currentStamina = parseInt(field.value, 10);
    if (Number.isNaN(currentStamina)) {
        setFeedback('gameListMessage', 'Informe um número válido para a stamina antes de salvar.', 'error');
        return;
    }
    const pendingTask = notes.value;
    const profileId = getProfileId();
    const now = new Date();
    await runGameAction(gameId, {
        loadingMessage: 'Salvando jogo...', successMessage: 'Stamina e anotações salvas.',
        errorMessage: 'Não foi possível salvar o jogo. Sua stamina e suas anotações foram mantidas na tela. Tente novamente.',
        save: async () => {
            const game = await fetchGameById(gameId);
            if (!game) throw new Error('Game not found.');
            if (profileId !== getSelectedProfileId()) throw new Error('The selected profile changed before saving.');
            game.currentStamina = currentStamina;
            game.pendingTasks = pendingTask;
            game.dateMaxStamina = calculateMaxStaminaDate(game, now);
            game.maxStaminaAt = formatDateToDayHour(game.dateMaxStamina);
            
            await updateGame(game, {completeDaily:true, now});
            field.defaultValue = String(currentStamina);
            notes.defaultValue = pendingTask;
        },
    });
}

async function runGameAction(gameId, { loadingMessage, successMessage, errorMessage, save }) {
    const row = document.getElementById(`delete-game-${gameId}`).closest('tr');
    const profileId = getProfileId();
    const isCurrent = () => profileId === getSelectedProfileId()
        && document.querySelector('[data-page="games"]').style.display !== 'none';
    const buttons = [...row.querySelectorAll('button, select')];
    const disabledStates = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    setFeedback('gameListMessage');
    try {
        await withLoading(loadingMessage, async () => {
            try {
                await save();
            } catch (error) {
                console.error('Failed to change game:', error);
                if (isCurrent()) setFeedback('gameListMessage', errorMessage, 'error');
                return;
            }
            if (isCurrent()) await displayAllGames({ successMessage, preserveDrafts:true });
        });
    } finally {
        buttons.forEach((button, index) => { button.disabled = disabledStates[index]; });
    }
}

async function handleGameEdit(gameId) {
    const profileId = getProfileId();
    try {
        await withLoading('Carregando jogo...', async () => {
            const game = await fetchGameById(gameId);
            if (!game) throw new Error('Game not found.');
            if (profileId !== getSelectedProfileId()) throw new Error('Profile changed before opening the game.');
            Router.navigateTo('/games/create');
            resetGameForm();
            document.getElementById("gameId").value = game.id;
            setGameFormMessage();
        
            document.getElementById("gameDescription").value = game.description;
            document.getElementById("abbreviation").value = game.abbreviation;
            document.getElementById('gameImageUrl').value = game.img?.startsWith('https://') ? game.img : '';
            document.getElementById("capStamina").value = game.capStamina;
            document.getElementById("staminaPerMinute").value = game.staminaPerMinute;
            fillGameNoticeFields(game);
        });
    } catch (error) {
        console.error('Failed to open game:', error);
        setFeedback('gameListMessage', 'Não foi possível abrir o jogo. Recarregue a lista e tente novamente.', 'error');
    }
}

async function handleDelete(gameId) {
    const row = document.getElementById(`delete-game-${gameId}`).closest('tr');
    await runGameAction(gameId, {
        loadingMessage: 'Ocultando jogo...', successMessage: 'Jogo ocultado neste perfil. Você pode selecioná-lo novamente.',
        errorMessage: 'Não foi possível ocultar o jogo. Ele continua na lista. Tente novamente.',
        save: async () => {
            await deleteGameById(gameId);
            row.remove();
        },
    });
}

export async function handleAddGame() {
    const profileId = getProfileId();
    const formActor = document.getElementById('game-form').dataset.profileId;
    if (formActor && formActor !== profileId) throw new Error('Profile changed before saving the game.');
    const noticeSettings = readGameNoticeChanges();
    const gameDescription = document.getElementById("gameDescription").value;
    const abbreviation = document.getElementById("abbreviation").value;
    const capStamina = document.getElementById("capStamina").value;
    const staminaPerMinute = document.getElementById("staminaPerMinute").value;
    const imageUrl = document.getElementById('gameImageUrl').value.trim();

    const gameId = (document.getElementById("gameId").value) ? parseInt(document.getElementById("gameId").value) : undefined;
    
    const existingGame = gameId ? await fetchGameById(gameId) : null;
    if (profileId !== getSelectedProfileId()) throw new Error('Profile changed while reading the game.');
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
        await updateGame(game, { noticeSettings });
    } else {
        await addGame(game, { noticeSettings });
    }

    resetGameForm();
}
