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
