# Handoff — importação automática de eventos

Atualizado em 02/10/2026. Este documento é a referência para a próxima etapa; `HANDOFF-genshin-events.md` descreve um piloto anterior e contém decisões já superadas.

## Pedido e decisões aprovadas

Cristian quer evoluir gradualmente o GachaManagement: eventos devem entrar na lista automaticamente quando tiverem prazo final utilizável. O recorte de Genshin/HSR foi implementado e validado na versão 1.2, incluindo filtro por jogo. Retomar a partir desse estado, não do antigo fluxo de aprovação obrigatória.

- Manter HTML/CSS/JavaScript, Supabase e scripts no projeto atual. Reaproveitar a integração StarRailAssistant; não usar Ennead nem criar outro projeto/framework.
- MVP completo com os cinco jogos atuais: Genshin, HSR, WuWa, ZZZ e NTE. **Entrega 1.2: somente Genshin/HSR e calendário inglês, aprovada explicitamente por Cristian.** Fallback chinês e demais jogos ficam para a próxima entrega. Endfield está preparado no commit do usuário para expansão posterior; se ele quiser ativá-lo já, confirmar a mudança de escopo.
- Preferir inglês (`en-US`). Na ausência de dados/prazo em inglês, usar os dados chineses do mesmo evento. Somente a ausência de um prazo utilizável nas fontes disponíveis exige revisão humana.
- Falta de capa: placeholder. Falta de início não bloqueia um evento com fim utilizável. Importar atuais e futuros quando fornecidos.
- Todos os jogos usados por Cristian são do servidor América. Datas finais são prioritárias; ele aceita horários aproximados e ajustes manuais. NTE tem cronogramas diferentes entre Ásia e global; aceitar a limitação da fonte no MVP.
- **Confirmado na última mensagem:** um prazo corrigido manualmente deve ser preservado nas próximas sincronizações, até o usuário escolher voltar à data da API. A correção pertence à edição correspondente, não deve ser herdada automaticamente por uma edição futura.
- Preservar eventos ignorados e conclusão da mesma edição. Novas edições dos modos recorrentes devem começar com estado próprio. Edições importadas vencidas podem ser removidas automaticamente; weeklies e tarefas manuais devem ser preservadas.
- Manter somente weeklies na população inicial. Cristian removerá manualmente os duplicados antigos; comentar o seed não exclui registros do banco.
- Sem tela inicial agora. Futuro: catálogo completo, seleção de jogos, filtros compartilhados entre telas e opção de criar um lote de weeklies por jogo.

O planejamento detalhado e critérios de conclusão estão nos itens 8–12 de `TODO.md`. Filtro por jogo foi implementado; indicador **Recém-adicionado** (prioridade baixa) e paginação da consulta foram documentados para depois.

## Estado do Git — conferir antes de implementar

- Workspace desta conversa: `D:\Repo\GachaManagement\.claude\worktrees\mobile-database-refactor-b9a209`.
- Branch: `codex/genshin-events-pilot`, versão 1.2.0. Base antes da automação: `925108d`; conferir o último commit com `git log -1 --oneline` para obter o hash da entrega final.
- O commit de Cristian `3ddc54d` já foi incorporado por fast-forward. Depois foi publicado `925108d`, complementando o changelog da 1.2 com os ícones e a alteração do seed.
- `3ddc54d`, feito por Cristian, adiciona ícones NTE/Endfield, cadastra Endfield (`AE`) no seed de jogos e comenta todos os seeds de tarefas exceto seis weeklies. Também remove declarações de campos `coverUrl`/`startAt` da classe Task; os mappers continuam persistindo esses campos.
- O planejamento, este handoff e a implementação da automação fazem parte da entrega 1.2. Conferir `git status` ao retomar. Há `.claude/` não rastreado, preexistente; não incluí-lo por engano.
- Antes de implementar, conferir mudanças posteriores preservando estes documentos. Não trabalhar contra o seed antigo nem sobrescrever alterações de Cristian.
- Remoto de publicação: `cloud` = `https://github.com/cristianworth/GachaManagement-cloud.git`. `origin` aponta para `https://github.com/cristianworth/GachaManagement.git`; não confundir.
- PR da 1.2: `https://github.com/cristianworth/GachaManagement-cloud/pull/3`, com base `main`. Cristian validou a entrega localmente e autorizou o merge em 02/10/2026. Conferir o estado do PR e a publicação ao retomar; não solicitar novamente a mesma validação ou autorização.
- Não criar outra branch por conveniência: seguir a branch indicada por Cristian; confirmar o destino se o estado atual ficar ambíguo.

