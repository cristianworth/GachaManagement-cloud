// js\data\Game.js
export class Game {
    id;
    description;
    abbreviation;
    img;
    capStamina;
    staminaPerMinute;
    color;
    currentStamina = 0; 
    maxStaminaAt = '';
    dateMaxStamina = new Date();
    pendingTasks = '';

    constructor(description, abbreviation, img, capStamina, staminaPerMinute, color, id = undefined) {
        this.description = description;
        this.abbreviation = abbreviation;
        this.img = img;
        this.capStamina = capStamina;
        this.staminaPerMinute = staminaPerMinute;
        this.color = color;
        this.id = id;
    }
}


export const allGames = [];
allGames.push(new Game('Genshin Impact', 'GI', 'img/genshin-icon.png', 200, 8, '#b3d9ff'));
allGames.push(new Game('Honkai Star Rail', 'HSR', 'img/star-rail-icon.png', 300, 6, '#d1f0d1'));
allGames.push(new Game('Wuthering Waves', 'WuWa', 'img/wuthering-waves-icon.png', 240, 6, '#ffffb3'));
allGames.push(new Game('Zenless Zone Zero', 'ZZZ', 'img/zzz-icon.png', 240, 6, '#e6ccff'));
allGames.push(new Game('Neverness to Everness', 'NTE', 'img/default-icon.png', 320, 6, '#ffb3b3'));
// allGames.push(new Game('Punishing Gray Raven', 'PGR', 'img/pgr-icon.png', 240, 6, '#d9d9d9'));
// allGames.push(new Game('Nikke', 'NKK', 'img/nikke-icon.png', 1, 1440, '#f2e6d9'));
