# Etapa 3 — Personalização do Lote e capas

Implementação local em 09/10/2026 sobre `223ca98` (1.10.0). Fechamento em 1.11.0 autorizado por Cristian após validar a prévia em 09/10/2026. Manifests, README, badge e changelog atualizados. Sem push, aplicação no Supabase ou reset do live. Pedido e decisões anteriores: [handoff](handoff-task-batch-personalization.md), [inventário](task-batch-plan.md), TODO 9.1.

## Recortes e decisões para revisão

1. **SQL/decisões:** leitura elegível por perfil e operação por definição/fase, com uma transação e lock por perfil. Os marcadores antigos continuam protegendo ausência/renomeação; uma escolha parcial só fecha um grupo antigo quando todas as suas definições tiverem sido processadas.
2. **Modal:** `Escolher itens…` ao lado de `Carregar Lote`, grupos por jogos habilitados, checkboxes, selecionar todos, resumo e carregar escolhidos. Todos os elegíveis começam marcados, inclusive os adiados. Desmarcar adia ao confirmar; abrir/cancelar não grava. Seleção vazia grava adiamentos, sem criar/excluir tarefas. O filtro visual não limita o modal nem a carga completa.
3. **Capas:** oito referências reais HTTPS, sete Game8 e Beyond the Rails no GameWith. Defaults somente ao criar uma nova definição compartilhada. Não há backfill: capas antigas vazias podem representar remoção explícita. Homônimos, templates já existentes e capas personalizadas não recebem update.

Mantidos: 14 definições, reservas HSR inativas, calendário automático sem formulário e Endstate 3.7 sem repetição/sem próxima fase presumida. Capas e catálogo continuam compartilhados; progresso e decisões continuam pessoais.

## Contratos públicos

- `task_batch_catalogue()` continua sem perfil e com 14 definições. Catálogo/calendários anteriores não foram alterados.
- `list_profile_task_batch(p_profile_id, p_now default now())`: leitura sem gravação, somente jogos habilitados; inclui identidade, descrição do jogo, default visual e estado. Rejeita perfil/relógio inválidos e siglas habilitadas ambíguas.
- `choose_profile_task_batch(p_profile_id, p_items jsonb, p_now default now())`: seleção explícita de objetos `{abbreviation, definition_key, calendar_key}`. `null` é rejeitado; `[]` adia todos os elegíveis. Rejeita formato, identidade desconhecida, jogo desabilitado, chave repetida e fase desconhecida antes de escrever. Fase conhecida que já venceu não é criada/registrada; retorna calendário pendente.
- `create_profile_task_batch(p_profile_id, p_nte_deadline default null, p_now default now())`: mantém assinatura e resposta anterior; processa tudo elegível, incluindo adiados. Produção envia só o perfil.
- `create_profile_weekly_batch`, `create_profile_endgame_batch` e `create_profile_extra_challenges` continuam com suas assinaturas e passam pelo mesmo processamento. A entrada weekly verifica as definições do catálogo padrão completo; os clientes existentes já usam esse catálogo. Boot automático não completa uma seleção parcial nem adiamentos pessoais; carga explícita ainda pode completá-los.
- `apply_profile_task_batch` é o processamento SQL comum, com seleção/escopo para as entradas legadas. A interface não chama esse helper nem escreve tabelas diretamente.
- `task_batch_cover_catalogue()`: associação por sigla/chave com URL da capa, página de origem, rótulo original e data de consulta. [Manifesto de origem](task-batch-covers.json) reproduz os dados e tem paridade testada.

`registered` na carga completa mantém sua unidade histórica (marcadores por grupo + os cinco modos novos); na nova operação de escolha conta definições processadas. Nenhuma UI trata essa contagem como quantidade de tarefas. `created` e `preserved` continuam contando tarefas/definições preservadas; `deferred` informa calendário pendente, não a quantidade de checkboxes desmarcados.

## Estados e preservação

A nova tabela `profile_task_batch_decisions` tem PK por perfil/sigla/definição/fase, status `deferred|created|preserved` e vínculo opcional `task_id`. Não altera nem preenche os marcadores antigos durante a migração.

