export const PROFILE_IDS = Object.freeze(['cran', 'demo', 'guest']);

const STORAGE_KEY = 'gacha-profile';
const sessions = new WeakMap();

export function getSelectedProfileId() {
    // Read the saved preference once per page; another tab cannot change this page's actor.
    if (sessions.has(window)) return sessions.get(window);
    let selected = null;
    try {
        const id = window.localStorage.getItem(STORAGE_KEY);
        if (PROFILE_IDS.includes(id)) selected = id;
    } catch { /* The entry screen remains available when storage cannot be read. */ }
    sessions.set(window, selected);
    return selected;
}

export function getProfileId() {
    const id = getSelectedProfileId();
    if (!id) throw new Error('Selecione um perfil antes de acessar os dados.');
    return id;
}

export function selectProfile(id) {
    if (!PROFILE_IDS.includes(id)) throw new Error('Perfil inválido.');
    window.localStorage.setItem(STORAGE_KEY, id);
    sessions.set(window, id);
}

export function clearProfile() {
    window.localStorage.removeItem(STORAGE_KEY);
    sessions.set(window, null);
}
