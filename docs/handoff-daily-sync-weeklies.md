# Handoff: sincronização diária e criação inicial das weeklies

Estado registrado em 04/10/2026, repositório `D:/Repo/GachaManagement-cloud`, branch `main`. Revalidar Git e arquivos ao retomar; este documento registra contexto, não concede autorização adicional.

## Pedido real e limites

Cristian quer concluir em outro chat:

1. Sincronização diária após os resets, **todos os dias às 07h30 de Brasília**.
2. Corrigir a criação inicial das weeklies conforme TODO 9: resolver jogo pela sigla, usar o próximo reset semanal, permitir lotes por jogo em banco já povoado e não duplicar nem recriar tarefas removidas.

Neste chat, ajustamos a sincronização diária, documentamos a continuação e reordenamos as prioridades. Não implementar weeklies aqui. Cristian autorizou commit e push das alterações atuais nesta entrega. **Essa autorização não se estende ao trabalho do próximo chat: não fazer commit nem push antes de Cristian testar e validar as novas alterações. Somente após essa validação pode fazer commit; push depende de pedido explícito.** Não criar outra branch, resetar dados ou tratar este arquivo como autorização adicional.

Ler primeiro [project-conventions.md](project-conventions.md), as instruções AGENTS aplicáveis e a skill dev-collaboration. A tier list restante está em [roadmap-priorities.md](roadmap-priorities.md); os dois itens desta entrega foram retirados dela, sem serem apagados do TODO.

## Estado de Git e versão

- `edbf0c2 fix: improve loading and operation feedback`: commit da **1.4.1**, com carregamento compartilhado, feedback, recuperação de erros e proteção de envio duplicado; Cristian testou e aprovou essa entrega.
- `72c9b29 feat: integrate WuWa and NTE events`, versão **1.4.0**, é a base publicada anterior.
- Publicação autorizada nesta etapa: commit de feedback acima e alterações de cron/documentação em `.github/workflows/sync-genshin-events.yml`, `CHANGELOG.md`, `README.md`, `TODO.md`, `docs/event-integrations.md`, `docs/nte-validation.md`, `docs/project-conventions.md`, este handoff e a tier list.
- Ao retomar, conferir `git status --short`, `git log -3 --oneline` e o workflow da `origin/main`; não presumir que essas mudanças continuam sem commit nem refazê-las.
- O cron diário passa a valer quando a alteração chegar à branch padrão. No próximo chat, verificar a publicação existente antes de propor qualquer mudança de agendamento.
- Não incrementar versão por commit. Agendamento está registrado na entrega 1.4.1; ao definir o escopo final das weeklies, consultar o changelog e Cristian antes do commit, salvo autorização explícita nova para a mesma entrega. Manter manifests, README e badge consistentes.

## 1. Agendamento diário: implementação pronta

Arquivo: [sync-genshin-events.yml](../.github/workflows/sync-genshin-events.yml).

- Cron antigo: `0 12 * * 1` — segunda-feira, 12h UTC / 09h Brasília.
- Cron novo: `30 10 * * *` — diariamente, 10h30 UTC / 07h30 Brasília. Há comentário explicando a conversão.
- Executor `ubuntu-latest` hospedado pelo GitHub; o PC pode estar desligado e o site fechado.
- Preservados `workflow_dispatch`, grupo de concorrência `game-events-sync`, Node 20, `npm ci`, **`npm test` antes da escrita** e `node scripts/syncEvents.js` para os cinco jogos.
- WuWa América: UTC−5, reset diário 04h servidor = 06h Brasília. NTE América: UTC−5, reset diário 05h servidor = 07h Brasília. 07h30 foi escolhido para executar depois dos dois. Não inferir por isso o dia do reset semanal.
- A rotina importa/corrige calendários no Supabase; não é o reset das tarefas recorrentes. A fonte pode publicar novidades em outros horários; GitHub Actions também pode atrasar execuções.

**Verificado:** YAML carregado com `js-yaml`, cron diário, conversão com `Intl` para `America/Sao_Paulo`, runner hospedado e ordem testes → sincronização; `git diff --check` passou. Não disparar uma importação real só para testar o cron. Após publicação autorizada, conferir a versão do workflow no GitHub e a execução agendada ou manual.

