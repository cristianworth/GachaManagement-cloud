# Criação inicial de weeklies

Entrega da versão 1.5.0, datada de 05/10/2026, com commit e atualização do changelog autorizados por Cristian. Testes offline aprovados; o agente não aplicou a migração nem validou a interface, PostgREST ou duas conexões reais no Supabase de destino. Push depende de pedido explícito.

## Catálogo e relógio

| Sigla cadastrada | Definições do novo lote | Reset América |
| --- | --- | --- |
| HSR | Echo of War; Simulated Universe (acompanhamento semanal por preferência de Cristian) | Segunda, 04:00 UTC−5 |
| WuWa | Weekly Boss; Fantasies of the Thousand Gateways | Segunda, 04:00 UTC−5 |
| ZZZ | Hollow Zero; Notorious Hunt | Segunda, 04:00 UTC−5 |

O primeiro prazo é o próximo reset **estritamente futuro**: segunda às 09:00 UTC / 06:00 de Brasília. Exatamente no reset, o lote pertence à semana que começa e vence na segunda seguinte. Produção usa `now()` do PostgreSQL; testes injetam um instante UTC. O cálculo não depende do fuso do computador nem do horário de verão de Nova York. Novas tarefas têm `refresh_type=2`, `repeat_days=7` e conclusão falsa; a capa ausente usa o placeholder existente.

Fontes Game8 consultadas em 04/10/2026:

