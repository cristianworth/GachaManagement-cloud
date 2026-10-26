import { fetchGameAgenda, fetchAgendaCatalogue, saveAgendaEntry, deleteAgendaEntry } from '../database/agendaDB.js';
import { fromBrasiliaInput, toBrasiliaInput } from '../utils/gameNotices.js';
import { agendaState, formatAgendaDate, validateAgendaEntry } from '../utils/gameAgenda.js';
import { setFeedback } from './feedback.js';
import { refreshGameNotifications } from './gameNotifications.js';
import { showDialog } from './dialogs.js';

const contexts = new WeakMap();
const el = id => document.getElementById(id);

function setBusy(context, busy) {
    context.busy = busy;
    for (const control of el('agendaForm').elements) control.disabled = busy;
    for (const button of el('agendaList').querySelectorAll('button')) button.disabled = busy;
    el('agendaAdd').disabled = busy;
    el('agendaRefresh').disabled = busy;
}

function edit(context, entry = null) {
    context.editingId = entry?.id ?? null;
    el('agendaForm').reset();
    el('agendaGame').value = String(entry?.game_id ?? context.catalogue[0]?.id ?? '');
    el('agendaKind').value = entry?.kind ?? 'maintenance';
    el('agendaTitle').value = entry?.title ?? '';
    el('agendaVersion').value = entry?.version ?? '';
    el('agendaStart').value = toBrasiliaInput(entry?.starts_at);
    el('agendaEnd').value = toBrasiliaInput(entry?.ends_at);
    el('agendaSource').value = entry?.source_url ?? '';
    el('agendaImage').value = entry?.image_url ?? '';
    el('agendaTimingNote').value = entry?.timing_note ?? '';
    el('agendaFormTitle').textContent = entry ? 'Editar registro compartilhado' : 'Novo registro compartilhado';
    el('agendaForm').hidden = false;
    el('agendaGame').focus();
}

function render(context) {
    const now = new Date();
    const filtered = context.entries.filter(entry => (!el('agendaGameFilter').value || String(entry.game_id) === el('agendaGameFilter').value)
        && (!el('agendaKindFilter').value || entry.kind === el('agendaKindFilter').value)
        && (el('agendaShowEnded').checked || Date.parse(entry.ends_at) > +now))
        .sort((a,b) => Number(Date.parse(a.ends_at) <= +now) - Number(Date.parse(b.ends_at) <= +now)
            || Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id - b.id);
    const list = el('agendaList');
    list.replaceChildren();
    el('agendaEmpty').hidden = !!filtered.length;
    for (const entry of filtered) {
        const li = document.createElement('li'); li.className = 'agenda-entry'; li.dataset.id = entry.id;
        const body = document.createElement('div'); body.className = 'agenda-entry-content';
        const meta = document.createElement('p'); meta.className = 'agenda-entry-meta';
        meta.textContent = `${entry.game_name} · ${entry.kind === 'maintenance' ? 'Versão / manutenção' : 'Banner'}${entry.version ? ` · ${entry.version}` : ''}`;
        const title = document.createElement('h2'); title.textContent = entry.title;
        const status = document.createElement('span'); status.className = 'agenda-entry-state'; status.textContent = agendaState(entry, now);
        const dates = document.createElement('p');
        dates.textContent = `${formatAgendaDate(entry.starts_at)} até ${formatAgendaDate(entry.ends_at)} (Brasília)${entry.kind === 'maintenance' ? ' · retorno previsto' : ''}`;
        body.append(meta, title, status, dates);
        if (entry.timing_note) {
            const note = document.createElement('p'); note.className = 'agenda-entry-meta'; note.textContent = entry.timing_note; body.append(note);
        }
        if (/^https:\/\//.test(entry.source_url)) {
            const source = document.createElement('a'); source.href = entry.source_url;
            source.textContent = 'Consultar fonte'; source.target = '_blank'; source.rel = 'noopener noreferrer'; body.append(source);
        }
        const actions = document.createElement('div'); actions.className = 'list-actions';
        const change = document.createElement('button'); change.type = 'button'; change.className = 'button-neutral'; change.textContent = 'Editar';
        change.setAttribute('aria-label', `Editar ${entry.title}`); change.onclick = () => edit(context, entry);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button-neutral'; remove.textContent = 'Excluir';
        remove.setAttribute('aria-label', `Excluir ${entry.title}`);
        remove.onclick = async () => {
            if (context.busy) return;
            const approved = await showDialog({title:'Excluir da agenda compartilhada?', text:`${entry.title} será removido para todos os perfis.`, showCancelButton:true, confirmButtonText:'Excluir para todos'});
            if (!approved.isConfirmed || context.busy) return;
            setBusy(context, true); context.reading++; setFeedback('agendaStatus');
            try {
                await deleteAgendaEntry(entry.id);
                context.entries = context.entries.filter(item => item.id !== entry.id);
                if (context.editingId === entry.id) el('agendaForm').hidden = true;
                render(context); setFeedback('agendaStatus', 'Registro excluído para todos os perfis.');
                await refreshGameNotifications({force:true});
            } catch (error) {
                console.error('Failed to delete shared agenda entry:', error);
                setFeedback('agendaStatus', 'Não foi possível excluir. O registro foi mantido; tente novamente.', 'error');
            } finally { setBusy(context, false); }
        };
        actions.append(change, remove); body.append(actions);
        if (/^https:\/\//.test(entry.image_url)) {
            const image = document.createElement('img'); image.src = entry.image_url; image.alt = ''; image.loading = 'lazy';
            image.className = 'agenda-entry-image'; image.referrerPolicy = 'no-referrer';
            image.onerror = () => image.remove(); li.append(image);
        }
        li.append(body); list.append(li);
    }
    if (context.busy) for (const button of list.querySelectorAll('button')) button.disabled = true;
}

