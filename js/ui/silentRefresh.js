import { getSelectedProfileId } from '../services/profileSession.js';
import { isLoading } from './loadingState.js';

const REFRESH_INTERVAL = 6 * 60_000;
const DEFER_INTERVAL = 15_000;
let active = null;
let refreshing = false;

export function stopSilentRefresh() {
    const context = active;
    active = null;
    if (!context) return;
    context.window.clearTimeout(context.timer);
    context.document.removeEventListener('visibilitychange', context.onVisibility);
}

function canApply(context) {
    const focused = context.document.activeElement;
    return active === context && !context.document.hidden
        && context.page.style.display !== 'none'
        && context.profile === getSelectedProfileId()
        && !isLoading() && !context.isBusy()
        && !context.document.querySelector('dialog[open], .swal2-container')
        && !focused?.matches('input, textarea, select, [contenteditable="true"]');
}

function schedule(context, delay = context.dueAt - Date.now()) {
    context.window.clearTimeout(context.timer);
    if (active !== context || context.document.hidden) return;
    context.timer = context.window.setTimeout(() => refresh(context), Math.max(0, delay));
}

async function refresh(context) {
    if (active !== context) return;
    if (context.page.style.display === 'none' || context.profile !== getSelectedProfileId()) {
        stopSilentRefresh();
        return;
    }
    if (context.document.hidden) return;
    if (Date.now() < context.dueAt) { schedule(context); return; }
    if (refreshing || !canApply(context)) { schedule(context, DEFER_INTERVAL); return; }
    refreshing = true;
    let result = false;
    try {
        // Recheck after the read: typing, navigation or a save may have started meanwhile.
        result = await context.read(() => canApply(context));
    } catch (error) {
        console.error('Failed to refresh saved data:', error);
    } finally {
        refreshing = false;
        if (active === context) {
            // A deferred render retries locally; failed reads wait a full interval.
            if (result !== null) context.dueAt = Date.now() + REFRESH_INTERVAL;
            schedule(context, result === null ? DEFER_INTERVAL : undefined);
        }
    }
}

export function startSilentRefresh(pageName, read, isBusy = () => false) {
    const page = document.querySelector(`[data-page="${pageName}"]`);
    if (!page || page.style.display === 'none' || !getSelectedProfileId()) return;
    stopSilentRefresh();
    const context = { page, read, isBusy, window, document, profile: getSelectedProfileId(),
        dueAt: Date.now() + REFRESH_INTERVAL, timer: null, onVisibility: null };
    context.onVisibility = () => schedule(context);
    active = context;
    document.addEventListener('visibilitychange', context.onVisibility);
    schedule(context);
}
