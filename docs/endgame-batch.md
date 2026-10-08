# Lote inicial de desafios GI + NTE

Implementação local de 08/10/2026, ainda sem publicação ou migração no Supabase live. É uma ação explícita separada das weeklies e dos eventos importados da API.

A evolução solicitada para um único **Carregar Lote**, incluindo weeklies e outros desafios, está planejada em [task-batch-plan.md](task-batch-plan.md). A interface descrita abaixo ainda mantém os controles separados.

## Catálogo e decisões

| Jogo | Tarefa | Acompanhamento |
| --- | --- | --- |
| GI | Imaginarium Theater | Dia 1º de cada mês, 09:00 UTC / 06:00 Brasília |
| GI | Spiral Abyss (Abismo) | Lembrete antecipado no dia 15, 09:00 UTC / 06:00 Brasília |
| NTE | Beyond the Rails | A cada 14 dias a partir do próximo prazo informado pelo usuário |

A [HoYoverse](https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards) confirma Theater no dia 1º e Abismo no dia 16. Perguntado sobre dia 16 oficial ou lembrete antecipado no dia 15, Cristian escolheu **“Dia 15 — lembrete antecipado”**. Os horários de 06:00 são o padrão adotado para os lembretes deste lote; não são evidência independente do horário de cada reset no jogo.

Cristian forneceu um resumo com ciclo típico de 14 dias para NTE, horários de reset e orientação para consultar o contador do jogo. A página [Icy Veins](https://www.icy-veins.com/neverness-to-everness/nte-beyond-the-rails), lida em 08/10/2026, informa o ciclo típico de 14 dias e ainda mostra 23/09–07/10, sem estabelecer uma próxima âncora regional na América. O reset diário confirmado do NTE não determina sozinho a data e hora de Beyond the Rails. Por isso o campo não tem uma data padrão inventada. O usuário informa o próximo prazo conferido no jogo, no **horário local do navegador**; o frontend converte o instante para ISO/UTC, e a renovação conserva essa hora UTC. Se o calendário do jogo mudar, o prazo e o intervalo podem ser editados manualmente.

## Contratos e preservação

- Um botão e uma RPC `create_profile_endgame_batch` criam o lote dos jogos GI/NTE habilitados no perfil. O filtro visual não restringe a ação. Só GI gera duas tarefas; só NTE gera uma; ambos geram três.
- O boot não chama essa RPC. A criação fica registrada em `profile_endgame_batches`, por perfil e sigla. Habilitar um jogo posteriormente permite acrescentá-lo sem reabrir o lote anterior.
- Nome exato + jogo + tarefa pessoal ativa bloqueia duplicação, sem presumir origem. Preserva integralmente homônimos, inclusive Events/Custom, capas, favoritas, conclusão e prazos. O lote registrado não garante a recorrência dos homônimos preservados. Abismo é criado com o nome inglês **Spiral Abyss**; uma tarefa antiga nomeada apenas “Abismo” não é inferida como homônimo.
- Repetir a ação não recria tarefas excluídas nem renomeadas. Para restaurar uma atividade removida, use Create New Task. Um reset completo explícito limpa também os marcadores deste lote; aplicar a migração não executa reset.
- GI e NTE são uma transação: falta de prazo futuro para um NTE ausente ou falha em qualquer inserção desfaz tarefas e marcadores da operação inteira. NTE já registrado, ou homônimo existente, dispensa novo prazo.
- Perfis compartilham a identidade da definição (`tasks.shared_key`, prefixo `endgame:`), com prazo, recorrência, conclusão, exclusão e favorita pessoais. Nenhum candidato da API é criado/vinculado por este lote.
- Tipos `refresh_type=9` (dia 1º) e `10` (dia 15) têm `repeat_days=null`; constraints exigem um prazo. Tipos anteriores mantêm significado e dados. A opção Monthly antiga continua sendo 30 dias (31 nos registros legados sem intervalo explícito).
- Renovação ocorre ao abrir/recarregar o aplicativo, seguindo o fluxo existente: tarefas vencidas reabrem no próximo prazo estritamente futuro e conservam favoritas/capas. Não é timer em segundo plano. Mensais seguem calendário UTC e a hora do prazo salvo; Beyond the Rails usa 14 dias UTC desde o prazo anterior, pulando ciclos perdidos. Edição de prazo é respeitada até vencer.

## Banco e validação local

Para destino existente já atualizado até favoritas, aplique **somente** `db/migrations/2026-10-08-endgame-batch.sql` no SQL Editor. A ordem completa está em `tests/helpers/testDatabase.mjs`; a migração anterior necessária é `2026-10-06-favorite-tasks.sql`. Para instalação nova, `db/schema.sql` e `db/seed.sql` já incluem a estrutura. Não reaplique o schema inteiro em uma instalação existente.

Prévia com banco descartável, sem credenciais nem acesso ao Supabase:

```powershell
npm run preview:profiles
# Abra http://127.0.0.1:5501/tasks
```

Para testar, selecione um perfil e habilite Genshin e NTE em Selecionar jogos. Abra Tasks, informe o próximo prazo do Beyond the Rails no horário local e clique em **Criar lote inicial de desafios**. Confira três tarefas e seus intervalos (dia 1, dia 15 e 14 dias). Marque uma favorita/concluída, edite seu nome ou prazo, salve e recarregue: seus dados devem continuar iguais. Repita o botão: nenhuma duplicata. Exclua uma tarefa e repita: ela não deve voltar. Troque para Demo para conferir que a criação e conclusão são independentes. Para reproduzir a renovação, ajuste um prazo para o passado, conclua e recarregue: deve reabrir no próximo ciclo futuro mantendo a estrela.

No teste de falha, parta de um perfil ainda sem lote, com GI/NTE habilitados e campo NTE vazio. A ação deve explicar o prazo necessário e não criar nenhuma das três tarefas. Para apenas GI, desabilite NTE no perfil: o campo some e a criação mensal dispensa âncora.

Etapa 1 — contratos novos, calendário e DOM real:

```powershell
node --test tests/endgameBatches.test.mjs tests/endgameRecurrence.test.mjs tests/endgameBatchesUI.test.mjs
# Compatibilidade de perfis, weeklies e mensagens:
node --test tests/profiles.test.mjs tests/weeklyBatches.test.mjs tests/weeklyBatchesUI.test.mjs tests/uiFeedback.test.mjs
# Recorrência, filtros, formulários, mapper e reset antigos:
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/refreshType.test.js tests/dateUtils.test.js tests/taskFilters.test.js tests/taskRenewal.test.js tests/taskForm.test.js tests/mappers.test.js tests/databaseReset.test.js
```

Etapa 1 executada: **205 testes distintos aprovados** (53 novos, 89 de compatibilidade Node e 63 Jest). A conferência em navegador não foi realizada porque o controle do navegador falhou ao iniciar; a prévia local está disponível para o teste de Cristian.

Testes offline com relógio fixo, PostgreSQL descartável e cliente simulado. Contratos SQL rodam como `anon` em instalação nova e upgrade. Cobrem transação/rollback, retry, homônimos, exclusão/renomeação, seleção posterior, perfis, favoritas, prazos, meses curtos/ano bissexto/virada do ano e fusos com DST. A suíte completa fica para o fechamento da versão MINOR ou pedido explícito. Ainda falta validar a migração/RPC no Supabase real, PostgREST e concorrência entre duas conexões reais; o PGlite não comprova esses pontos.
