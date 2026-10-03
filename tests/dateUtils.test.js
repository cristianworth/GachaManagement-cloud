// tests\dateUtils.test.js
import { calculateMaxStaminaDate, formatDateForDisplay, getNextRecurringDeadline } from '../js/utils/dateUtils.js';

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
