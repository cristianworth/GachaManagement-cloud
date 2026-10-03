// js\data\Task.js
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js'

export class Task {
    id;
    description;
    expirationDate;
    isDone = false;
    refreshType;
    repeatDays;
    gameId;
    gameDescription;
    coverUrl;
    game;

    constructor(description, expirationDate, refreshType, gameId, gameDescription, id = undefined) {
        this.description = description;
        this.expirationDate = expirationDate;
        this.refreshType = refreshType;
        this.repeatDays = RefreshTypeEnum.findDaysById(refreshType);
        this.gameId = gameId;
        this.gameDescription = gameDescription;
        this.id = id;
    }
}

export const allTasks = [];

// allTasks.push(new Task('Spyral Abyss', new Date(2025, 2, 16, 6), RefreshTypeEnum.findIdByName('Monthly'), 1, "Genshin Impact"));
// allTasks.push(new Task('Imaginarium Theater', new Date(2025, 3, 1, 6), RefreshTypeEnum.findIdByName('Monthly'), 1, "Genshin Impact"));

// allTasks.push(new Task('Memory of Chaos', new Date(2025, 2, 31, 6), RefreshTypeEnum.findIdByName('SixWeeks'), 2, "Honkai Star Rail"));
// allTasks.push(new Task('Pure Fiction', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('SixWeeks'), 2, "Honkai Star Rail"));
// allTasks.push(new Task('Apocalyptic Shadow', new Date(2025, 3, 14, 6), RefreshTypeEnum.findIdByName('SixWeeks'), 2, "Honkai Star Rail"));
allTasks.push(new Task('Echo of War', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 2, "Honkai Star Rail"));
allTasks.push(new Task('Simulated Universe', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 2, "Honkai Star Rail"));

// allTasks.push(new Task('Tower of Adversity', new Date(2025, 2, 31, 6), RefreshTypeEnum.findIdByName('FourWeeks'), 3, "Wuthering Waves"));
// allTasks.push(new Task('Whimpering Waves', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('FourWeeks'), 3, "Wuthering Waves"));
allTasks.push(new Task('Illusive Realm', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 3, "Wuthering Waves"));
allTasks.push(new Task('Weekly Boss', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 3, "Wuthering Waves"));

// allTasks.push(new Task('Shiyu Defense', new Date(2025, 2, 28, 6), RefreshTypeEnum.findIdByName('BiMonthly'), 4, "Zenless Zone Zero"));
// allTasks.push(new Task('Deadly Assault', new Date(2025, 2, 21, 6), RefreshTypeEnum.findIdByName('TwoWeeks'), 4, "Zenless Zone Zero"));
allTasks.push(new Task('Hollow Zero', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 4, "Zenless Zone Zero"));
allTasks.push(new Task('Notorious Hunt', new Date(2025, 2, 17, 6), RefreshTypeEnum.findIdByName('Weekly'), 4, "Zenless Zone Zero"));