- [Echoes of War](https://game8.co/games/Honkai-Star-Rail/archives/410031): reset semanal de segunda às 04:00 UTC−5 na América.
- [WuWa: resets](https://game8.co/games/Wuthering-Waves/archives/454085): segunda às 04:00 e limite semanal dos bosses. A página registra atualização em setembro de 2024; foi usada para a regra permanente de reset, sem extrapolar calendário de evento.
- [Fantasies of the Thousand Gateways](https://game8.co/games/Wuthering-Waves/archives/498720): modo com ciclo semanal de segunda. O corpo consultado apresenta janeiro de 2026, não a edição de outubro. Cristian aprovou esse modo no novo catálogo, sem renomear/excluir Illusive Realm existente.
- [ZZZ: resets](https://game8.co/games/Zenless-Zone-Zero/archives/460247): segunda às 04:00 no servidor América UTC−5, incluindo Hollow Zero e Notorious Hunt. A regra é permanente; o texto antigo sobre Shiyu Defense não é usado.
- [Hollow Zero](https://game8.co/games/Zenless-Zone-Zero/archives/457182): recompensas e objetivos semanais.
- [HSR 3.7](https://game8.co/games/Honkai-Star-Rail/archives/549138): a informação consultada descreve recompensas por pontos de Simulated Universe em ciclos de duas semanas. Por pedido explícito de Cristian em 04/10/2026, Simulated Universe integra novamente o catálogo com acompanhamento de sete dias e prazo na segunda às 06:00 de Brasília. Essa é uma preferência pessoal de acompanhamento, não confirmação de reset semanal das recompensas no jogo. Registros e decisões de lotes existentes continuam preservados.

Não foram acrescentadas weeklies de GI/NTE, modos temporários de Illusive Realm nem eventos de datas fixas.

## Estado e preservação

`js/data/weeklyTasks.js` separa o catálogo da classe `Task`, sem IDs de jogos ou datas fixas. `populateInitialTasks()` consulta `fetchAllGames()` uma vez e valida as siglas antes de escrever. Jogo ausente é pulado no boot; ação explícita informa o erro. Sigla duplicada interrompe a operação, sem escolher um ID por posição. A função SQL revalida sigla/ID.

`weekly_batches` guarda uma decisão por sigla: `skipped` (não criar automaticamente) ou `created` (lote registrado). `weekly_batch_items` guarda as identidades das definições e os vínculos das tarefas realmente criadas. A exclusão da tarefa deixa `task_id` nulo; a exclusão do jogo também preserva o lote. Isso evita recriação após exclusão, renomeação ou cadastro posterior com outro ID.

A migração marca todos os lotes disponíveis como `skipped` quando a instalação já contém jogos ou tarefas, sem modificar esses dados. Isso inclui jogos ausentes, para que cadastrá-los depois não contorne a preferência por criação explícita. Essa é a regra conservadora aprovada por Cristian: não existe histórico suficiente para distinguir tarefas nunca criadas de tarefas removidas. Na instalação nova, lotes ainda sem decisão são criados no boot, mesmo se houver tarefas de outros jogos. No upgrade, o botão **Criar lote inicial de weeklies deste jogo** permite registrar o lote uma única vez.

Na primeira criação explícita, nome exato + jogo apenas bloqueia duplicação: um homônimo é preservado sem presumir origem, sem alterar prazo/conclusão/imagem/recorrência e sem vincular sua propriedade ao seed. Até homônimos múltiplos são preservados; não há associação arbitrária. Se o usuário renomeou uma tarefa antes deste upgrade, não é possível inferir que ela corresponde a uma definição; revise a lista antes de criar o lote. Repetir um lote `created` não cria nada, inclusive itens excluídos. Para voltar a acompanhar uma atividade excluída, use o cadastro manual existente. Não há botão de recriação/reset do lote.

`created` significa que a operação inicial foi registrada, não que todo homônimo existente é semanal: Event e Custom também são preservados. O lote fica fechado; futuras adições ao catálogo não completam lotes já registrados automaticamente. Uma atualização de catálogo precisará de uma decisão própria para respeitar as exclusões anteriores.

Cada RPC cria o lote em uma transação, com locks de jogo/lote e chaves únicas. Falha em qualquer item desfaz os itens anteriores e o estado do lote. Lotes de jogos diferentes são operações independentes; um boot que falhe num jogo pode ser repetido sem duplicar os já concluídos. Uma resposta perdida após commit também pode ser repetida. A renovação de weeklies vinculadas mantém a hora UTC do prazo salvo, inclusive uma correção manual. Apenas o intervalo semanal padrão gerenciado usa UTC; tarefas manuais, legadas e intervalos personalizados mantêm a regra anterior. A limpeza HSR continua restrita a eventos importados sem repetição.

O reset completo explícito de `clearDatabase()` é diferente da exclusão normal: chama `reset_application_data()` para apagar candidatos, itens/decisões dos lotes, tarefas e jogos em uma transação. Depois do sucesso, o frontend recria os dados iniciais. Uma falha na limpeza desfaz todas as exclusões e impede a reinicialização; uma falha posterior no seed é propagada, sem anunciar sucesso. Limpeza e recriação são etapas separadas. A função continua sem chamadas no fluxo normal e sem botão de reset. A migração apenas define essa RPC; aplicá-la não executa a limpeza.

## Como testar localmente

Na pasta do projeto:

```powershell
npm test
# Apenas os contratos SQL, instalação nova e upgrade:
npm run test:db
# Apenas criação, recuperação de falhas e controles de interface:
node --test tests/weeklyBatches.test.mjs tests/weeklyBatchesUI.test.mjs
# Recorrência e mapeamento:
npm run test:jest -- --runTestsByPath tests/taskRenewal.test.js tests/mappers.test.js tests/dateUtils.test.js
# Ordem e recuperação de falhas do reset completo (cliente simulado):
npm run test:jest -- --runTestsByPath tests/databaseReset.test.js
```

Todos esses testes são offline: PGlite descartável, relógio fixo e DOM com cliente simulado. Não consultam APIs nem o banco configurado no app.

Para testar a interface, o app local usa o Supabase configurado; rodar `npm start` não cria um banco local isolado. Use um projeto de teste/uma cópia dos dados para cenários de exclusão, falhas e concorrência. Para um banco existente já atualizado até NTE, execute **somente** [`2026-10-04-weekly-batches.sql`](../db/migrations/2026-10-04-weekly-batches.sql) no SQL Editor do destino de teste antes de abrir esta versão. Para instalação nova: `db/schema.sql`, depois `db/seed.sql`. Não limpe o banco atual nem reaplique o schema inteiro para fazer o upgrade.

```powershell
# Se não houver um servidor deste projeto na porta 5500:
npm start
```

Abra `http://localhost:5500` e siga os cenários:

1. **Upgrade:** antes/depois de abrir o app, confira nomes, capas, conclusão e prazos futuros já salvos. O boot não deve completar os lotes. Recorrentes vencidas continuam renovando normalmente, como antes.
2. **Criação por jogo:** em Task List, filtre HSR/WuWa/ZZZ e clique no botão. Apenas as definições ausentes daquele jogo devem aparecer; outros jogos, eventos e homônimos permanecem iguais. GI/NTE e All games mantêm o botão desabilitado. Hide completed/filtro de intervalo podem ocultar uma tarefa criada; desative-os para conferir todas.
3. **Prazos:** o primeiro prazo deve ser a próxima segunda às 06:00 de Brasília. No reset exato ou depois dele, deve ser a segunda seguinte. Os testes automatizados cobrem o instante exato e fuso/DST.
4. **Repetição e exclusão:** repita o clique, recarregue, exclua uma tarefa criada e recarregue novamente. O lote registrado não duplica nem restaura a excluída, mesmo após outro clique.
5. **Preservação:** antes da primeira criação de um lote no banco de teste, deixe um homônimo com capa, conclusão e prazo manual futuro. Ele deve permanecer byte a byte igual; a função apenas registra que não precisa criar essa definição.
6. **Falha/retry:** bloqueie a requisição RPC no navegador de teste. Deve haver feedback de erro, liberação do loading/botão e preservação da lista/filtros. Se apenas a recarga após salvar falhar, a mensagem informa que o lote foi registrado; Tentar novamente recarrega sem repetir a gravação.
7. **Duas abas:** num lote ainda não criado do banco de teste, clique nas duas abas quase simultaneamente. Confira um único conjunto de tarefas e uma decisão `created`. O PGlite serializa as consultas; os testes offline não comprovam concorrência entre duas conexões reais nem grants/cache do PostgREST no destino.
8. **Instalação nova:** em projeto vazio de teste, aplique schema + seed e abra o app. Deve criar seis tarefas (HSR 2, WuWa 2, ZZZ 2), incluindo Simulated Universe semanal por preferência de Cristian, sem eventos fixos ou Illusive Realm no catálogo novo e usando os IDs reais dos jogos. Abrir novamente não duplica.

O reset completo e seu rollback são exercitados somente no banco descartável da suíte. Não é necessário resetar o banco configurado para validar a criação inicial.

Consultas de conferência, sem escrita:

```sql
select * from public.weekly_batches order by abbreviation;
select * from public.weekly_batch_items order by abbreviation, definition_key;
select g.abbreviation, t.id, t.description, t.expiration_date, t.is_done,
       t.refresh_type, t.repeat_days, t.cover_url
from public.tasks t join public.games g on g.id = t.game_id
order by g.abbreviation, t.id;
```

Cristian solicitou commit com documentação no changelog em 05/10/2026. A entrega usa a versão 1.5.0, com manifests, README e badge consistentes. A validação no destino continua separada dos testes offline; push depende de pedido explícito.
