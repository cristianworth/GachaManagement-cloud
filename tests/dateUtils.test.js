// tests\dateUtils.test.js
import { calculateMaxStaminaDate, estimateCurrentStamina, formatDateForDisplay, getNextRecurringDeadline } from '../js/utils/dateUtils.js';

test('calculateMaxStaminaDate should return correct date', () => {
    let game = { currentStamina: 50, capStamina: 240, staminaPerMinute: 8 };
    let result = calculateMaxStaminaDate(game);

    expect(result).toBeInstanceOf(Date);
    expect(result > new Date()).toBe(true); // Deve ser uma data futura
});

test('formatDateForDisplay returns correct format', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 0, 1, 0, 0));

    const date = new Date(2025, 0, 1, 12, 30);
    expect(formatDateForDisplay(date)).toBe('01/01/2025 12:30 (1d left)');

    jest.useRealTimers();
});

test('recurring deadlines skip missed cycles while preserving their original time', () => {
    const previous = new Date(2026, 8, 1, 6, 30);
    const result = getNextRecurringDeadline(previous, 14, new Date(2026, 9, 3, 12));
    expect(result).toEqual(new Date(2026, 9, 13, 6, 30));
    expect(previous).toEqual(new Date(2026, 8, 1, 6, 30));
});

test('Monthly is a 30-day interval and equality starts a new cycle', () => {
    const previous = new Date(2026, 0, 31, 6);
    expect(getNextRecurringDeadline(previous, 30, previous)).toEqual(new Date(2026, 2, 2, 6));
});

test.each([0, -1, 1.5])('invalid interval %s cannot loop during renewal', days => {
    expect(() => getNextRecurringDeadline(new Date(), days)).toThrow('Invalid repeat interval');
});

const staminaForecast = () => ({ capStamina: 240, staminaPerMinute: 6, currentStamina: 180,
    dateMaxStamina: new Date('2026-10-06T18:00:00Z'), maxStaminaAt: 'Saved forecast' });

test.each([
    ['2026-10-06T12:00:00Z', 180],
    ['2026-10-06T12:05:59Z', 180],
    ['2026-10-06T12:06:00Z', 181],
    ['2026-10-06T17:59:59Z', 239],
    ['2026-10-06T18:00:00Z', 240],
    ['2026-10-07T18:00:00Z', 240],
    ['2026-10-05T12:00:00Z', 0],
])('stamina estimate at %s counts whole units and stays within the cap', (now, expected) => {
    const game = staminaForecast();
    expect(estimateCurrentStamina(game, new Date(now))).toBe(expected);
    expect(game.currentStamina).toBe(180);
    expect(game.dateMaxStamina.toISOString()).toBe('2026-10-06T18:00:00.000Z');
});

test('stamina estimates accept numeric settings and fractional minutes per unit', () => {
    const game = { ...staminaForecast(), capStamina: '360', staminaPerMinute: '7.2' };
    expect(estimateCurrentStamina(game, new Date('2026-10-06T17:45:36Z'))).toBe(358);
});

test.each([
    { maxStaminaAt: '' }, { dateMaxStamina: null }, { dateMaxStamina: new Date('invalid') },
    { capStamina: null }, { staminaPerMinute: 0 }, { staminaPerMinute: -1 }, { staminaPerMinute: Infinity },
])('stamina estimates reject missing forecasts or invalid settings: %j', change => {
    expect(estimateCurrentStamina({ ...staminaForecast(), ...change }, new Date('2026-10-06T12:00:00Z'))).toBeNull();
});
