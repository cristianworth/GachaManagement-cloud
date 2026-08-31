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
        dateMaxStamina: row.date_max_stamina ? new Date(row.date_max_stamina) : new Date(),
        pendingTasks: row.pending_tasks ?? '',
        color: row.color,
    };
}
