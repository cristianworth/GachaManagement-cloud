// tests\dateUtils.test.js
import { calculateMaxStaminaDate, formatDateForDisplay } from '../js/utils/dateUtils.js';

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