| Estado lido | Significado e efeito |
| --- | --- |
| `never` | Nunca escolhido, sem registro ou proteção histórica. Elegível. |
| `deferred` | Desmarcado numa confirmação. Continua elegível. |
| `created` | Criado pela operação, com tarefa pessoal ainda ativa. Protegido. |
| `preserved` | Homônimo preservado integralmente, sem atribuir origem seed. Protegido. |
| `excluded` | Item processado cujo vínculo foi removido ou tarefa pessoal foi excluída. Não recriar. |
| `legacy` | Marcador antigo impede nova criação; não há prova suficiente para distinguir exclusão/renomeação. Mostrar proteção histórica. |
| `unavailable` | Fase Endstate conhecida já venceu e não foi processada. Sem nova data/recorrência. |

O vínculo mantém proteção após renomear. Marcadores e decisões sobrevivem à exclusão de tarefa/jogo; reset explícito limpa a nova tabela junto das anteriores. Tarefas compartilhadas reutilizadas não recebem atualização incidental de capa/prazo/recorrência. Homônimos privados ou de evento conservam todos os campos. Tombstones pessoais também impedem reinserção se metadados antigos forem incompletos.

## Migrações e arquivos

Banco existente já atualizado até 1.10.0: novas migrações, nesta ordem, **ainda não aplicadas ao live**:

1. `db/migrations/2026-10-09-task-batch-selection.sql`
2. `db/migrations/2026-10-09-task-batch-covers.sql`

Instalação nova usa `db/schema.sql` + `db/seed.sql`. Ambas estão reproduzidas no schema e na ordem de `tests/helpers/testDatabase.mjs`. Não reaplicar schema inteiro em banco existente nem migrações antigas depois destas. Aplicar SQL não importa tarefas nem altera capas existentes.

Interface: `index.html`, `css/styles.css`, `js/ui/taskBatchPicker.js`, `js/ui/taskUI.js`. Contratos do frontend: `js/database/taskDB.js`, via `profileRpc`. Prévia: `scripts/previewProfiles.js` acrescenta whitelist e serialização JSON de `p_items`. Testes novos: `tests/taskBatchSelection.test.mjs` e `tests/taskBatchPickerUI.test.mjs`; harness simula somente as APIs nativas de dialog ausentes no jsdom. Teste histórico da expansão agora corta a sequência na migração anterior, em vez de excluir uma migração e incluir posteriores fora de ordem.

## Fontes das imagens e limites

