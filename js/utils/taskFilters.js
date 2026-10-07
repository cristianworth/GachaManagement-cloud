import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';

export function filterTasks(tasks, { gameId = '', interval = '', hideCompleted = false } = {}) {
    return tasks.filter(task =>
        (!gameId || String(task.gameId) === gameId) &&
        (interval === '' || String(RefreshTypeEnum.findPresetId(RefreshTypeEnum.getRepeatDays(task))) === interval) &&
        (!hideCompleted || !task.isDone));
}

export function sortTasks(tasks) {
    const deadline = task => {
        const instant = task.expirationDate ? new Date(task.expirationDate).getTime() : NaN;
        return Number.isFinite(instant) ? instant : Infinity;
    };
    return [...tasks].sort((a, b) => Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite))
        || deadline(a) - deadline(b) || Number(a.id) - Number(b.id));
}
