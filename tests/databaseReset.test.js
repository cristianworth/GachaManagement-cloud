import { clearDatabase } from '../js/database/dbInit.js';
import { getClient } from '../js/database/supabaseClient.js';
import { populateInitialGames } from '../js/database/gameDB.js';
import { populateInitialTasks, fetchAllOverdueTasks } from '../js/database/taskDB.js';
import { cleanupExpiredImportedEvents } from '../js/database/eventCandidateDB.js';

jest.mock('../js/database/supabaseClient.js', () => ({ getClient: jest.fn() }));
jest.mock('../js/database/gameDB.js', () => ({ populateInitialGames: jest.fn(async () => {}) }));
jest.mock('../js/database/taskDB.js', () => ({
    populateInitialTasks: jest.fn(async () => {}), fetchAllOverdueTasks: jest.fn(async () => []), updateTask: jest.fn(),
}));
jest.mock('../js/database/eventCandidateDB.js', () => ({ cleanupExpiredImportedEvents: jest.fn(async () => {}) }));
jest.mock('../js/ui/taskUI.js', () => ({ displayAllTasks: jest.fn() }));

let rpc;
beforeEach(() => {
    jest.clearAllMocks();
    rpc = jest.fn(async () => ({ error: null }));
    getClient.mockReturnValue({ rpc });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('Full reset waits for the transaction before recreating games, weeklies and maintenance', async () => {
    let release;
    rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const resetting = clearDatabase();
    expect(rpc).toHaveBeenCalledWith('reset_application_data');
    expect(populateInitialGames).not.toHaveBeenCalled();
    expect(populateInitialTasks).not.toHaveBeenCalled();
    release({ error: null });
    await resetting;
    expect(populateInitialGames).toHaveBeenCalledTimes(1);
    expect(populateInitialTasks).toHaveBeenCalledTimes(1);
    expect(populateInitialGames.mock.invocationCallOrder[0]).toBeLessThan(populateInitialTasks.mock.invocationCallOrder[0]);
    expect(cleanupExpiredImportedEvents).toHaveBeenCalledTimes(1);
    expect(fetchAllOverdueTasks).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('Banco de dados resetado com sucesso!');
});

test.each(['returned', 'thrown'])('A %s reset error propagates and prevents all initialization', async failure => {
    const error = new Error('Reset denied');
    if (failure === 'returned') rpc.mockResolvedValueOnce({ error });
    else rpc.mockRejectedValueOnce(error);
    await expect(clearDatabase()).rejects.toThrow('Reset denied');
    expect(populateInitialGames).not.toHaveBeenCalled();
    expect(populateInitialTasks).not.toHaveBeenCalled();
    expect(cleanupExpiredImportedEvents).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
});

test('Initialization failure after clearing is surfaced without reporting reset success', async () => {
    populateInitialTasks.mockRejectedValueOnce(new Error('Seed failed'));
    await expect(clearDatabase()).rejects.toThrow('Seed failed');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(populateInitialGames).toHaveBeenCalledTimes(1);
    expect(cleanupExpiredImportedEvents).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
});
