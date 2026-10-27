// js/database/mappers/gameMapper.js
//
// Converte entre o objeto de domínio Game (camelCase, datas como Date) e a
// linha da tabela `games` no Postgres (snake_case, datas como ISO string).

function toIsoStringOrNull(value) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
}

function toNumberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Domínio -> linha do banco. Não inclui `id` (deixa o Postgres gerar no insert;
 * no update o id é usado apenas no filtro, não no payload).
 */
export function gameToRow(game) {
    return {
        description: game.description,
        abbreviation: game.abbreviation,
        img: game.img,
        cap_stamina: toNumberOrNull(game.capStamina),
        stamina_per_minute: toNumberOrNull(game.staminaPerMinute),
        current_stamina: toNumberOrNull(game.currentStamina) ?? 0,
        max_stamina_at: game.maxStaminaAt ?? '',
        date_max_stamina: toIsoStringOrNull(game.dateMaxStamina),
        pending_tasks: game.pendingTasks ?? '',
        color: game.color,
    };
}

/**
 * Linha do banco -> objeto usado pela UI (camelCase, dateMaxStamina como Date).
 */
export function gameFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        description: row.description,
        abbreviation: row.abbreviation,
        img: row.img,
        capStamina: row.cap_stamina,
        staminaPerMinute: row.stamina_per_minute,
        currentStamina: row.current_stamina ?? 0,
        maxStaminaAt: row.max_stamina_at ?? '',
        dateMaxStamina: row.date_max_stamina ? new Date(row.date_max_stamina) : null,
        pendingTasks: row.pending_tasks ?? '',
        dailyState: row.daily_state ?? null,
        notices: row.game_notices ?? null,
        agenda: row.game_agenda ?? [],
        noticePreferences: row.game_notice_preferences ?? null,
        bannerReads: Object.fromEntries(Object.entries(row).filter(([key])=>key.startsWith('banner_phase_read_'))
            .map(([key,value])=>[key.slice('banner_phase_read_'.length),value])),
        noticeReads: { maintenance: row.maintenance_notice_read ?? null, banner: row.banner_notice_read ?? null },
        color: row.color,
    };
}
