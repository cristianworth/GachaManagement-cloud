import { getEventGame } from './eventGames.js';
export { activityKey as genshinActivityKey, normalizeStarRailAssistantActivities as normalizeStarRailAssistantGenshin } from './starRailAssistant.js';

export const STAR_RAIL_ASSISTANT_GENSHIN_URL = getEventGame('genshin').url;
export const STAR_RAIL_ASSISTANT_GENSHIN_SOURCE = getEventGame('genshin').source;
