const pendingOperations = new Map();

function renderLoadingState() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.hidden = pendingOperations.size === 0;
    overlay.setAttribute('aria-busy', String(pendingOperations.size > 0));
    const message = overlay.querySelector('.loading-message');
    if (message && pendingOperations.size) message.textContent = [...pendingOperations.values()].at(-1);
}

export async function withLoading(message, action) {
    const operation = Symbol();
    pendingOperations.set(operation, message);
    renderLoadingState();
    try {
        return await action();
    } finally {
        // An inner refresh must not hide an outer save that is still running.
        pendingOperations.delete(operation);
        renderLoadingState();
    }
}