## 2. Weeklies: fluxo atual e causa confirmada

| Arquivo | Papel atual |
| --- | --- |
| `js/index.js` | Boot chama `initializeDatabase()` antes de renderizar a primeira rota. |
| `js/database/dbInit.js` | Ordem: `populateInitialGames()` → `populateInitialTasks()` → limpeza HSR → renovação de recorrentes vencidas. |
| `js/data/Task.js` | Classe `Task` e `allTasks`; seis weeklies ativas com `new Date(2025, 2, 17, 6)` e IDs fixos. Outros eventos antigos estão comentados. |
| `js/database/taskDB.js` | `populateInitialTasks()` verifica `hasAnyTask()` na tabela inteira e insere uma a uma; qualquer tarefa existente bloqueia todos os lotes. Erros propagam, não viram tabela vazia. |
| `js/database/gameDB.js` | Contrato público `fetchAllGames()` para obter siglas/IDs atuais. Seed JS de jogos também só roda quando a tabela inteira está vazia. |
| `js/data/Game.js`, `db/seed.sql` | Definições de jogos. O seed SQL já insere jogos ausentes por sigla; não confundir isso com o seed JS. |
| `js/database/mappers/taskMapper.js` | Contrato camelCase ↔ SQL, incluindo `repeatDays`, `coverUrl` e prazo. |
| `js/enums/RefreshTypeEnum.js` | Weekly legado ID 2 / 7 dias; IDs existentes preservados. Presets modernos não alteram intervalos legados. |
| `js/utils/dateUtils.js` | `getNextRecurringDeadline(previousDate, days, now)` é usado na renovação existente. Examinar antes de criar cálculo específico do primeiro reset. |
| `db/schema.sql` | Tabelas, triggers e constraints atuais; ainda não há identidade persistida de lote semanal ou decisão de não recriá-lo. |

Definições ativas atuais: **HSR**: Echo of War, Simulated Universe; **WuWa**: Illusive Realm, Weekly Boss; **ZZZ**: Hollow Zero, Notorious Hunt. IDs fixos atuais 2, 3, 4, respectivamente. Essa lista é evidência do código antigo, **não validação de que todas continuam semanais nas edições atuais**. Conferir o catálogo e os resets no Game8; não inventar weeklies para GI/NTE nem converter modos de evento em recorrentes sem validação.

`updateExpiratedTasksRoutine()` reabre recorrentes vencidas, avança até o próximo ciclo e preserva eventos (`refreshType = 0`). Ela roda na inicialização do aplicativo, não no workflow de importação. A limpeza automática existente é restrita a eventos importados HSR; deve continuar sem atingir weeklies/manuais.

## Implementação recomendada e decisões pendentes

1. Separar definições de weeklies dos objetos com datas/IDs fixos, mantendo a classe `Task` e contratos públicos necessários.
2. Buscar jogos uma vez por operação e resolver pelas siglas reais. Se o jogo não existir ou houver sigla ambígua, não associar por posição/ID presumido; tratar isso explicitamente.
3. Validar dia/hora do reset semanal por jogo no Game8. Documentar fonte e fuso fixo do servidor; usar relógio injetável e instantes UTC, sem depender do fuso do computador. Definir comportamento exatamente no reset.
4. Oferecer operação de lote por jogo que funcione com outras tarefas presentes. Definir integração mínima com o boot sem antecipar a tela de perfis/seleção de jogos.
5. Persistir identidade estável da definição e decisão/estado do lote. Apenas procurar nome + jogo evita algumas duplicatas, mas **não impede recriação após exclusão**. Proposta: registro persistido por lote/jogo e identidade das definições; escolher modelo mínimo depois de revisar exclusão e recuperação de falhas. Não é um contrato já implementado.
6. Garantir que falha parcial e dois navegadores concorrentes não gerem duplicatas nem marquem um lote incompleto como concluído. Considerar operação transacional com constraints no banco; testar o contrato escolhido.
7. Preservar tarefas atuais, conclusão, imagens, prazos manuais e vínculos dos eventos. Não usar `clearDatabase()` nem excluir/recriar todas as tarefas. Associação dos registros antigos exige critério explícito; homônimos não provam origem de seed.

