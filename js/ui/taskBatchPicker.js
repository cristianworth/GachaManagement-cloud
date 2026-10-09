// The native dialog owns keyboard focus; opening/cancelling performs no writes.
import { fetchTaskBatchItems } from '../database/taskDB.js';
import { getSelectedProfileId } from '../services/profileSession.js';
import { setFeedback } from './feedback.js';

let offers = [];
let actor = null;
let busy = false;
const eligible = item => ['never', 'deferred'].includes(item.state);
const stateLabels = {
    never: 'Disponível', deferred: 'Adiado', created: 'Já criado', preserved: 'Existente preservado',
    excluded: 'Excluído — não será recriado', legacy: 'Protegido pelo lote anterior',
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
    dialog.addEventListener('close', () => el('chooseTaskBatchBtn').focus());
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
        const selected = boxes().filter(box => !box.disabled && box.checked).map(box => {
            const item = offers[Number(box.dataset.offerIndex)];
            return { abbreviation: item.abbreviation, definition_key: item.definition_key, calendar_key: item.calendar_key };
        });
        const available = boxes().filter(box => !box.disabled).length;
        busy = true;
        const controls = [...dialog.querySelectorAll('input, button')];
        const previous = controls.map(control => control.disabled);
        controls.forEach(control => { control.disabled = true; });
        setFeedback('taskBatchMessage', 'Carregando escolhidos…');
        try {
            const saved = await onLoad({ items: selected, deferredCount: available - selected.length });
            if (saved) {
                if (dialog.open) dialog.close();
            }
            else setFeedback('taskBatchMessage', 'Não foi possível carregar. Sua seleção foi mantida; tente novamente.', 'error');
        } finally {
            busy = false;
            controls.forEach((control, index) => { control.disabled = previous[index]; });
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
        box.disabled = !eligible(item); box.checked = eligible(item);
        const text = document.createElement('span'); text.textContent = item.description;
        const status = document.createElement('small'); status.textContent = stateLabels[item.state] ?? 'Indisponível';
        text.append(status); label.append(box, text); field.append(label);
        box.addEventListener('change', updateSummary);
    });
    updateSummary();
}
function updateSummary() {
    const available = boxes().filter(box => !box.disabled);
    const selected = available.filter(box => box.checked).length;
    const all = el('taskBatchSelectAll');
    all.disabled = !available.length; all.checked = !!available.length && selected === available.length;
    all.indeterminate = selected > 0 && selected < available.length;
    el('taskBatchSummary').textContent = available.length
        ? `${selected} escolhido(s); ${available.length - selected} ficará(ão) adiado(s).`
        : 'Nenhum item elegível neste perfil.';
    el('taskBatchSubmit').disabled = !available.length;
}
