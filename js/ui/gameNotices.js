const el = id => document.getElementById(id);
const preferences = () => ({ maintenance:el('maintenanceNotify').checked, banner:el('bannerNotify').checked });

export function fillGameNoticeFields(game = null) {
    el('gameNoticeSettings').open = false;
    el('maintenanceNotify').checked = game?.noticePreferences?.maintenance !== false;
    el('bannerNotify').checked = game?.noticePreferences?.banner !== false;
    el('game-form').dataset.noticeSnapshot = JSON.stringify(preferences());
}

export function readGameNoticeChanges() {
    const value = preferences();
    return JSON.stringify(value) === el('game-form').dataset.noticeSnapshot ? null : { preferences:value };
}
