# Handoff — Gacha Management 1.10.0 → etapa 3 do Lote

Data: 08/10/2026, Brasília. Destinatária: próxima IA Sol 6.1, trabalhando com Cristian. Este documento registra fatos, decisões e uma proposta para a próxima entrega; propostas não são contratos já implementados.

## Pedido e colaboração

Cristian pediu encerrar a entrega atual com commit, push e numeração a critério da IA, e preparar a continuidade:
1. **Etapa 3 — Personalização:** botão **Escolher itens…**, modal com checkboxes agrupados por jogo.
2. **Imagens para cada endgame.**

A IA desta conversa continuará disponível como revisora/“mestra”. Cristian vai trazer planos, diffs e resultados da nova IA para revisão aqui. Não há delegação automática, thread criada, mensagem enviada a outra IA ou autorização para usar outra conversa como comando. Trabalhe nesta próxima sessão com Cristian e entregue evidências que ele possa compartilhar.

Leia primeiro:
- `AGENTS.md`
- `docs/project-conventions.md`
- Este handoff
- `docs/task-batch-plan.md` — **inventário central**, decisões, teste e migrações
- `docs/expanded-task-batch.md` — fontes/horários/limites dos cinco novos desafios
- `docs/endgame-batch.md`, `docs/weekly-batches.md` — contratos anteriores
- `docs/roadmap-priorities.md` e TODO 9.1

Projeto pessoal: JavaScript ES modules, HTML/CSS, sem framework. Cristian domina backend/lógica; explique escolhas de frontend quando ajudarem, sem aula básica. Faça mudanças pequenas e revise o fluxo real antes de propor abstrações. Português na conversa/documentação; inglês em novos identificadores, testes e comentários técnicos.

Dê atualizações durante trabalho prolongado. Antes do fechamento Workflow, inclua **Para testar** com passos da interface e resultado esperado. Use testes focados durante desenvolvimento; suíte completa somente ao fechar MAJOR/MINOR ou por pedido explícito, sem repetir tudo após mudanças só documentais.

**Git:** branch estabelecida `main`, remoto `origin` = https://github.com/cristianworth/GachaManagement-cloud.git. Não criar branch por conveniência. A autorização de commit/push desta sessão fecha **1.10.0**, não autoriza commits/push das mudanças futuras da etapa 3. Prepare a próxima entrega para Cristian testar e autorizar. Leia regras do changelog antes de fechar versão e mantenha package.json, package-lock.json, README e badge index.html consistentes.

## Base do sistema

- Versão de fechamento: **1.10.0**. O commit intermediário anterior foi `7bcb411`, ainda 1.9.2; o fechamento 1.10.0 consolida os trabalhos seguintes. Consulte `git log` para o hash final, sem presumir que o hash intermediário é o release.
- Frontend estático; GitHub Pages é a publicação do site. Push concluído não comprova implantação do Pages nem aplicação de SQL.
- Supabase/PostgreSQL: jogos/catálogo/capas compartilhados; progresso, recorrência, resina, anotações e decisões por perfil.
- Perfis fixos públicos: `cran` (CRAN), `demo` (Demo), `guest` (Convidado). **Sem autenticação ou convites.** A seleção no navegador não é segurança. Login futuro exige ator autenticado/RLS próprios.
- Seleção de jogos por perfil já controla Games, Tasks, dropdowns e revisão. Não reimplementar.
- Perfil ativo fica estável por página: outra aba não troca o ator da página atual. `profileRpc` captura o ator antes do await.
- Resina estimada, botão central **Atualizar dados**, favoritas no topo e correções de ícone NTE/primeiro bullet do To-do já foram entregues. Atualizar dados não sincroniza APIs nem grava rascunhos.
- Integrações ativas: GI, HSR, ZZZ, WuWa, NTE. Registro em `js/events/eventGames.js`; descoberta/reconciliação em `scripts/eventSync.js`; gravações transacionais via SQL.
- Eventos da API têm identidade por edição. Correção de período conserva a mesma edição; ocorrência separada começa sem herdar conclusão/decisão.
- Importados vencidos são excluídos permanentemente por perfil, respeitando prazo manual/recorrência e marcas mínimas contra recriação. Ausência na API apenas inativa candidato, não exclui tarefa.
- Workflow diário **já existe**, `.github/workflows/sync-genshin-events.yml`, `30 10 * * *`: 07h30 Brasília. Executa testes antes do sync dos cinco jogos. **Não refazer nem alterar incidentalmente.**
- CI `.github/workflows/tests.yml` testa Windows/Linux com Node 20 e npm ci/npm test.

