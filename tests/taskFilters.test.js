import { filterTasks } from '../js/utils/taskFilters.js';

const tasks = [
    { id: 1, gameId: 4, refreshType: 0, isDone: true },
    { id: 2, gameId: 4, refreshType: 2, repeatDays: 7, isDone: false },
    { id: 3, gameId: 1, refreshType: 6, repeatDays: 31, isDone: false },
    { id: 4, gameId: 4, refreshType: 8, repeatDays: 19, isDone: true },
    { id: 5, gameId: 4, refreshType: 6, repeatDays: 30, isDone: false },
];

test('hiding completed tasks combines with game and interval filters', () => {
    expect(filterTasks(tasks, { gameId: '4', hideCompleted: true }).map(task => task.id)).toEqual([2, 5]);
    expect(filterTasks(tasks, { gameId: '4', interval: '8', hideCompleted: true })).toEqual([]);
});

test('showing completed tasks again restores them without changing their state', () => {
    expect(filterTasks(tasks, { gameId: '4', interval: '0' }).map(task => task.id)).toEqual([1]);
    expect(tasks[0].isDone).toBe(true);
});

test('legacy Monthly is Custom while the new 30-day preset is Monthly', () => {
    expect(filterTasks(tasks, { interval: '8' }).map(task => task.id)).toEqual([3, 4]);
    expect(filterTasks(tasks, { interval: '6' }).map(task => task.id)).toEqual([5]);
});
