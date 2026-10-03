import { handleAddGame } from '../js/ui/gameUI.js';
import { addGame, updateGame, fetchGameById } from '../js/database/gameDB.js';

jest.mock('../js/ui/eventCover.js', () => ({ createGameIcon: jest.fn() }));
jest.mock('../js/database/gameDB.js', () => ({
    addGame: jest.fn(async () => {}), updateGame: jest.fn(async () => {}),
    fetchAllGames: jest.fn(async () => []), fetchGameById: jest.fn(),
}));
jest.mock('../js/ui/formHandler.js', () => ({ resetGameForm: jest.fn() }));
jest.mock('../js/utils/router.js', () => ({ __esModule: true, default: {} }));

let fields;
const existingGame = () => ({ id: 4, img: 'img/zzz-icon.png', currentStamina: 123,
    pendingTasks: 'Finish chapter', color: '#e6ccff', dateMaxStamina: new Date('2030-10-20T09:00:00Z') });

beforeEach(() => {
    jest.clearAllMocks();
    fetchGameById.mockResolvedValue(existingGame());
    fields = { gameId: { value: '' }, gameDescription: { value: 'ZZZ' }, abbreviation: { value: 'ZZZ' },
        gameImageUrl: { value: '' }, capStamina: { value: '240' }, staminaPerMinute: { value: '6' }, gameListBody: {} };
    global.document = { getElementById: id => fields[id] };
});

afterEach(async () => {
    await new Promise(resolve => setImmediate(resolve));
    delete global.document;
});

test('creating a game saves the supplied image URL', async () => {
    fields.gameImageUrl.value = ' https://example.com/zzz.png ';
    await handleAddGame();
    expect(addGame.mock.calls[0][0].img).toBe('https://example.com/zzz.png');
});

test('editing a game image preserves stamina, pending tasks and color', async () => {
    fields.gameId.value = '4';
    fields.gameImageUrl.value = 'https://example.com/new.png';
    await handleAddGame();
    expect(updateGame.mock.calls[0][0]).toMatchObject({ ...existingGame(), img: 'https://example.com/new.png' });
});

test('leaving a built-in icon blank preserves it', async () => {
    fields.gameId.value = '4';
    await handleAddGame();
    expect(updateGame.mock.calls[0][0].img).toBe('img/zzz-icon.png');
});

test('clearing a remote image uses the default icon', async () => {
    fields.gameId.value = '4';
    fetchGameById.mockResolvedValueOnce({ ...existingGame(), img: 'https://example.com/old.png' });
    await handleAddGame();
    expect(updateGame.mock.calls[0][0].img).toBe('img/default-icon.png');
});
