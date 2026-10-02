const PLACEHOLDER = new URL('../../img/event-placeholder.svg', import.meta.url).href;

export function createEventCover(url, className) {
    const cover = document.createElement('img');
    cover.className = className;
    cover.alt = '';
    cover.loading = 'lazy';
    cover.referrerPolicy = 'no-referrer';
    cover.addEventListener('error', () => { cover.src = PLACEHOLDER; }, { once: true });
    cover.src = url?.startsWith('https://') ? url : PLACEHOLDER;
    return cover;
}
