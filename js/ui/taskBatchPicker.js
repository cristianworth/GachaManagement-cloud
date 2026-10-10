// Opening/cancelling performs no writes. Each explicit submission owns one retry identity.
import { fetchTaskBatchItems } from '../database/taskDB.js';
import { getSelectedProfileId } from '../services/profileSession.js';
import { setFeedback } from './feedback.js';
import { showDialog } from './dialogs.js';

let offers = [];
let actor = null;
let busy = false;
let attempt = null;
const isNew = item => ['never', 'deferred'].includes(item.state);
const selectable = item => isNew(item) || item.can_replace === true;
const stateLabels = {
    never: 'Disponível', deferred: 'Adiado', created: 'Já criado', preserved: 'Existente preservado',
    excluded: 'Excluído', legacy: 'Protegido pelo lote anterior',
    unavailable: 'Calendário da próxima fase pendente',
};
const el = id => document.getElementById(id);

export function initializeTaskBatchPicker(onLoad, updateControls) {
    const dialog = el('taskBatchDialog');
    el('chooseTaskBatchBtn').addEventListener('click', async () => {
        if (busy) return;
        actor = getSelectedProfileId();
        if (!actor) { setFeedback('taskListMessage', 'Selecione um perfil antes de escolher itens.', 'error'); return; }
        busy = true;
        el('chooseTaskBatchBtn').disabled = true;
        el('loadTaskBatchBtn').disabled = true;
        setFeedback('taskListMessage');
        try {
            const items = await fetchTaskBatchItems();
            if (getSelectedProfileId() !== actor) throw new Error('Profile changed while reading the batch.');
            offers = items;
            attempt = null;
            renderOffers();
            setFeedback('taskBatchMessage');
            dialog.showModal();
            el('taskBatchSelectAll').focus();
        } catch (error) {
            console.error('Failed to read task batch:', error);
            setFeedback('taskListMessage', 'Não foi possível abrir os itens do lote. Tente novamente.', 'error');
        } finally { busy = false; updateControls(); }
    });
    el('taskBatchCancel').addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => {
        const trigger = el('chooseTaskBatchBtn');
        (trigger.disabled ? el('taskListRetry') : trigger).focus();
    });
    el('taskBatchSelectAll').addEventListener('change', event => {
        for (const box of boxes()) if (!box.disabled) box.checked = event.target.checked;
        updateSummary();
    });
    el('taskBatchSelectionForm').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        if (getSelectedProfileId() !== actor) {
            setFeedback('taskBatchMessage', 'O perfil mudou. Feche e abra a seleção novamente.', 'error'); return;
        }
        const chosen = boxes().filter(box => !box.disabled && box.checked)
            .map(box => offers[Number(box.dataset.offerIndex)]);
        const replacements = chosen.filter(item => !isNew(item));
        const deferredCount = boxes().filter(box => !box.checked && isNew(offers[Number(box.dataset.offerIndex)])).length;
        busy = true;
        const controls = [...dialog.querySelectorAll('input, button')];
        const previous = controls.map(control => control.disabled);
        controls.forEach(control => { control.disabled = true; });
        try {
            if (replacements.length) {
                const decision = await showDialog({
                    titleText: `Recriar ${replacements.length} ${replacements.length === 1 ? 'item' : 'itens'} do zero?`,
                    text: replacements.map(item => item.game_description + ' — ' + item.description).join('\n')
                        + '\n\nSomente neste perfil. Prazos editados, conclusão, favoritos e capas personalizadas serão perdidos.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Recriar itens',
                    focusCancel: true,
                    customClass: {confirmButton: 'button-delete'},
                });
                if (!decision.isConfirmed) return;
            }
            // The async confirmation may outlive a profile change; recheck before submitting.
            if (getSelectedProfileId() !== actor) {
                setFeedback('taskBatchMessage', 'O perfil mudou. Feche e abra a seleção novamente.', 'error'); return;
            }
            const selected = chosen.map(item => ({
                abbreviation: item.abbreviation, definition_key: item.definition_key, calendar_key: item.calendar_key,
                ...(!isNew(item) ? { expected_task_id: item.task_id, expected_version: item.task_version } : {}),
            }));
            const signature = JSON.stringify(selected);
            if (!attempt || attempt.signature !== signature) attempt = { signature, requestId: window.crypto.randomUUID() };
            setFeedback('taskBatchMessage', 'Carregando escolhidos…');
            const saved = await onLoad({ items: selected, deferredCount, requestId: attempt.requestId });
            if (saved) {
                if (dialog.open) dialog.close();
            } else setFeedback('taskBatchMessage', 'Não foi possível confirmar a carga. Sua seleção foi mantida; tente novamente. Se a tarefa mudou, feche e abra a seleção.', 'error');
        } catch (error) {
            console.error('Failed to confirm task batch:', error);
            setFeedback('taskBatchMessage', 'Não foi possível concluir a carga. Sua seleção foi mantida; tente novamente.', 'error');
        } finally {
            busy = false;
            controls.forEach((control, index) => { control.disabled = previous[index]; });
            if (dialog.open) el('taskBatchSubmit').focus();
        }
    });
}

function boxes() { return [...el('taskBatchGroups').querySelectorAll('input[type="checkbox"]')]; }
function renderOffers() {
    const groups = el('taskBatchGroups'); groups.replaceChildren();
    const fields = new Map();
    offers.forEach((item, index) => {
        let field = fields.get(item.abbreviation);
        if (!field) {
            field = document.createElement('fieldset');
            const legend = document.createElement('legend'); legend.textContent = item.game_description;
            field.append(legend); fields.set(item.abbreviation, field); groups.append(field);
        }
        const label = document.createElement('label'); label.className = 'task-batch-item';
        const box = document.createElement('input'); box.type = 'checkbox'; box.dataset.offerIndex = String(index);
        box.disabled = !selectable(item); box.checked = isNew(item);
        const text = document.createElement('span'); text.textContent = item.description;
        const status = document.createElement('small');
        status.textContent = item.state === 'legacy' && item.can_replace ? 'Já criado — lote anterior' : stateLabels[item.state] ?? 'Indisponível';
        if (!isNew(item) && item.task_id && !item.can_replace) status.textContent += ' — substituição indisponível';
        text.append(status); label.append(box, text); field.append(label);
        box.addEventListener('change', updateSummary);
    });
    updateSummary();
}
function updateSummary() {
    const available = boxes().filter(box => !box.disabled);
    const selected = available.filter(box => box.checked);
    const replacements = selected.filter(box => !isNew(offers[Number(box.dataset.offerIndex)])).length;
    const deferred = available.filter(box => !box.checked && isNew(offers[Number(box.dataset.offerIndex)])).length;
    const all = el('taskBatchSelectAll');
    all.disabled = !available.length; all.checked = !!available.length && selected.length === available.length;
    all.indeterminate = selected.length > 0 && selected.length < available.length;
    el('taskBatchSummary').textContent = available.length
        ? `${selected.length} escolhido(s); ${replacements} será(ão) recriado(s) do zero; ${deferred} ficará(ão) adiado(s).`
        : 'Nenhum item disponível para carregar neste perfil.';
    // An empty selection remains useful to defer new definitions without any deletion.
    el('taskBatchSubmit').disabled = !available.length;
}
