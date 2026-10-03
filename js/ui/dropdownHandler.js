// js\ui\dropdownHandler.js
import { fetchAllGames } from '../database/gameDB.js';
import RefreshTypeEnum from '../enums/RefreshTypeEnum.js';

export async function populateGameDropDown() {
    let games = await fetchAllGames();
    const selectGame = document.getElementById("taskGameId");

    games.forEach(game => {
        let option = document.createElement("option");
        option.value = game.id;
        option.textContent = game.description;
        selectGame.appendChild(option);
    });
}

export function populateRefreshTypeDropDown() {
    const selectRefreshType = document.getElementById("refreshType");

    selectRefreshType.replaceChildren();
    RefreshTypeEnum.presets.forEach(rType => {
        let option = document.createElement("option");
        option.value = rType.id;
        option.textContent = rType.value;
        selectRefreshType.appendChild(option);
    })
}
