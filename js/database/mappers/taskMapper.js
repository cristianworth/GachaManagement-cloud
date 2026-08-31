// js/database/mappers/taskMapper.js
//
// Converte entre o objeto de domínio Task (camelCase, expirationDate como Date)
// e a linha da tabela `tasks` no Postgres (snake_case, datas como ISO string).

import { gameFromRow } from './gameMapper.js';

function toIsoStringOrNull(value) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
}

/**
 * Domínio -> linha do banco. Não inclui `id` (ver gameMapper).
 */
export function taskToRow(task) {
    return {
        description: task.description,
        expiration_date: toIsoStringOrNull(task.expirationDate),
        is_done: task.isDone ?? false,
        refresh_type: task.refreshType,
        game_id: task.gameId ?? null,
        game_description: task.gameDescription,
    };
}

/**
 * Linha do banco -> objeto usado pela UI. Quando a consulta traz o jogo
 * relacionado (embedding do Supabase), ele é mapeado para `task.game`.
 */
export function taskFromRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        description: row.description,
        expirationDate: row.expiration_date ? new Date(row.expiration_date) : null,
        isDone: row.is_done ?? false,
        refreshType: row.refresh_type,
        gameId: row.game_id,
        gameDescription: row.game_description,
        game: row.game ? gameFromRow(row.game) : undefined,
    };
}
