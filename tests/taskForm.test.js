import { handleAddTask } from '../js/ui/taskUI.js';
import { addTask, updateTask, fetchTaskById } from '../js/database/taskDB.js';
import { taskToRow } from '../js/database/mappers/taskMapper.js';

jest.mock('../js/ui/eventCover.js', () => ({ createEventCover: jest.fn() }));
jest.mock('../js/database/eventCandidateDB.js', () => ({ cleanupExpiredImportedEvents: jest.fn(async () => {}) }));
jest.mock('../js/database/gameDB.js', () => ({ fetchAllGames: jest.fn(async () => []) }));
jest.mock('../js/database/taskDB.js', () => ({
    addTask: jest.fn(async () => {}),
    updateTask: jest.fn(async () => {}),
    fetchAllTasks: jest.fn(async () => []),
    fetchTaskById: jest.fn(async id => ({ id, isDone: true })),
}));
jest.mock('../js/ui/formHandler.js', () => ({ resetTaskForm: jest.fn() }));
jest.mock('../js/utils/router.js', () => ({ __esModule: true, default: {} }));

let elements;

beforeEach(() => {
    jest.clearAllMocks();
    const select = () => ({ value: '', options: [], addEventListener() {},
        replaceChildren(option) { this.options = [option]; }, add(option) { this.options.push(option); } });
    elements = {
        taskGameId: { value: '4', selectedIndex: 0, options: [{ text: 'Zenless Zone Zero' }] },
        taskDescription: { value: 'Manual event' }, refreshType: { value: '0' },
        hasDateSelector: { checked: true }, expirationDate: { value: '2030-10-20T09:00' },
        taskId: { value: '' }, taskCoverUrl: { value: '', disabled: false }, taskRepeatDays: { value: '' },
        taskHideCompleted: { checked: false, addEventListener() {} },
        taskGameFilter: select(), taskRefreshTypeFilter: select(), gameScheduleBody: {}, taskListStatus: {},
    };
    global.document = { getElementById: id => elements[id] };
    global.Option = function (text, value) { this.text = text; this.value = value; };
});

afterEach(async () => {
    // Let the list refresh finish before removing the form's document.
    await new Promise(resolve => setImmediate(resolve));
    delete global.document;
    delete global.Option;
});

test('creating a manual task saves its trimmed image URL', async () => {
    elements.taskCoverUrl.value = ' https://example.com/manual.jpg ';
    await handleAddTask();
    expect(taskToRow(addTask.mock.calls[0][0]).cover_url).toBe('https://example.com/manual.jpg');
});

test('clearing the image of a manual task sends null to remove the saved URL', async () => {
    elements.taskId.value = '9';
    await handleAddTask();
    expect(taskToRow(updateTask.mock.calls[0][0]).cover_url).toBeNull();
});

test('saving an imported task omits its source-managed image from the update', async () => {
    elements.taskId.value = '10';
    elements.taskCoverUrl.value = 'https://example.com/source.jpg';
    elements.taskCoverUrl.disabled = true;
    await handleAddTask();
    expect(taskToRow(updateTask.mock.calls[0][0])).not.toHaveProperty('cover_url');
});

test.each([['1', '1', 1], ['2', '7', 2], ['6', '30', 6], ['8', '14', 8], ['8', '31', 8]])(
    'saving interval preset %s with %s days persists the actual interval', async (preset, days, expectedType) => {
        elements.refreshType.value = preset;
        elements.taskRepeatDays.value = days;
        await handleAddTask();
        const row = taskToRow(addTask.mock.calls[0][0]);
        expect(row.repeat_days).toBe(Number(days));
        expect(row.refresh_type).toBe(expectedType);
    });

test.each(['', '0', '-1', '1.5', '2147483648'])('invalid custom interval %s never reaches the database', async days => {
    elements.refreshType.value = '8';
    elements.taskRepeatDays.value = days;
    await expect(handleAddTask()).rejects.toThrow('positive whole number');
    expect(addTask).not.toHaveBeenCalled();
});

test('editing an existing task preserves completion', async () => {
    elements.taskId.value = '9';
    await handleAddTask();
    expect(updateTask.mock.calls[0][0].isDone).toBe(true);
});

test('a disappeared task is not recreated by an edit', async () => {
    elements.taskId.value = '9';
    fetchTaskById.mockResolvedValueOnce(null);
    await expect(handleAddTask()).rejects.toThrow('Task not found');
    expect(updateTask).not.toHaveBeenCalled();
});