## O que 1.10.0 entrega

Etapas 1 e 2 concluídas no código:
- Uma entrada **Carregar Lote**, considerando todos os jogos habilitados no perfil; o filtro visual de Tasks não limita a ação.
- Uma RPC/transação para seis weeklies e oito endgames, **14 definições**.
- Sem diálogo/campo de datas, inclusive na primeira criação do NTE.
- Cinco novos desafios podem ser acrescentados a lotes antigos sem recriar excluídos/renomeados.
- Homônimos exatos no mesmo jogo são preservados integralmente, mesmo Event/Custom. Não presumir origem seed nem converter recorrência.
- Capas, favoritas, conclusão, datas manuais e decisões existentes permanecem.
- Bloqueio de clique repetido, tratamento de erro/retry, ator estável e status de gravação mesmo se o refresh posterior falhar.
- Schema novo, migrações incrementais, reset explícito e prévia descartável atualizados.

Inventário resumido:
| Jogo | Definições do lote | Regra |
| --- | --- | --- |
| HSR | Echo of War; Simulated Universe | 7 dias, segunda 06h BRT; SU semanal por preferência pessoal |
| WuWa | Weekly Boss; Fantasies of the Thousand Gateways | 7 dias, segunda 06h BRT |
| ZZZ | Hollow Zero; Notorious Hunt | 7 dias, segunda 06h BRT |
| GI | Imaginarium Theater; Spiral Abyss | Dia 1º / dia 15, 06h BRT |
| NTE | Beyond the Rails | 14 dias, âncora 21/10/2026 07h BRT |
| ZZZ | Deadly Assault; Shiyu Defense | 14 dias, âncoras 09/10 e 16/10/2026, 06h BRT |
| WuWa | Tower of Adversity; Whimpering Wastes | 28 dias, âncoras 12/10 e 26/10/2026, 06h BRT |
| WuWa | Endstate Matrix | Somente fase 3.7, até 10/11/2026 17h BRT, sem intervalo fixo |

**HSR Pure Fiction, Apocalyptic Shadow e Memory of Chaos não integram o lote ativo:** já chegam pela API, por edição. Reservas documentadas e comentadas, sem fallback automático quando a API falha.

## Decisões explícitas de Cristian — não reabrir

- Importações de API, lote e outras cargas são automáticas. **Não pedir datas na interface** nem por perfil. Dúvidas reais de calendário são esclarecidas durante desenvolvimento, uma vez.
- Datas/contadores observados por Cristian no jogo são evidência válida, identificada como tal. Game8 e anúncios oficiais complementam horários/regras; não invalidam a observação do usuário.
- `xh` eram horas não especificadas do contador, não duração de recorrência. Não somar “dias restantes” ao momento de cada clique.
- NTE: referência 08/10 +13 dias, 05h América UTC−5 → 21/10/2026T10:00Z. Ciclo 14 dias.
- Deadly: houve divergência entre arredondar o contador para sábado e o calendário de sexta. Cristian escolheu **09/10 às 06h BRT**.
- Endstate: Cristian aceitou o fim global derivado da API: 11/11/2026 04h UTC+8 → 10/11/2026T20:00Z /17h BRT. É uma referência derivada aceita, **não confirmação independente da hora da manutenção 3.8**.
- Spiral Abyss: **dia 15 é lembrete antecipado aprovado**, embora o reset oficial seja dia 16.
- SU foi recolocado como weekly a pedido de Cristian; não remover por inferir o calendário oficial de recompensas.
- WuWa lote semanal usa Weekly Boss + Fantasies; Illusive Realm anterior não foi apagado nem convertido.
- Excluir importados vencidos foi preferência explícita; não substituir por arquivamento.
- Cristian declarou o banco live descartável, sem dados importantes, e autorizou reinstalação em escopo anterior. **Isso não significa resetar automaticamente no início de outra sessão.** Confira necessidade e destino; não há motivo para destruir banco para fazer um modal ou acrescentar capas.
- Não restaurar tarefas excluídas só porque não aparecem na lista. Um item desmarcado no futuro modal deve ficar adiado/elegível, sem ser tratado como excluído.

## Fluxo e contratos reais

Caminho de criação:
`index.html loadTaskBatchBtn → js/ui/taskUI.js handleLoadTaskBatch → js/database/taskDB.js loadTaskBatch → profileRpc → create_profile_task_batch`.

