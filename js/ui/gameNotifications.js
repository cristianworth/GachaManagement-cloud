import { fetchAllGames, markGameNotificationsRead } from '../database/gameDB.js';
import { getSelectedProfileId } from '../services/profileSession.js';
import { getGameNotifications } from '../utils/gameNotices.js';
import { setFeedback } from './feedback.js';

const contexts = new WeakMap();
const READ_INTERVAL = 6 * 60_000;

function syncActor(context) {
    const actor = getSelectedProfileId();
    if (context.actor !== actor) {
        context.actor = actor; context.games = []; context.lastRead = 0; context.revision++;
        context.expanded.clear();
        if (context.panel.open) context.panel.close();
        setFeedback('notificationStatus');
    }
    context.trigger.hidden = !actor;
    return actor;
}

export function initializeGameNotifications() {
    if (contexts.has(document)) return;
    const context = { document, window, actor: getSelectedProfileId(), games: [], lastRead: 0,
        revision: 0, reading: false, busy: false, expanded: new Set(), fingerprint: '',
        trigger: document.getElementById('notificationsButton'), panel: document.getElementById('notificationsPanel') };
    contexts.set(document, context);
    context.trigger.onclick = async () => {
        if (!syncActor(context) || context.panel.open) return;
        render(context);
        context.panel.showModal();
        context.document.getElementById('notificationsTitle').focus();
        await refreshGameNotifications({ force:true });
    };
    context.document.getElementById('notificationsClose').onclick = () => context.panel.close();
    context.panel.onclose = () => { if (context.actor === getSelectedProfileId()) context.trigger.focus(); };
    context.document.getElementById('notificationsReadAll').onclick = () => markRead(context,
        getGameNotifications(context.games).filter(item => item.unread));
    context.tick = async () => {
        if (context.document.hidden) return;
        syncActor(context); render(context);
        await refreshGameNotifications();
    };
    context.onVisibility = () => {
        if (context.timer != null) context.window.clearInterval(context.timer);
        context.timer = null;
        if (!context.document.hidden) {
            context.tick();
            context.timer = context.window.setInterval(context.tick, 60_000);
        }
    };
    context.document.addEventListener('visibilitychange', context.onVisibility);
    context.window.addEventListener('pagehide', () => stopGameNotifications(), {once:true});
    if (!context.document.hidden) context.timer = context.window.setInterval(context.tick, 60_000);
    syncActor(context); render(context);
}

export function stopGameNotifications() {
    const context = contexts.get(document);
    if (!context) return;
    context.window.clearInterval(context.timer);
    context.document.removeEventListener('visibilitychange', context.onVisibility);
    context.revision++;
    contexts.delete(document);
}

export function setNotificationGames(games, actor) {
    const context = contexts.get(document);
    if (!context || actor !== getSelectedProfileId()) return;
    syncActor(context);
    if (context.busy) return;
    context.games = games;
    context.lastRead = Date.now(); context.revision++;
    render(context);
}

export async function refreshGameNotifications({ force = false } = {}) {
    const context = contexts.get(document);
    if (!context || context.document.hidden || !syncActor(context) || context.reading || context.busy
        || (!force && Date.now() - context.lastRead < READ_INTERVAL)) return;
    // Games already refreshes this same list; reuse its result instead of polling twice.
    if (!force && context.document.querySelector('[data-page="games"]')?.style.display !== 'none') return;
    const actor = context.actor;
    const revision = context.revision;
    context.reading = true;
    context.panel.dataset.reading = 'true';
    try {
        const games = await fetchAllGames();
        if (actor === getSelectedProfileId() && revision === context.revision && contexts.get(document) === context) {
            context.games = games; context.lastRead = Date.now();
            setFeedback('notificationStatus'); render(context);
        }
    } catch (error) {
        console.error('Failed to read notifications:', error);
        if (actor === getSelectedProfileId() && revision === context.revision) {
            context.lastRead = Date.now();
            setFeedback('notificationStatus', 'Não foi possível atualizar os avisos. Os dados anteriores foram mantidos. Feche e abra a central para tentar novamente.', 'error');
        }
    } finally {
        context.reading = false;
        if (contexts.get(document) === context) delete context.panel.dataset.reading;
    }
}

