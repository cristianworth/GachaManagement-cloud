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

export const SUPABASE_URL = 'COLE_AQUI_A_URL_DO_PROJETO';
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_CHAVE_ANON';

export function isSupabaseConfigured() {
    return (
        typeof SUPABASE_URL === 'string' &&
        typeof SUPABASE_ANON_KEY === 'string' &&
        SUPABASE_URL.startsWith('http') &&
        !SUPABASE_ANON_KEY.startsWith('COLE_AQUI')
    );
}