Ainda pendentes: catálogo semanal vigente, reset semanal por jogo, regra de adoção dos registros legados e UX para criar/recriar um lote explicitamente. Propor decisões concretas; perguntar a Cristian quando alterarem comportamento percebido. Preferência de não recriar tarefas removidas já consta no TODO.

## Estrutura, testes e validação

- Projeto pessoal em módulos ES, HTML/CSS/JS, Supabase/PostgreSQL; sem framework. `js/events/eventGames.js` centraliza integrações e `scripts/eventSync.js` usa funções SQL públicas. Não duplicar o importador no frontend.
- Qualquer alteração SQL: atualizar **schema novo + migração incremental + lista em `tests/helpers/testDatabase.mjs`**; preservar grants/RLS e conferir banco existente antes da aplicação real.
- `npm test`: Jest, Node, DOM real com cliente simulado e PostgreSQL PGlite descartável. Fixtures congeladas em `tests/fixtures/`, relógio fixo e expectativas independentes. Não consultar APIs/banco real nesses testes.
- Referências: `tests/taskRenewal.test.js` (renovação/Custom/legados/eventos), `tests/taskRepeatDays.sql`, `tests/uiFeedback.test.mjs` (consulta falha não semeia), `tests/uiIntegration.test.mjs`, `tests/helpers/domHarness.mjs`, `tests/helpers/testDatabase.mjs`.
- CI `.github/workflows/tests.yml`: Node 20, Windows/Linux, `npm ci` + `npm test` em push na main/PR/execução manual. A suíte da entrega 1.4.1 passou com **233 testes**; isso não valida uma implementação futura de weeklies.

Casos que os novos testes devem proteger:

- IDs de jogos fora da ordem antiga; banco vazio e banco com tarefas de outro jogo; jogo ausente/ambíguo.
- Primeiro lote e repetição sem duplicatas; exclusão seguida de boot não recria; recriação explícita, se oferecida, respeita a decisão.
- Instantes antes/no/depois do reset; vários ciclos perdidos; conversão independente do fuso local.
- Falha de leitura sem escrita; falha parcial recuperável; repetição/concorrência pelo contrato SQL escolhido.
- Registro semanal existente sem perder conclusão, capa ou data manual; eventos e Custom/legados preservados; limpeza HSR não remove weekly.
- Instalação nova e upgrade completo com dados anteriores; rollback dos testes SQL e permissões reais no destino quando relevante.

Comandos para retomar: `git status --short`, `git diff`, `npm test`, `npm start` (porta 5500). Se o servidor já estiver rodando, conferir pasta/porta antes de abrir outro. Não disparar `node scripts/syncEvents.js` sem necessidade: esse comando grava no banco real; `--dry-run` apenas consulta as fontes e o destino.

## Preferências que devem continuar

- Mesma tarefa compartilha `tasks.cover_url` entre usuários; placeholder se URL ausente/indisponível. Não tornar imagem local por perfil inadvertidamente.
- Feedback/loading de 1.4.1 preserva drafts/estado em falhas; não reintroduzir consultas que engolem erros ou envios duplicados.
- Ao encerrar respostas com fluxo de trabalho, usar Workflow → TL;DR → pergunta de próximo passo e recomendação. Não tratar a recomendação como aprovação do usuário.
- Próximo chat deve começar conferindo Git e publicação do cron pronto, e atacar o seed das weeklies. Perfis e demais tiers ficam para depois desta entrega.

## Prompt para o próximo chat

Leia `docs/handoff-daily-sync-weeklies.md` e `docs/project-conventions.md`. Confira o estado do repositório e verifique a sincronização diária às 07h30 de Brasília, que já foi implementada nesta entrega; não refaça o que estiver pronto. Em seguida, implemente a correção da criação inicial das weeklies conforme o handoff e o TODO 9, preservando tarefas existentes, recorrência, imagens e decisões do usuário. Execute os testes necessários e entregue as alterações junto dos comandos e cenários para eu testar localmente. **Não faça commit nem push antes de eu testar e validar as alterações. Somente depois de eu confirmar essa validação você pode fazer commit. Não faça push sem meu pedido explícito.**
