import { fetchTasksByGame } from '../database/taskDB.js';
import {
    approveEventCandidate,
    fetchPendingEventCandidates,
    fetchEventReviewCounts,
    ignoreEventCandidate,
    ignoreImportedTask,
} from '../database/eventCandidateDB.js';
import { formatDateForInput, formatTimeUntil } from '../utils/dateUtils.js';
import Router from '../utils/router.js';
import { EVENT_GAMES, getEventGame } from '../events/eventGames.js';
import { createEventCover } from './eventCover.js';


function appendText(parent, tag, value, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.appendChild(element);
    return element;
}

function displayDate(value, timeZone) {
    if (!value) return 'ausente';
    return new Date(value).toLocaleString('pt-BR', {
        ...(timeZone ? { timeZone } : {}),
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function makeCandidateCard(candidate, existingTasks, game) {
    const card = document.createElement('li');
    card.className = 'event-candidate';
    card.appendChild(createEventCover(candidate.cover_url, 'event-candidate-cover'));
    appendText(card, 'h3', candidate.name);
    appendText(card, 'p', 'Fonte: StarRailAssistant');
    const startAt = candidate.proposed_start_at ?? candidate.source_start_at;
    const phase = !startAt ? 'Início não informado'
        : Date.parse(startAt) > Date.now() ? 'Próximo evento' : 'Evento em andamento';
    appendText(card, 'p', `${phase} — início: ${displayDate(startAt)}`);
    appendText(card, 'p', `Fim recebido da API: ${displayDate(candidate.source_end_at, 'Asia/Shanghai')} (servidor Ásia)`);
    appendText(card, 'p', `Prazo sugerido no seu horário: ${displayDate(candidate.proposed_end_at)}`);
    if (candidate.review_reason) appendText(card, 'p', candidate.review_reason, 'event-review-warning');

    const source = document.createElement('a');
    source.href = game.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Ver resposta da fonte';
    card.appendChild(source);

    const deadlineLabel = appendText(card, 'label', 'Prazo final correto no horário do seu dispositivo:');
    const deadlineInput = document.createElement('input');
    deadlineInput.type = 'datetime-local';
    deadlineInput.step = '1';
    deadlineInput.value = candidate.proposed_end_at
        ? `${formatDateForInput(candidate.proposed_end_at)}:${String(new Date(candidate.proposed_end_at).getSeconds()).padStart(2, '0')}`
        : '';
    deadlineLabel.appendChild(deadlineInput);
    const remaining = appendText(card, 'p', '', 'event-review-remaining');
    function updateRemainingTime() {
        remaining.textContent = deadlineInput.value
            ? formatTimeUntil(deadlineInput.value)
            : 'Informe um prazo para ver o tempo restante.';
    }
    deadlineInput.addEventListener('input', updateRemainingTime);
    updateRemainingTime();

    const taskLabel = appendText(card, 'label', 'Tarefa existente (opcional):');
    const taskSelect = document.createElement('select');
    const matchingTasks = existingTasks.filter(task =>
        (task.description ?? '').trim().toLocaleLowerCase() === candidate.name.toLocaleLowerCase());
    if (!candidate.task_id && matchingTasks.length) {
        appendText(card, 'p', 'Já existe uma tarefa de evento com esse nome. Vincule-a ou ignore o candidato para evitar duplicata.', 'event-review-warning');
    }
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Criar nova tarefa';
    taskSelect.appendChild(emptyOption);
    for (const task of existingTasks) {
        const option = document.createElement('option');
        option.value = task.id;
        option.textContent = `${task.description} — ${displayDate(task.expirationDate)}`;
        if (candidate.task_id === task.id) option.selected = true;
        taskSelect.appendChild(option);
    }
    if (candidate.task_id) {
        taskSelect.disabled = true;
        appendText(card, 'p', 'Este evento já está vinculado à tarefa selecionada.', 'event-review-warning');
    }
    taskLabel.appendChild(taskSelect);

    const message = appendText(card, 'p', '', 'event-review-message');
    const approveButton = appendText(card, 'button', 'Aprovar prazo', 'button-save');
    approveButton.type = 'button';
    const ignoreButton = appendText(card, 'button', 'Ignorar', 'button-neutral');
    ignoreButton.type = 'button';
    const ignoreIcon = document.createElement('span');
    ignoreIcon.className = 'button-icon';
    ignoreIcon.setAttribute('aria-hidden', 'true');
    ignoreIcon.textContent = '\u2298';
    ignoreButton.prepend(ignoreIcon);

    async function act(action) {
        approveButton.disabled = true;
        ignoreButton.disabled = true;
        message.textContent = 'Salvando...';
        try {
            await action();
            await Router.route();
        } catch (error) {
            message.textContent = error.message ?? 'Não foi possível salvar.';
            approveButton.disabled = false;
            ignoreButton.disabled = false;
        }
    }

    approveButton.addEventListener('click', () => act(async () => {
        const deadline = new Date(deadlineInput.value);
        if (!deadlineInput.value || Number.isNaN(deadline.getTime())) {
            throw new Error('Informe o prazo final antes de aprovar.');
        }
        if (!candidate.task_id && matchingTasks.length && !taskSelect.value) {
            throw new Error('Selecione a tarefa existente antes de aprovar este evento.');
        }
        await approveEventCandidate(candidate.id, deadline.toISOString(), taskSelect.value ? Number(taskSelect.value) : null);
    }));
    ignoreButton.addEventListener('click', () => act(() => candidate.task_id
        ? ignoreImportedTask(candidate.task_id) : ignoreEventCandidate(candidate.id)));
    return { card, updateRemainingTime };
}

let remainingTimeInterval;

export function stopEventReviewTimer() {
    clearInterval(remainingTimeInterval);
}

export async function displayEventReviewCount() {
    const count = document.getElementById('eventReviewCount');
    try {
        const counts = await fetchEventReviewCounts();
        count.textContent = String(Object.values(counts).reduce((sum, value) => sum + value, 0));
    } catch (error) {
        count.textContent = '?';
        console.error('Failed to count event candidates:', error);
    }
}

export async function displayEventGames() {
    const list = document.getElementById('eventGamesList');
    const message = document.getElementById('eventGamesStatus');
    list.replaceChildren();
    message.textContent = 'Carregando...';
    try {
        const counts = await fetchEventReviewCounts();
        for (const game of EVENT_GAMES) {
            const button = appendText(list, 'button', `${game.name} — ${counts[game.key]} para revisar`, 'button-neutral');
            button.type = 'button';
            button.addEventListener('click', () => Router.navigateTo(`/events/${game.key}`));
        }
        message.textContent = 'Selecione um jogo para revisar os eventos atuais e próximos.';
    } catch (error) {
        message.textContent = 'Não foi possível carregar a revisão de eventos.';
        console.error(error);
    }
}

export async function displayEventCandidates(gameKey) {
    const game = getEventGame(gameKey);
    document.getElementById('eventReviewTitle').textContent = `Eventos encontrados: ${game.name}`;
    const list = document.getElementById('eventReviewList');
    const message = document.getElementById('eventReviewStatus');
    clearInterval(remainingTimeInterval);
    list.replaceChildren();
    message.textContent = 'Carregando...';
    try {
        const candidates = await fetchPendingEventCandidates(game);

        message.textContent = candidates.length
            ? 'Informe o prazo dos eventos que vieram sem uma data final utilizável.'
            : 'Nenhum evento precisa de revisão.';
        if (!candidates.length) return;
        const tasks = await fetchTasksByGame(candidates[0].game_id);
        const existingTasks = tasks.filter(task => task.game?.abbreviation === game.abbreviation && task.refreshType === 0);
        const counters = [];
        for (const candidate of candidates) {
            const { card, updateRemainingTime } = makeCandidateCard(candidate, existingTasks, game);
            list.appendChild(card);
            counters.push(updateRemainingTime);
        }
        if (counters.length) {
            remainingTimeInterval = setInterval(() => counters.forEach(update => update()), 60_000);
        }
    } catch (error) {
        message.textContent = 'Não foi possível carregar os eventos. Confira se o SQL atualizado foi aplicado no Supabase.';
        console.error('Failed to load event candidates:', error);
    }
}