## O que já funciona

- Importação de candidatos em inglês de Genshin e HSR, aprovação/ignorar, capas nas tarefas, placeholder, início do evento e contagem de dias/horas na revisão.
- Rotas de revisão: `/events`, `/events/genshin`, `/events/hsr`.
- Workflow semanal (segunda, 12h UTC) e execução manual. A sincronização salva candidatos e chama `import_event_candidates` para criar/atualizar tarefas automaticamente. A primeira carga já foi executada; abrir a aplicação não consulta a API externa.
- Aprovação manual continua usando `approve_event_candidate`. A automação usa `sync_event_candidate`, que bloqueia candidato e tarefa, valida jogo/fonte, preserva conclusão e respeita `tasks.event_deadline_manual`. Triggers marcam correções manuais; a ação **Usar prazo da API** força restauração. Eventos importados usam **Ignorar** na lista; `ignore_imported_task` marca o candidato e remove a tarefa na mesma transação.
- Limpeza automática de eventos importados vencidos existe apenas para HSR (`cleanup_expired_hsr_events`).
- Migrações anteriores foram aplicadas no Supabase compartilhado: `2026-09-29-genshin-events.sql`, `2026-09-30-event-cover.sql`, `2026-10-01-task-cover.sql`, `2026-10-02-hsr-events.sql`. Não reaplicar às cegas; conferir o estado real antes de uma nova migração.
- Backup confirmado anteriormente por Cristian: `games_duplicate` 5/5 e `tasks_duplicate` 15/15. Esses números são históricos, não uma contagem atual.
- A migração `db/migrations/2026-10-02-auto-events.sql` foi autorizada especificamente por Cristian e aplicada no SQL Editor. A revisão automática inicialmente bloqueou os novos grants para `anon`; a autorização foi solicitada e recebida antes de repetir a execução. Funções usam `security invoker` e as policies existentes.
- A carga real criou 6 eventos Genshin e 15 HSR: **16 → 37 tarefas**, mantendo as 16 anteriores. Uma segunda importação preservou IDs e quantidade; há 22 candidatos vinculados, 1 ignorado e 0 pendências ativas. Essas contagens são o snapshot de 02/10/2026, não garantias para a próxima consulta.
- Passaram 31 testes JavaScript (12 Jest + 19 Node) e `tests/autoEvents.sql` com rollback: criação sem capa/início, repetição, conclusão, atualização de API, proteção/restauração de prazo manual, ausência de fim, ignorar e isolamento por jogo. Validação de interface confirmou filtro HSR (20 atividades, incluindo manuais/weeklies), Genshin (9) e revisão vazia.
- Snapshot local anterior à carga: `C:\Users\crist\AppData\Local\Temp\gachamanagement-before-auto-events-2026-10-02.json`. Não contém credenciais. Não publicar esse snapshot no repositório.
- O erro local `EADDRINUSE` na porta 5500 veio de um http-server antigo iniciado pelo agente neste worktree (PID 22076). O processo foi identificado pelo comando completo e encerrado; a porta ficou livre. Cristian pode executar `npm start` novamente. `Stop-Process` falhou neste ambiente; `taskkill.exe /PID 22076 /F` encerrou o processo confirmado.

## Arquivos principais e fluxo atual

1. `js/events/eventGames.js`: registro das integrações, hoje apenas Genshin (`ys`/`GI`) e HSR (`sr`/`HSR`).
2. `js/events/starRailAssistant.js`: normalização, nome como chave e conversão das datas sem fuso. Interpreta a fonte como UTC+8; fim `03:59:59` em intervalo válido é proposto como horário América UTC−5; demais fins válidos usam o instante original da Ásia. Não tratar idioma como servidor.
3. `scripts/eventSync.js`: consulta API, resolve jogo por abreviação, reconcilia e salva candidatos, depois importa tarefas via RPC. PATCH de candidato existente não sobrescreve `status`, para preservar decisões concorrentes da interface. A identidade ainda é baseada no nome normalizado.
4. `scripts/syncEvents.js`: orquestra todos os jogos habilitados ou `--game=genshin`/`--game=hsr`, com `--dry-run`.
5. `.github/workflows/sync-genshin-events.yml`: workflow compartilhado, apesar do nome histórico.
6. `js/database/eventCandidateDB.js`: consultas, aprovação/ignorar, restauração de prazo e limpeza HSR; `db/migrations/2026-10-02-auto-events.sql`: novo contrato SQL. `db/schema.sql` inclui a mesma estrutura para bases novas.
7. `js/database/taskDB.js`: gravação e seed; `js/database/mappers/taskMapper.js`: datas/capas; `js/data/Task.js`: definições iniciais.
8. `js/ui/taskUI.js`: filtro por jogo usando registros carregados, mantendo a seleção ao atualizar a lista; indicação de prazo manual e ações de ignorar/restaurar. A edição preserva segundos e mantém jogo/recorrência do evento importado.
9. `js/data/Game.js` e população de jogos: adicionar um jogo ao seed não o cadastra em uma base já preenchida.