Arquivos principais:
- `index.html`, `css/styles.css` — controles/estrutura.
- `js/ui/taskUI.js` — lista, batch, favoritos, edição.
- `js/database/taskDB.js`, `js/database/profileDB.js` — contratos públicos.
- `js/services/profileSession.js` — ator por página.
- `js/data/weeklyTasks.js` — catálogo semanal ainda usado pelo boot/seleção opcional; não apagar.
- `js/database/mappers/taskMapper.js` — DTO camelCase; shared_key endgame identifica renovação UTC.
- `js/enums/RefreshTypeEnum.js`, `js/utils/dateUtils.js`, `js/database/dbInit.js` — recorrência/renovação.
- `js/ui/eventCover.js` — capa/fallback.
- `db/schema.sql` e migrações — fonte do contrato SQL.

RPCs existentes:
- `task_batch_catalogue()`: JSON com abbreviation, definition_key, description, kind, refresh_type, repeat_days, month_day, anchor_at, calendar_key. **Não recebe perfil.** Não chamar por `profileRpc` como está, pois esse helper injeta p_profile_id.
- `create_profile_task_batch(p_profile_id, p_nte_deadline default null, p_now default now())`: retorna status, created, preserved, registered; deferred só quando há fase sem calendário futuro. Frontend envia apenas perfil em produção.
- Wrapper delega a `create_profile_weekly_batch`, `create_profile_endgame_batch`, `create_profile_extra_challenges` dentro da mesma transação/lock por perfil.
- `create_profile_endgame_batch` conserva parâmetro legado de override NTE por compatibilidade, embora UI não o solicite.
- `next_beyond_the_rails_deadline`, `next_anchored_batch_deadline`, `next_monthly_reminder` calculam próximos limites estritamente futuros.
- `list_profile_tasks`, `save_profile_task`, `remove_profile_task`, `complete_profile_task`, `set_profile_task_favorite` continuam públicos.

Marcadores:
- `profile_weekly_batches`: estado por jogo; created fecha as duas weeklies.
- `profile_endgame_batches`: estado por jogo GI/NTE; fecha o conjunto daquele jogo.
- `profile_task_batch_items`: novos cinco modos, PK(profile_id, abbreviation, definition_key, calendar_key), registered_at. **Não tem status nem task_id**; o registro significa que já foi processado, inclusive homônimo preservado.
- Esses marcadores sobrevivem à exclusão pessoal. Reset explícito limpa os três.
- `registered` no wrapper soma marcadores antigos por jogo e novos por definição; **não interpretar como quantidade de tarefas ou de jogos**.

Identidade:
- weeklies: `weekly:ABBR:definition-key`.
- desafios fixos: `endgame:ABBR:definition-key`.
- Endstate atual: `endgame:WuWa:endstate-matrix:3.7`.
- Tarefas compartilhadas reutilizadas não recebem update indiscriminado na importação; cada perfil ganha seu próprio prazo/estado.

Recorrência:
- Tipos 9/10 = dia 1º/dia 15; repeat_days=null, não 30/31 dias.
- NTE/ZZZ = tipo 3,14 dias; Tower/Whimpering = tipo 5,28 dias.
- Monthly legado conserva comportamento antigo.
- Renovação ao abrir/recarregar usa o prazo pessoal salvo como referência e mantém UTC para desafios gerenciados; preserva capas/favoritas e reabre conclusão. Não existe timer contínuo.

## Limites que não devem ser anunciados como resolvidos

- **Futuras fases Endstate ainda não são descobertas automaticamente.** Catálogo contém somente fase 3.7. Após o prazo, primeira carga não cria fase vencida, não registra item e informa calendário pendente. Os outros itens carregam normalmente.
- Endstate já criado permanece com o prazo/conclusão; não renova e não é removido pela limpeza de candidatos API. Não inventar 33/42 dias.
- Uma nova fase exige atualização central/fonte validada e reconciliação com fase anterior/homônimos. O sufixo de fase prepara identidade, não implementa toda essa automação.
- Os endgames do lote ainda usam placeholder, sem catálogo de imagens próprias.
- Modal da etapa 3 ainda não existe.
- Não há testes em navegador real no CI; DOM simulado não valida CSS renderizado.
- Supabase/PostgREST live e concorrência real entre conexões não foram validados nesta entrega.
- Commit/push do código não aplica migração ao banco.

## Banco e execução local

No banco existente atualizado até favoritas, aplicar apenas as migrações que faltam, nesta ordem:
1. `2026-10-08-endgame-batch.sql`
2. `2026-10-08-unified-task-batch.sql`
3. `2026-10-08-expanded-task-batch.sql`

