-- Aplicar uma vez no Supabase que já recebeu a migração de eventos de 29/09.
-- Mantém candidatos e tarefas existentes; a próxima sincronização preenche as capas.
alter table public.event_candidates
    add column if not exists cover_url text;
