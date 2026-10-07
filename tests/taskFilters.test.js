import { filterTasks, sortTasks } from '../js/utils/taskFilters.js';

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

test('favorites precede other tasks, with deadlines and stable IDs inside each group', () => {
    const list = [
        { id: 9, expirationDate: null, isFavorite: true },
        { id: 5, expirationDate: new Date('2099-10-10'), isFavorite: false },
        { id: 7, expirationDate: new Date('2099-10-20'), isFavorite: true },
        { id: 6, expirationDate: new Date('2099-10-20'), isFavorite: true },
        { id: 8, expirationDate: new Date('invalid') },
    ];
    expect(sortTasks(list).map(task => task.id)).toEqual([6, 7, 9, 5, 8]);
    expect(list.map(task => task.id)).toEqual([9, 5, 7, 6, 8]);
});

test('favorite ordering cannot bring back tasks excluded by filters', () => {
    const list = tasks.map(task => ({ ...task, isFavorite: true }));
    expect(sortTasks(filterTasks(list, { gameId: '4', hideCompleted: true })).map(task => task.id)).toEqual([2, 5]);
});
