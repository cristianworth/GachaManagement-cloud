const PLACEHOLDER = new URL('../../img/event-placeholder.svg', import.meta.url).href;
const GAME_PLACEHOLDER = new URL('../../img/default-icon.png', import.meta.url).href;

export function createEventCover(url, className) {
    return createImage(url?.startsWith('https://') ? url : null, className, PLACEHOLDER);
}

export function createGameIcon(url, description) {
    const source = url?.startsWith('https://') ? url
        : url?.startsWith('img/') ? new URL(`../../${url}`, import.meta.url).href : null;
    return createImage(source, 'icon', GAME_PLACEHOLDER, `${description} Icon`);
}

function createImage(url, className, placeholder, alt = '') {
    const cover = document.createElement('img');
    cover.className = className;
    cover.alt = alt;
    cover.loading = 'lazy';
    cover.referrerPolicy = 'no-referrer';
    cover.addEventListener('error', () => { cover.src = placeholder; }, { once: true });
    cover.src = url || placeholder;
    return cover;
}