`populateInitialTasks` hoje só roda se a tabela inteira estiver vazia. As weeklies têm IDs fixos de jogo e datas de 2025. Evoluir para definições por abreviação, próximo reset atual e criação de lote sem duplicação. Não recriar a cada abertura atividades que o usuário removeu.

## Principal ponto ainda não resolvido: associação entre idiomas

- Contrato público: https://starrailassistant.top/reference/public-api/ . Cada atividade tem nome, descrição, início, fim e capa opcional; não fornece ID por evento.
- EN e CN usam fontes diferentes, conforme resposta do mantenedor na issue 235. Não presumir mesmo conteúdo ou mesma ordem.
- Consulta real de Genshin em 02/10 retornou oito atividades em cada idioma. Nomes diferem; quase todas as capas diferem. Três atividades distintas compartilham exatamente o intervalo `2026-09-23T11:00:00` → `2026-11-03T14:59:59`.
- Logo, datas, capas e posição não fornecem uma associação universal. Validar uma estratégia por jogo, com aliases explícitos quando necessário, e persistir a identidade. Não fazer correspondência ambígua automaticamente.
- Fallback do calendário inteiro quando EN falha não resolve sozinho um evento EN sem fim dentro de uma lista parcialmente preenchida. Essa diferença precisa ser coberta no plano de implementação.
- A chave atual por nome também não distingue bem edições futuras com o mesmo título. Preservar vínculos já existentes ao evoluí-la; separar identidade do modo, da edição e do idioma.
- Falha de rede/JSON não significa evento sem prazo. Preservar tarefas existentes e registrar o erro; não excluir porque a API temporariamente omitiu um registro.

## Sequência sugerida para retomar

1. Conferir branch/remoto/alterações locais e o estado da liberação da 1.2, sem perder os documentos. `3ddc54d` já foi incorporado; não repetir essa etapa sem necessidade.
2. Examinar o contrato da automação já entregue e seus testes; preservar a proteção de prazo manual e decisões de ignorar.
3. Resolver associação entre idiomas/identidade de edição e implementar o fallback chinês; depois expandir para WuWa/ZZZ/NTE e generalizar a limpeza de importados vencidos.
4. Corrigir a população de weeklies. Lotes por jogo, IDs estáveis e vencimentos atuais ainda não foram implementados.
5. Avaliar **Recém-adicionado** e paginação conforme os itens 11–12 do TODO. Atualmente o filtro é local; todas as tarefas são consultadas de uma vez.

Não é necessário pedir novamente autorização sobre as decisões já confirmadas. Explicar as escolhas novas relevantes e manter as mudanças pequenas. A tela inicial, perfis, catálogo completo e seleção persistida ficam para depois.

## Comandos úteis

```powershell
cd D:\Repo\GachaManagement\.claude\worktrees\mobile-database-refactor-b9a209
npm start
# http://localhost:5500
npm test -- --runInBand
node --test tests/*.test.mjs
node scripts/syncEvents.js --game=genshin --dry-run
node scripts/syncEvents.js --game=hsr --dry-run
```

Sem `--dry-run`, a sincronização grava no Supabase. Não usá-la como simples consulta. Após novas mudanças, validar também o comportamento da tarefa realmente salva, não só o candidato.

## Colaboração e entrega

- Conversar em português e seguir a skill `dev-collaboration` e as instruções globais de Cristian. Projeto pessoal: explicar decisões com exemplos concretos sem introduzir camadas/framework por preferência.
- Finalizar respostas com TL;DR: o que foi feito e próximo passo. Se houver pergunta necessária, incluir a resposta recomendada e o motivo.
- Antes de commit/merge, ler `CHANGELOG.md`, avaliar a versão e perguntar se deseja atualizá-la, salvo autorização explícita já dada para a mesma entrega. Versão atual 1.2.0; aprovação da versão da entrega HSR anterior não autoriza automaticamente o próximo incremento. Manter changelog, manifests e versão da interface consistentes.
- O recorte GI/HSR e filtro estão prontos; associação entre idiomas, outros jogos, lotes de weeklies, tag e paginação continuam pendentes. Não apresentar o MVP completo como entregue.
