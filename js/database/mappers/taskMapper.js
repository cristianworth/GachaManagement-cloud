// js/database/mappers/taskMapper.js
//
// Converte entre o objeto de domínio Task (camelCase, expirationDate como Date)
// e a linha da tabela `tasks` no Postgres (snake_case, datas como ISO string).

import { gameFromRow } from './gameMapper.js';
import RefreshTypeEnum from '../../enums/RefreshTypeEnum.js';

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
        ...(task.repeatDays !== undefined ? { repeat_days: task.repeatDays } : {}),
        game_id: task.gameId ?? null,
        game_description: task.gameDescription,
        ...(task.startAt !== undefined ? { start_at: toIsoStringOrNull(task.startAt) } : {}),
        // Omitting an unedited cover preserves it; null explicitly removes the URL.
        ...(task.coverUrl !== undefined ? { cover_url: task.coverUrl } : {}),
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
        isFavorite: row.is_favorite ?? false,
        refreshType: row.refresh_type,
        repeatDays: row.refresh_type === 0 ? null : row.repeat_days ?? RefreshTypeEnum.findDaysById(row.refresh_type),
        gameId: row.game_id,
        gameDescription: row.game_description,
        coverUrl: row.cover_url ?? null,
        startAt: row.start_at ? new Date(row.start_at) : null,
        eventCandidateId: row.event_candidates?.[0]?.id ?? null,
        eventDeadlineManual: row.event_deadline_manual ?? false,
        weeklyDefinitionKey: row.weekly_batch_items?.definition_key
            ?? row.weekly_batch_items?.[0]?.definition_key ?? null,
        game: row.game ? gameFromRow(row.game) : undefined,
    };
}
