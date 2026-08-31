// js/database/supabaseClient.js
//
// Ponto único de criação do cliente Supabase. O restante da aplicação depende
// apenas deste módulo (e não da biblioteca global), o que facilita testes e
// eventuais trocas de backend.
//
// A biblioteca é carregada via <script> no index.html, expondo `window.supabase`.

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config/supabase.config.js';

let client = null;

/**
 * Retorna o cliente Supabase (singleton). Lança erro claro caso a biblioteca
 * não tenha sido carregada ou as credenciais não tenham sido configuradas.
 */
export function getClient() {
    if (client) {
        return client;
    }

    if (typeof window === 'undefined' || !window.supabase) {
        throw new Error(
            'Biblioteca do Supabase não encontrada. Verifique o <script> do Supabase no index.html.'
        );
    }

    if (!isSupabaseConfigured()) {
        throw new Error(
            'Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY em js/config/supabase.config.js.'
        );
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
}

export const Tables = Object.freeze({
    GAMES: 'games',
    TASKS: 'tasks',
});