Não reaplicar as anteriores depois das novas: funções antigas podem substituir o contrato final. Instalação nova usa schema.sql + seed.sql. Migrações desta entrega não foram aplicadas ao live; não alegar isso a partir do push.

```powershell
npm ci                         # apenas quando precisar instalar dependências
npm run preview:profiles        # http://127.0.0.1:5501/tasks, SQL descartável
npm run preview:profiles -- --events  # cenários sintéticos de eventos, se necessários
npm start                       # porta 5500, configuração normal/Supabase
npm run db:reset:build           # gera SQL; NÃO aplica no live
```

A prévia cria banco novo ao iniciar, serve o frontend real com cliente substituído, usa RPCs SQL como anon e whitelist em `scripts/previewProfiles.js`. Nova RPC deve entrar na whitelist. Reiniciar depois de mudar schema. Dados temporários desaparecem ao encerrar. A última prévia criou 14 tarefas no Convidado por teste HTTP; CRAN/Demo ficaram livres. Não presumir que esse processo permanece rodando na próxima sessão.

## Validação e evidências

Etapa 1 anterior: **124 testes focados passaram**:
```powershell
node --test tests/taskBatch.test.mjs tests/expandedTaskBatch.test.mjs tests/taskBatchUI.test.mjs tests/endgameBatches.test.mjs tests/endgameBatchesUI.test.mjs tests/endgameRecurrence.test.mjs tests/profileUI.test.mjs tests/uiFeedback.test.mjs
```

Cobrem schema novo/upgrade, migração sobre nove itens já criados, somente cinco novos, homônimos, capas/recorrência/favoritas/conclusão, exclusões, isolamento, reset, rollback tardio em Shiyu/NTE, clocks inválidos, ciclos perdidos, UTC/DST e fase Endstate vencida. Testes SQL usam PGlite real como anon; DOM usa jsdom/cliente estrito simulado. Nenhum teste consulta APIs ou banco live.

Etapa 2 no fechamento MINOR: `npm test` passou **487 testes (69 Jest + 418 Node)**. Resultado final também registrado no changelog. Na primeira execução apareceram duas verificações históricas inadequadas: comparação literal CRLF/LF de schema/migração e exigência de favoritas ser a última migração. Foram corrigidas sem alterar comportamento de produção; o teste de reinstalação também confere as duas novas tabelas de marcadores. Testes isolados dos dois casos passaram antes da nova suíte completa.

Prévia HTTP real confirmou 14 criações, cinco prazos documentados, repetição zero e ausência de diálogo. Não confundir essa evidência com inspeção visual em navegador ou PostgREST real.

## Etapa 3 — proposta de execução em recortes

O resultado esperado já foi pedido. As escolhas abaixo são recomendações para revisar no código, **não uma arquitetura imposta**.

### Primeiro: contrato de seleção e decisões

Não acrescentar apenas checkboxes ao wrapper atual. Se chamar o contrato weekly com uma seleção parcial, ele fechará o jogo inteiro e bloqueará as weeklies desmarcadas. GI/NTE têm o mesmo problema de marcador por jogo.

Proponha uma operação por definição que:
- Preserve `Carregar Lote` como carga de todas as definições elegíveis.
- Receba seleção explícita estável (abbreviation + definition_key + calendar_key); nunca índice da lista ou só título.
- Valide no servidor catálogo, perfil, jogos habilitados, chaves desconhecidas/duplicadas, fase e calendário. Seleção vazia deve ser tratada explicitamente, sem cair em “carregar tudo” por acidente.
- Use uma transação e lock por perfil; não chamar várias gravações sequenciais no frontend.
- Deixe desmarcados elegíveis para depois. Registro de criação/exclusão não pode ser confundido com preferência visual.
- Adote marcadores antigos conservadoramente: jogo já fechado deve continuar protegendo os itens ausentes, mesmo quando não for possível provar se foram excluídos/renomeados. Não deduzir “nunca criado” apenas pela ausência da tarefa.
- Conserve homônimos, tarefas manuais, favoritas, capas, datas e progressos; não reescreva tarefas ao abrir o modal.
- Evite overloads RPC ambíguos no PostgREST e preserve clientes antigos. Considere uma leitura de catálogo elegível por perfil, pois a função atual não recebe perfil nem expõe decisões.
- Evolua schema + migração incremental + ordem de testes juntos. Não edite migração já publicada como único caminho de upgrade.