export async function displayGameAgenda() {
    let context = contexts.get(document);
    if (!context) {
        context = {entries:[], catalogue:[], busy:false, reading:0, editingId:null};
        contexts.set(document, context);
        el('agendaGameFilter').onchange = () => render(context);
        el('agendaKindFilter').onchange = () => render(context);
        el('agendaShowEnded').onchange = () => render(context);
        el('agendaAdd').onclick = () => { if (!context.busy) edit(context); };
        el('agendaCancel').onclick = () => { el('agendaForm').hidden = true; el('agendaAdd').focus(); };
        el('agendaRefresh').onclick = () => load(context);
        el('agendaForm').onsubmit = async event => {
            event.preventDefault();
            if (context.busy) return;
            setFeedback('agendaStatus');
            let entry;
            try {
                entry = validateAgendaEntry({game_id:Number(el('agendaGame').value), kind:el('agendaKind').value,
                    title:el('agendaTitle').value, version:el('agendaVersion').value,
                    starts_at:fromBrasiliaInput(el('agendaStart').value), ends_at:fromBrasiliaInput(el('agendaEnd').value),
                    source_url:el('agendaSource').value, image_url:el('agendaImage').value, timing_note:el('agendaTimingNote').value});
            } catch (error) {
                setFeedback('agendaStatus', error.message, 'error'); return;
            }
            setBusy(context, true); context.reading++;
            try {
                const saved = await saveAgendaEntry(entry, context.editingId);
                const game = context.catalogue.find(game => game.id === saved.game_id);
                context.entries = context.entries.filter(item => item.id !== saved.id);
                context.entries.push({...saved, game_name:game.description, abbreviation:game.abbreviation});
                el('agendaForm').hidden = true; render(context);
                setFeedback('agendaStatus', 'Agenda salva para todos os perfis.');
                el('agendaAdd').focus();
                await refreshGameNotifications({force:true});
            } catch (error) {
                console.error('Failed to save shared agenda entry:', error);
                const message = error.code === '23505' ? 'Este registro já existe. Edite o item da lista.'
                    : 'Não foi possível salvar. Seus campos foram mantidos; tente novamente.';
                setFeedback('agendaStatus', message, 'error');
            } finally {
                setBusy(context, false);
                if (el('agendaForm').hidden) el('agendaAdd').focus();
            }
        };
    }
    await load(context);
}

async function load(context) {
    if (context.busy) return;
    const revision = ++context.reading;
    el('agendaRefresh').disabled = true;
    el('agendaAdd').disabled = !context.catalogue.length;
    try {
        const [entries, catalogue] = await Promise.all([fetchGameAgenda(), fetchAgendaCatalogue()]);
        if (revision !== context.reading) return;
        context.entries = entries; context.catalogue = catalogue;
        const selected = el('agendaGameFilter').value;
        el('agendaGameFilter').replaceChildren(new Option('Todos os jogos', ''), ...catalogue.map(game => new Option(game.description, game.id)));
        el('agendaGameFilter').value = selected;
        const editingGame = el('agendaGame').value;
        el('agendaGame').replaceChildren(...catalogue.map(game => new Option(game.description, game.id)));
        if (editingGame) el('agendaGame').value = editingGame;
        setFeedback('agendaStatus'); render(context);
    } catch (error) {
        console.error('Failed to read shared agenda:', error);
        if (revision === context.reading) setFeedback('agendaStatus', 'Não foi possível carregar a agenda. Use Atualizar agenda para tentar novamente.', 'error');
    } finally {
        if (revision === context.reading) {
            el('agendaRefresh').disabled = false;
            el('agendaAdd').disabled = !context.catalogue.length;
        }
    }
}
