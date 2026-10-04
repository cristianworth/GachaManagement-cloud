export function setFeedback(id, message = '', kind = 'success') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.dataset.kind = kind;
    element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}