### Depois: modal e imagens

**Modal:** botão Escolher itens… ao lado de Carregar Lote, grupos por jogo selecionado, checkboxes, selecionar todos e carregar selecionados. Mostrar o que já está criado/preservado/excluído e calendários indisponíveis com clareza. Recomendo todos os elegíveis marcados inicialmente, deixando explícito que desmarcar adia; validar essa escolha no contexto se Cristian preferir outra experiência. Cancelar/abrir não grava. Preservar filtro e perfil, bloquear duplicação, tratar falha/retry. Acessibilidade: foco inicial, navegação por teclado, Escape, nome/labels e devolução do foco ao botão. Não criar outra página nem usar tooltip como formulário.

**Imagens:** buscar referências reais oficiais/Game8 para os **oito endgames ativos** (Theater, Abyss, Beyond, Deadly, Shiyu, Tower, Whimpering, Endstate). HSR reservas não precisam duplicar as capas da API. Registrar origem e associação por chave; não gerar arte com IA ou usar ícone do jogo como se fosse imagem específica sem decisão do usuário. Antes de baixar/versionar assets, verificar origem/licença e a necessidade; preferir fontes HTTPS estáveis compatíveis com o fluxo existente.

Armadilhas verificadas:
- `createEventCover` aceita **somente URL HTTPS**; `img/...` cai no placeholder. Imagem local exige suporte explícito seguro e teste, não só trocar o SQL.
- Capas vivem em `tasks.cover_url` e são compartilhadas. Alterar capa não é uma preferência pessoal por perfil no modelo atual.
- `taskToRow` omitindo coverUrl preserva capa; null remove explicitamente. Não fazer backfill que sobrescreva capa personalizada.
- Default de catálogo e escolha explícita de remover capa podem ser diferentes. Não interpretar todo null existente como autorização para preencher. Recomende primeiro um contrato claro para default/override/remoção, ou limitar preenchimento a novas tarefas sem reescrever as anteriores.
- Renderização já tem placeholder, lazy loading e fallback de erro. Preserve esses mecanismos; uma imagem indisponível não pode bloquear o lote.

### Critérios de aceite para a aprendiz trazer à revisão

1. Carregar Lote continua criando tudo elegível e repetindo sem duplicatas/restauração.
2. Selecionar uma weekly não bloqueia a outra; selecionar um endgame não bloqueia os demais.
3. Desmarcar/cancelar não cria nem exclui. Seleção vazia não importa tudo.
4. Um lote antigo fechado conserva exclusões/renomes; os cinco novos já processados também.
5. Jogos desabilitados e troca de perfil durante requisição não causam escrita no ator errado.
6. Erro no último item desfaz todos os novos itens/decisões; retry funciona.
7. Catálogo HSR reserva continua inativo e Endstate sem calendário fica indisponível sem pedir data.
8. Capas personalizadas permanecem; imagens próprias dos oito endgames aparecem e falhas usam placeholder.
9. Acessibilidade/modal e filtros funcionam na interface, incluindo teclado e fechamento.
10. Entregar diff, decisões de modelo, comandos/cenários executados e limitações. Cristian pode enviar isso para a revisão da IA mestra nesta conversa.

**Para testar a próxima entrega:** usar perfil limpo na prévia, habilitar jogos, abrir Escolher itens…, carregar somente uma weekly e um endgame; conferir que os desmarcados continuam disponíveis depois. Cancelar sem alterações, repetir seleção, excluir um já criado e confirmar que ele não volta. Trocar perfil, conferir imagens, favoritas e persistência após recarregar.

## Ambiente do agente anterior — apenas orientação

Windows/PowerShell. Nesta sessão, exec sem elevação e kernels CUA/node_repl tiveram falha de inicialização; exec com auto-review funcionou. Isso não prova que a próxima sessão terá o mesmo problema. Use ferramentas disponíveis normalmente; não tratar a falha antiga como impedimento permanente.

Prefira `rg` para busca. Para scripts multilinha no PowerShell, here-string literal evita expansão acidental de $ e backticks. Ao substituir SQL com JavaScript, use callback em String.replace: uma replacement string transforma `$$` em `$` e quebra delimitadores SQL. Preserve LF/CRLF conforme Git e normalize só comparações onde necessário. Nunca expor chaves administrativas ou incluir logs locais/credenciais no commit.

Este handoff não exige criar novos agentes/threads. A próxima IA trabalha com Cristian; a revisão nesta conversa será feita sobre o contexto que ele trouxer.
