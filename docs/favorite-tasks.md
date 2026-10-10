# Favorite tasks — estrelas por perfil

Entrega da versão 1.9.0, com commit e push autorizados por Cristian em 07/10/2026. Frontend, schema, migração e testes entregues; **a migração foi aplicada por Cristian no pacote incremental do Supabase em 09/10/2026**. A publicação do código não executa o SQL no destino.

## Comportamento

- A estrela vazia marca uma tarefa como favorita; a preenchida remove essa preferência. O botão tem ação nomeada, `aria-pressed`, operação nativa por teclado e conserva o foco após a mudança de posição.
- A preferência é `profile_tasks.is_favorite`, com padrão `false`. Tarefas e capas continuam compartilhadas conforme os contratos existentes; a estrela pertence ao perfil.
- Ordem: favoritas primeiro; em cada grupo, prazo crescente, tarefas sem prazo ao fim e ID crescente como desempate. SQL e renderização usam essa mesma regra. Filtros de jogo, intervalo e Hide completed continuam funcionando.
- Recarregar, editar, concluir, renovar uma recorrência ou ocultar/reselecionar o jogo conserva a preferência. Sincronizar a mesma edição conserva a estrela; uma edição nova começa sem ela.
- Favoritar não altera prazo, conclusão, imagem ou recorrência e não protege um importado vencido da limpeza. A RPC não cria tarefas nem restaura removidas.
- Durante a gravação, a linha bloqueia suas ações e a estrela impede envio duplicado. A tela só muda após a gravação aceita. Falha mantém o estado anterior; se salvar funcionar e a recarga falhar, a lista local conserva o resultado salvo e oferece Tentar novamente.

## Banco e implantação

Para um banco existente, aplicar [2026-10-06-favorite-tasks.sql](../db/migrations/2026-10-06-favorite-tasks.sql) **depois** de `2026-10-05-event-editions-expiry.sql` e antes de usar o frontend novo. A migração adiciona o booleano pessoal, atualiza a ordenação de `list_profile_tasks` e cria `set_profile_task_favorite(p_profile_id, p_task_id, p_is_favorite)`. Valida perfil, tarefa pessoal ativa e jogo selecionado; valores nulos, IDs de outro perfil e tarefas removidas/ocultas são rejeitados.

`db/schema.sql` contém o mesmo contrato para instalação nova. A migração incremental conserva os dados atuais e notifica o PostgREST para recarregar o schema. Os perfis continuam públicos, sem autenticação; a RPC segue o modelo atual.

## Teste local sem Supabase

```powershell
npm run preview:profiles
```

Abra `http://127.0.0.1:5501`, com banco temporário. Se já houver uma prévia anterior rodando, encerre-a com Ctrl+C e execute novamente para carregar a migração nova.

1. Escolher CRAN, selecionar ZZZ e criar suas weeklies. Em Tasks, marcar com estrela uma tarefa mais distante: ela deve subir. Marcar as duas mantém a ordem por prazo; desfavoritar devolve a posição normal.
2. Recarregar a página: a estrela continua. Trocar para Demo e selecionar ZZZ: a mesma weekly começa sem estrela; voltar ao CRAN conserva sua preferência.
3. Concluir a favorita com Hide completed marcado: ela desaparece. Desmarcar o filtro mostra a tarefa com estrela; desfazer a conclusão conserva a favorita.
4. Usar filtros de jogo e intervalo: favoritas fora do filtro continuam ocultas. Ocultar/reselecionar ZZZ conserva as estrelas e não recria tarefas excluídas.
5. Usar Tab para focar a estrela e Espaço/Enter para alternar. O foco deve acompanhar o botão após reordenar.

```powershell
npm test
npm run test:db
node --test tests/favoriteTasks.test.mjs tests/favoriteTasksUI.test.mjs
```

Os testes usam SQL e DOM reais em banco descartável, como `anon`. Cobrem instalação nova/upgrade, estado independente, ordenação, migração com dados existentes, rejeições, correções da API, edição seguinte, limpeza, renovação real de recorrentes, falha de gravação/recarga e envio duplicado. Não acessam APIs ou o Supabase live. PostgREST e duas conexões reais continuam sendo verificações de implantação.

Validação local em 06/10/2026: **377 testes passaram** em `npm test` (69 Jest + 308 Node); os 19 cenários específicos de banco/DOM estão nesse total. No navegador da prévia, Notorious Hunt foi favoritada por clique, desfavoritada com Espaço, favoritada com Enter e conservou a estrela e a posição após recarregar. `git diff --check` passou.