function render(context) {
    const items = getGameNotifications(context.games);
    const unread = items.filter(item => item.unread).length;
    const doc = context.document;
    const counter = doc.getElementById('notificationCount');
    counter.textContent = String(unread); counter.hidden = !unread;
    context.trigger.setAttribute('aria-label', `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}`);
    doc.getElementById('notificationsReadAll').disabled = context.busy || !unread;
    doc.getElementById('notificationsEmpty').hidden = !!items.length;
    const fingerprint = JSON.stringify([items, [...context.expanded], context.busy]);
    if (fingerprint === context.fingerprint) return;
    context.fingerprint = fingerprint;
    const focused = context.panel.contains(doc.activeElement) ? doc.activeElement.id : null;
    const list = doc.getElementById('notificationList');
    list.replaceChildren();
    for (const item of items) {
        const li = doc.createElement('li'); li.className = 'notification-item';
        li.dataset.unread = String(item.unread); li.dataset.stage = item.stage;
        const button = doc.createElement('button'); button.type = 'button';
        button.id = `notification-${item.gameId}-${item.agendaId != null ? `agenda-${item.agendaId}` : item.kind}`;
        button.className = 'notification-open'; button.disabled = context.busy;
        const title = doc.createElement('strong');
        title.textContent = `${item.gameName} — ${item.kind === 'maintenance' ? 'Manutenção' : 'Próximo banner'}`;
        const label = doc.createElement('span');
        label.textContent = `${item.unread ? 'Não lida' : 'Lida'} · ${item.stage === 'ongoing' ? 'Em andamento' : `Aviso de ${item.stage}`}`;
        const details = doc.createElement('p'); details.id = `${button.id}-details`;
        details.textContent = item.text; details.hidden = !context.expanded.has(item.key);
        button.setAttribute('aria-expanded', String(!details.hidden));
        button.setAttribute('aria-controls', details.id);
        button.append(title, label);
        button.onclick = async () => {
            if (context.busy) return;
            if (context.expanded.has(item.key)) context.expanded.delete(item.key);
            else {
                context.expanded.add(item.key);
                if (item.unread) { await markRead(context, [item]); return; }
            }
            render(context);
        };
        li.append(button, details); list.append(li);
    }
    if (focused && doc.activeElement === doc.body) doc.getElementById(focused)?.focus({preventScroll:true});
}

async function markRead(context, items) {
    if (context.busy || !items.length || context.actor !== getSelectedProfileId()) return;
    const actor = context.actor;
    const focusedId = context.panel.contains(context.document.activeElement) ? context.document.activeElement.id : null;
    context.busy = true; context.revision++;
    context.panel.dataset.saving = 'true';
    setFeedback('notificationStatus'); render(context);
    let failures = 0;
    const groups = new Map();
    for (const item of items) groups.set(item.gameId, [...(groups.get(item.gameId) ?? []), item]);
    try {
        for (const [gameId, group] of groups) {
            if (actor !== getSelectedProfileId() || contexts.get(document) !== context) break;
            try {
                await markGameNotificationsRead(gameId, group[0].abbreviation, group);
                if (actor !== getSelectedProfileId()) break;
                const game = context.games.find(game => game.id === gameId);
                if (game) for (const item of group) {
                    const receipt = { signature:item.signature, stage:item.stage };
                    if (item.agendaId != null) {
                        const entry = game.agenda?.find(entry => entry.id === item.agendaId);
                        if (entry) entry.read = receipt;
                    } else {
                        game.noticeReads ??= {};
                        game.noticeReads[item.kind] = receipt;
                    }
                }
            } catch (error) { failures++; console.error('Failed to mark notifications read:', error); }
        }
    } finally {
        context.busy = false;
        if (contexts.get(document) === context) {
            delete context.panel.dataset.saving;
            if (actor === getSelectedProfileId()) setFeedback('notificationStatus', failures ? 'Alguns avisos não puderam ser marcados como lidos. As marcações confirmadas foram mantidas; tente novamente.' : '', failures ? 'error' : 'success');
            render(context);
            if (actor === getSelectedProfileId() && context.panel.open && focusedId
                && [context.document.body, context.panel].includes(context.document.activeElement)) {
                const target = context.document.getElementById(focusedId);
                (target && !target.disabled ? target : context.document.getElementById('notificationsClose')).focus({preventScroll:true});
            }
        }
    }
}
