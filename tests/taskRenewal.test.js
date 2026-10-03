import { updateExpiratedTasksRoutine } from '../js/database/dbInit.js';
import { fetchAllOverdueTasks, updateTask } from '../js/database/taskDB.js';
import { displayAllTasks } from '../js/ui/taskUI.js';

jest.mock('../js/ui/taskUI.js', () => ({ displayAllTasks: jest.fn(async () => {}) }));
jest.mock('../js/database/taskDB.js', () => ({
    fetchAllOverdueTasks: jest.fn(), updateTask: jest.fn(async () => {}), populateInitialTasks: jest.fn(),
}));

afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

test('renewal uses saved custom days, retains legacy cycles and leaves events unchanged', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 3, 12));
    const custom = { id: 1, description: 'Custom', refreshType: 8, repeatDays: 3,
        expirationDate: new Date(2026, 8, 20, 6), isDone: true, coverUrl: 'https://example.com/custom.jpg' };
    const legacy = { id: 2, description: 'Legacy monthly', refreshType: 6,
        expirationDate: new Date(2026, 8, 10, 6), isDone: true };
    const event = { id: 3, description: 'Event', refreshType: 0, repeatDays: null,
        expirationDate: new Date(2026, 8, 1, 6), isDone: true };
    fetchAllOverdueTasks.mockResolvedValueOnce([custom, legacy, event]);
    await updateExpiratedTasksRoutine();
    expect(custom.expirationDate).toEqual(new Date(2026, 9, 5, 6));
    expect(custom.isDone).toBe(false);
    expect(custom.coverUrl).toBe('https://example.com/custom.jpg');
    expect(legacy.expirationDate).toEqual(new Date(2026, 9, 11, 6));
    expect(event.expirationDate).toEqual(new Date(2026, 8, 1, 6));
    expect(event.isDone).toBe(true);
    expect(updateTask).toHaveBeenCalledTimes(2);
    expect(displayAllTasks).toHaveBeenCalledTimes(1);
});
