// js/config/supabase.config.js
//
// Configuração de acesso ao Supabase (banco de dados na nuvem).
//
// Como preencher:
//   1. Crie uma conta gratuita em https://supabase.com e um novo projeto.
//   2. No painel do projeto vá em  Project Settings > Data API (ou API).
//   3. Copie a "Project URL" para SUPABASE_URL.
//   4. Copie a chave pública "anon / public" para SUPABASE_ANON_KEY.
//
// Observação: como este site é público (GitHub Pages), a chave "anon" fica
// visível no código-fonte — isso é esperado e seguro apenas porque o acesso
// escolhido é pessoal/aberto. Não coloque aqui a chave "service_role".

export const SUPABASE_URL = 'https://zzcxhtblbmiakuvdakic.supabase.co';

// Chave pública ("publishable" / anon). Segura para uso no front-end.
// Nunca use aqui a chave "service_role" nem a senha do banco de dados.
export const SUPABASE_ANON_KEY = 'sb_publishable_l6pW6OQ8JgFXNH5hUG08gw_WwBfLMzh';

export function isSupabaseConfigured() {
    return (
        typeof SUPABASE_URL === 'string' &&
        typeof SUPABASE_ANON_KEY === 'string' &&
        SUPABASE_URL.startsWith('http') &&
        !SUPABASE_ANON_KEY.startsWith('COLE_AQUI')
    );
}
