-- Copia games e tasks para as tabelas *_duplicate no mesmo Supabase.
-- Execute uma vez no SQL Editor. Não apaga nem altera as tabelas originais.
-- Se as cópias tiverem dados ou estrutura diferente, a transação é cancelada.

begin transaction isolation level repeatable read;

do $$
declare
    table_name text;
    backup_name text;
    source_signature jsonb;
    backup_signature jsonb;
    columns_to_copy text;
    has_difference boolean;
    backup_sequence text;
    largest_id bigint;
    row_count bigint;
begin
    foreach table_name in array array['games', 'tasks'] loop
        backup_name := table_name || '_duplicate';

        if to_regclass(format('public.%I', table_name)) is null or
           to_regclass(format('public.%I', backup_name)) is null then
            raise exception 'As tabelas public.% e public.% precisam existir.', table_name, backup_name;
        end if;

        select jsonb_object_agg(a.attname, format_type(a.atttypid, a.atttypmod)),
               string_agg(format('%I', a.attname), ', ' order by a.attnum)
        into source_signature, columns_to_copy
        from pg_attribute a
        where a.attrelid = to_regclass(format('public.%I', table_name))
          and a.attnum > 0 and not a.attisdropped;

        select jsonb_object_agg(a.attname, format_type(a.atttypid, a.atttypmod))
        into backup_signature
        from pg_attribute a
        where a.attrelid = to_regclass(format('public.%I', backup_name))
          and a.attnum > 0 and not a.attisdropped;

        if source_signature is distinct from backup_signature then
            raise exception 'Estrutura diferente entre public.% e public.%. Nenhum dado foi copiado.',
                table_name, backup_name;
        end if;

        execute format('select exists (select 1 from public.%I)', backup_name) into has_difference;
        if has_difference then
            raise exception 'public.% já contém dados. Nenhum registro será sobrescrito.', backup_name;
        end if;
    end loop;

    -- Copiar jogos antes de tarefas preserva os game_id e os IDs originais.
    foreach table_name in array array['games', 'tasks'] loop
        backup_name := table_name || '_duplicate';

        select string_agg(format('%I', a.attname), ', ' order by a.attnum)
        into columns_to_copy
        from pg_attribute a
        where a.attrelid = to_regclass(format('public.%I', table_name))
          and a.attnum > 0 and not a.attisdropped;

        execute format(
            'insert into public.%I (%s) overriding system value select %s from public.%I',
            backup_name, columns_to_copy, columns_to_copy, table_name
        );

        execute format(
            'select exists (
                (select %1$s from public.%2$I except all select %1$s from public.%3$I)
                union all
                (select %1$s from public.%3$I except all select %1$s from public.%2$I)
            )',
            columns_to_copy, table_name, backup_name
        ) into has_difference;

        if has_difference then
            raise exception 'A conferência falhou para public.%; cópia cancelada.', backup_name;
        end if;

        -- Se a cópia possui identity/serial, ajuste o próximo ID para uso futuro.
        backup_sequence := pg_get_serial_sequence(format('public.%I', backup_name), 'id');
        if backup_sequence is not null then
            execute format('select max(id), count(*) from public.%I', backup_name)
            into largest_id, row_count;
            perform setval(backup_sequence::regclass, coalesce(largest_id, 1), row_count > 0);
        end if;
    end loop;
end;
$$;

commit;

-- Guarde este resultado: as contagens de cada par devem ser iguais.
select 'games' as table_name,
       (select count(*) from public.games) as original_rows,
       (select count(*) from public.games_duplicate) as backup_rows
union all
select 'tasks',
       (select count(*) from public.tasks),
       (select count(*) from public.tasks_duplicate);