[Game8: Theater](https://game8.co/games/Genshin-Impact/archives/401979), [Abyss](https://game8.co/games/Genshin-Impact/archives/304937), [Deadly](https://game8.co/games/Zenless-Zone-Zero/archives/489103), [Shiyu](https://game8.co/games/Zenless-Zone-Zero/archives/460702), [Tower](https://game8.co/games/Wuthering-Waves/archives/453474), [Whimpering](https://game8.co/games/Wuthering-Waves/archives/498614), [Endstate](https://game8.co/games/Wuthering-Waves/archives/572518); [GameWith: Beyond](https://gamewith.net/nte/74216).

As páginas e os oito arquivos responderam HTTP 200 com tipo image/png em consulta pública direta; as oito imagens foram inspecionadas visualmente. São screenshots/capas editoriais dos guias, sem arte gerada por IA. Endstate usa a imagem específica do modo, em vez de uma composição sazonal de bosses. Os resultados indexados podem descrever temporadas antigas: **esta consulta foi visual, não uma nova validação de calendário**.

Não foi identificada licença aberta de redistribuição; não há assets externos versionados ou alegação de autoria/licença própria. O produto referencia URLs remotas como as capas atuais. Direitos permanecem com desenvolvedoras/sites de origem. Disponibilidade/hotlink desses hosts pode mudar; a imagem usa lazy loading, no-referrer e placeholder no erro. As cópias usadas para inspeção ficaram em TEMP, fora da entrega.

## Validação executada

Etapa 1 offline, SQL real como anon em PGlite, instalação nova/upgrade, relógio fixo, DOM real com cliente estrito simulado:

```powershell
node --test tests/taskBatchSelection.test.mjs tests/taskBatchPickerUI.test.mjs tests/taskBatch.test.mjs tests/expandedTaskBatch.test.mjs tests/taskBatchUI.test.mjs tests/endgameBatches.test.mjs tests/endgameBatchesUI.test.mjs tests/endgameRecurrence.test.mjs tests/weeklyBatches.test.mjs tests/weeklyBatchesUI.test.mjs tests/profileUI.test.mjs tests/uiFeedback.test.mjs
```

**211 testes passaram** nessa regressão. Depois dos ajustes de foco e do cenário de renderização dos oito defaults, `taskBatchPickerUI`, `profiles` e `uiIntegration` passaram **43 testes**. Após conservar `deferred: 0` no retorno legado de extras e conferir paridade schema/migrações/manifesto, a execução final de `taskBatchSelection` + `taskBatchPickerUI` passou **44 testes**. São execuções com sobreposição; não somar. Etapa 2 no fechamento MINOR 1.11.0: `npm test` passou **531 testes (69 Jest + 462 Node)**, sem falhas.

Proteções: uma weekly/endgame não fecha o grupo; seleção vazia; adiamento; excluir/renomear; homônimos e campos pessoais; história 1.10.0 sem backfill; isolamentos; chaves/atores/relógios inválidos; rollback de tarefas e adiamentos numa falha tardia; fase vencida; capas customizadas/null compartilhadas; double submit; retry; cancelamento; foco inicial/devolução; perfil trocado antes/durante leitura/escrita; gravação bem-sucedida com refresh falho; renderização/lazy/error fallback de oito capas.

Prévia HTTP real, somente perfil **Convidado**: 14 ofertas; seleção Echo of War + Spiral Abyss criou **2**, outras **12** adiadas; carga completa posterior criou **12**; repetição criou **0**; lista final com **14** tarefas e **8** capas. CRAN e Demo ficaram vazios. Nova RPC também foi verificada pelo transporte HTTP, incluindo serialização JSON.

Cristian confirmou que a prévia funciona em 09/10/2026. A inspeção visual automatizada não foi possível; não atribuir à confirmação manual uma execução de cada cenário de teclado/CSS. O controlador de navegador falhou duas vezes ao inicializar o sandbox (`helper_unknown_error`); o DOM simulado não substitui essa verificação. PostgREST/Supabase live e concorrência entre conexões reais permanecem não validados. Capas antigas sem imagem permanecem assim deliberadamente; preencher exige uma decisão própria para não anular remoções explícitas.

## Para testar

Abra [a prévia descartável](http://127.0.0.1:5501/tasks). Ela foi iniciada nesta sessão; se não estiver disponível, execute `npm run preview:profiles` e abra a mesma URL. Os dados desaparecem ao encerrar o servidor. Evite `npm start` para este teste, pois usa a configuração normal.

1. Selecione **CRAN** ou **Demo**, habilite os cinco jogos e desmarque a criação opcional de weeklies. Em Tasks, filtre visualmente um jogo e abra **Escolher itens…**: devem aparecer os grupos dos cinco jogos, sem pedir datas.
2. Desmarque **Selecionar todos**, marque só **Echo of War** e **Spiral Abyss** e carregue escolhidos. Devem surgir somente essas duas tarefas. Reabra: as demais mostram **Adiado** e continuam selecionáveis; as já processadas ficam protegidas.
3. Cancele e reabra, teste Tab/Shift+Tab e Escape. O foco deve permanecer no modal aberto e voltar a **Escolher itens…** ao fechar. Abrir/cancelar/Escape não criam nem excluem.
4. No modal, desmarque todos e confirme: nenhuma tarefa desaparece nem se cria; o resumo informa adiamento. **Carregar Lote** depois cria todo o restante elegível, totalizando 14 no perfil inicialmente limpo. Repetir não duplica.
5. Exclua um item processado e renomeie/favorite/conclua outro; recarregue a página e carregue de novo. Exclusão não volta; nome e estado pessoal permanecem. No modal, o excluído continua protegido.
6. Confira os oito endgames com capas. Edite uma capa ou remova-a, salve, recarregue e repita o lote: a escolha permanece. Troque de perfil para conferir isolamento de progresso/decisões; capas são compartilhadas pelo modelo existente.
7. Reduza a largura da janela e confira rolagem do modal, labels e botões. Uma capa indisponível deve mostrar placeholder, sem impedir a tarefa/carga.

**Workflow:** recortes SQL, modal e imagens implementados e testados; Cristian validou a prévia e autorizou commit/1.11.0. Push e aplicação das migrações seguem dependentes de autorização própria.
