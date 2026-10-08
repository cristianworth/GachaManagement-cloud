// js\enums\RefreshTypeEnum.js
class RefreshTypeEnum {
    static values = [
        {id: 0, value: 'Event', days: null},
        {id: 1, value: 'Daily', days: 1},
        {id: 2, value: 'Weekly', days: 7},
        {id: 3, value: 'TwoWeeks', days: 14},
        {id: 4, value: 'BiMonthly', days: 15},
        {id: 5, value: 'FourWeeks', days: 28},
        {id: 6, value: 'Monthly', days: 31},
        {id: 7, value: 'SixWeeks', days: 42},
        {id: 8, value: 'Custom', days: null},
        {id: 9, value: 'CalendarMonthStart', days: null, monthDay: 1},
        {id: 10, value: 'CalendarMonthMiddle', days: null, monthDay: 15},
    ];

    // Keep the legacy IDs and intervals above for existing tasks and older clients.
    static presets = [
        {id: 0, value: 'Event / No repeat', days: null},
        {id: 1, value: 'Daily', days: 1},
        {id: 2, value: 'Weekly', days: 7},
        {id: 6, value: 'Monthly', days: 30},
        {id: 8, value: 'Custom', days: null},
        {id: 9, value: 'Monthly — day 1', days: null, monthDay: 1},
        {id: 10, value: 'Monthly — day 15', days: null, monthDay: 15},
    ];

    static getRepeatDays(task) {
        if (task.refreshType === 0 || this.getMonthDay(task)) return null;
        return task.repeatDays ?? this.findDaysById(task.refreshType);
    }

    static getMonthDay(task) {
        return this.values.find(item => item.id === task.refreshType)?.monthDay ?? null;
    }

    static getPresetId(task) {
        return this.getMonthDay(task) ? task.refreshType : this.findPresetId(this.getRepeatDays(task));
    }

    static findPresetId(days) {
        if (days === null) return 0;
        return this.presets.find(preset => preset.id !== 8 && preset.days === days)?.id ?? 8;
    }

    static describe(task) {
        const monthDay = this.getMonthDay(task);
        if (monthDay) return `Monthly — day ${monthDay}`;
        const days = this.getRepeatDays(task);
        return days === null ? 'Event / No repeat' : `Every ${days} ${days === 1 ? 'day' : 'days'}`;
    }

    static findIdByName(name) {
        let foundEnum = this.values.find(x => x.value == name);

        if (foundEnum)
        {
            return foundEnum.id;
        }

        return null;
    }

    static findNameById(id) {
        let foundEnum = this.values.find(x => x.id == id);

        if (foundEnum)
        {
            return foundEnum.value;
        }

        return null;
    }
    
    static findDaysById(id) {
        let foundEnum = this.values.find(x => x.id == id);

        if (foundEnum)
        {
            return foundEnum.days;
        }

        return null;
    }
}

export default RefreshTypeEnum;
