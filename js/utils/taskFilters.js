import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';

export function filterTasks(tasks, { gameId = '', interval = '', hideCompleted = false } = {}) {
    return tasks.filter(task =>
        (!gameId || String(task.gameId) === gameId) &&
        (interval === '' || String(RefreshTypeEnum.findPresetId(RefreshTypeEnum.getRepeatDays(task))) === interval) &&
        (!hideCompleted || !task.isDone));
}
