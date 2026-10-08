// tests\refreshType.test.js
import RefreshTypeEnum from '../js/enums/RefreshTypeEnum.js'

test('RefreshTypeEnum finds correct values', () => {
    expect(RefreshTypeEnum.findIdByName('Weekly')).toBe(2);
    expect(RefreshTypeEnum.findNameById(2)).toBe('Weekly');
    expect(RefreshTypeEnum.findDaysById(2)).toBe(7);
});

test('new presets use 30 days without changing legacy Monthly', () => {
    expect(RefreshTypeEnum.presets.map(item => item.value)).toEqual(['Event / No repeat', 'Daily', 'Weekly', 'Monthly', 'Custom', 'Monthly — day 1', 'Monthly — day 15']);
    expect(RefreshTypeEnum.presets.find(item => item.id === 6).days).toBe(30);
    expect(RefreshTypeEnum.getRepeatDays({ refreshType: 6 })).toBe(31);
    expect(RefreshTypeEnum.getRepeatDays({ refreshType: 6, repeatDays: 30 })).toBe(30);
    expect(RefreshTypeEnum.findPresetId(31)).toBe(8);
});

test('API events remain non-recurring and custom labels state the number of days', () => {
    expect(RefreshTypeEnum.getRepeatDays({ refreshType: 0, repeatDays: 7 })).toBeNull();
    expect(RefreshTypeEnum.describe({ refreshType: 8, repeatDays: 14 })).toBe('Every 14 days');
});
