# Recriação de itens pela seleção do Lote

Base: commit `868408a`, versão 1.11.0. Entrega 1.12.0: commit, changelog e push autorizados por Cristian em 09/10/2026; **SQL incremental aplicado por Cristian em 09/10/2026**, após autorização explícita. Em 09/10/2026, após discutir o fluxo, Cristian autorizou implementar: marcar somente os itens ainda não criados por padrão; permitir selecionar existentes/excluídos para recriar do zero apenas no perfil atual; manter indicadores e remover botões adicionais por item.

## Comportamento acordado

- **Escolher itens…** continua com checkboxes agrupados pelos jogos habilitados e uma ação **Carregar escolhidos**. Não há Restaurar, Usar capa do lote ou links adicionais nas linhas.
- Itens `never`/`deferred` começam marcados. Existentes e excluídos identificados com segurança ficam habilitados, mas desmarcados. Indicadores **Já criado** e **Excluído** permanecem. Marcadores antigos com vínculo verificável mostram **Já criado — lote anterior**.
- Selecionar todos inclui todos os itens disponíveis, inclusive substituições. O resumo distingue escolhidos, recriações do zero e novos adiados. Antes de enviar uma seleção com substituições, um único aviso confirma a perda de prazos editados, conclusão, favoritos e capas personalizadas.
- Existente e excluído têm o mesmo resultado: nova tarefa, novo ID, nome/capa/recorrência do catálogo, prazo calculado automaticamente, conclusão/favorita desmarcadas e sem estado pessoal anterior. Os 16 itens agora têm capa padrão com procedência registrada.
- A substituição remove o vínculo pessoal antigo. A nova tarefa pertence somente ao perfil atual. O template compartilhado permanece para os outros perfis; uma tarefa pessoal substituída sem outros vínculos é removida da tabela de tarefas. Não se altera a capa compartilhada nem o progresso dos demais.
- Novos desmarcados ficam adiados. Existentes/excluídos desmarcados permanecem como estavam. Abrir/cancelar não grava. Seleção parcial não fecha grupos incompletos.
- **Carregar Lote** mantém o contrato anterior: somente elegíveis, preservando tarefas existentes, exclusões e personalizações. A substituição exige seleção explícita.

## Identidade, calendário e falhas

A leitura usa o `task_id` registrado por definição/fase ou, em lotes históricos, o vínculo pessoal com a `shared_key` exata do catálogo. Nunca identifica por título. Homônimos manuais preservados e importados da API ficam protegidos, mesmo com uma decisão que aponta para eles. História fechada sem alvo verificável não recebe permissão para apagar/recriar por inferência.

O servidor revalida perfil, jogo habilitado, sigla sem ambiguidade, definição/fase, origem e calendário. Endstate continua sem recorrência: é recriado somente enquanto a fase catalogada tem prazo futuro válido. Depois do fim, a substituição fica bloqueada e o estado anterior permanece. Não se inventa próxima fase nem se solicita data na importação. As reservas HSR permanecem inativas.

Toda carga escolhida é transacional: recriações, novas tarefas, decisões/adiamentos e recibo são salvos juntos. Erro tardio desfaz inclusive a remoção do estado antigo. Locks seguem template → estado pessoal; seleção de jogos e operação do perfil são serializadas.

Uma substituição envia o ID esperado e uma versão do alvo lida ao abrir o modal. Alteração de nome, prazo, conclusão, favorita, capa ou exclusão depois da leitura invalida a operação; fechar/reabrir traz a versão atual. Não se apaga uma edição feita em outra aba sem conferir o alvo novamente.

O modal gera um identificador por tentativa e o mantém no retry da mesma seleção. O recibo SQL devolve o resultado já salvo se a resposta anterior se perdeu, sem uma segunda substituição, mesmo que a tarefa nova já tenha recebido progresso. Mudar a seleção gera outra tentativa; reusar um identificador com outro payload é rejeitado. Troca de perfil antes do envio bloqueia a escrita; durante o envio conserva o ator capturado e não atualiza a lista de outro perfil.

## Contratos públicos e migração

Migrações incrementais: `db/migrations/2026-10-09-task-batch-maintenance.sql` → `db/migrations/2026-10-09-task-batch-completion.sql`, após seleção → capas. Reproduzida no final de `db/schema.sql` e na ordem de `tests/helpers/testDatabase.mjs`. Foi aplicada no Supabase pelo pacote incremental em 09/10/2026; não faz backfill nem altera tarefas existentes ao ser aplicada.

- `list_profile_task_batch(profile, now)` acrescenta `task_id`, `task_version`, `can_replace` e metadados de origem/capa. Sua leitura continua sem escrita.
- `choose_profile_task_batch(profile, items, now default now(), request_id uuid default null)` conserva a posição dos três argumentos anteriores e acrescenta o identificador opcional da tentativa.
- Itens novos enviam `{abbreviation, definition_key, calendar_key}`. Substituições acrescentam `expected_task_id` e `expected_version` e exigem um request válido. Chamadas antigas somente com identidade conservam criação/preservação; não passam a apagar tarefas silenciosamente.
- `profile_task_batch_requests` guarda payload/resultado por perfil e tentativa. O reset explícito limpa também esses recibos; esse reset foi testado somente em banco descartável.
- A carga geral continua usando `apply_profile_task_batch` e os wrappers existentes. Os helpers de restauração/capa do protótipo anterior não fazem parte desta migração final.

Frontend: `js/database/taskDB.js`, `js/ui/taskBatchPicker.js`, `js/ui/taskUI.js`, instruções em `index.html`. Contratos só recebem identidade/versionamento, nunca datas da interface. O preview aceita porta alternativa e serializa os itens JSON.

## Imagens

URLs HTTPS fixas no catálogo SQL `task_batch_cover_catalogue()` e no [manifesto de procedência](task-batch-covers.json). O browser carrega o arquivo remoto; o clique não consulta uma API para descobrir a capa. Sem assets externos versionados, sem backfill e sem presumir licença aberta.

**16/16 defaults:** quinze Game8 e um GameWith. Os oito endgames já estavam na 1.11.0; Echo of War e Simulated Universe foram acrescentados neste ajuste, usando respectivamente [Game8 Echoes of War](https://game8.co/games/Honkai-Star-Rail/archives/410031) e [Game8 Simulated Universe](https://game8.co/games/Honkai-Star-Rail/archives/409149). Os arquivos novos responderam HTTP 200 e foram inspecionados visualmente no recorte de imagens. A conclusão acrescenta Weekly Boss de GI, NTE e WuWa, Fantasies of the Thousand Gateways, Hollow Zero e Notorious Hunt.

**Sem default: nenhum item ativo.** A carga normal preserva capas personalizadas; a recriação explícita as descarta, como acordado. Placeholder/lazy loading/fallback existentes permanecem.

## Weekly Boss de GI e NTE

Cada jogo tem identidade própria `weekly-boss`, apesar do título compartilhado. O catálogo passa de 14 para 16 atividades: oito weeklies e oito endgames. Os dois novos Weekly Boss usam o próximo reset de segunda às 09h UTC, 06h de Brasília. GI segue o reset América documentado no Game8; NTE foi confirmado por Cristian em 09/10/2026: “6h de brasilia”. A confirmação resolve o conflito entre páginas Game8 de boss e reset geral, sem alterar a regra diária de NTE. Referências e instante absoluto estão em [task-batch-weekly-calendar.json](task-batch-weekly-calendar.json).

O upgrade preserva tarefas e capas antigas, sem criação automática. Marcadores antigos de endgames GI/NTE não fecham seus novos weeklies. O wrapper público de endgames continua com três atividades; o wrapper semanal aceita os cinco jogos. O contrato global semanal legado conserva os três jogos anteriores.

## Evidências

Recorte anterior da recriação, antes da conclusão do catálogo:

```powershell
node --test tests/taskBatchMaintenance.test.mjs tests/taskBatchMaintenanceUI.test.mjs tests/taskBatchSelection.test.mjs tests/taskBatchPickerUI.test.mjs tests/taskBatchUI.test.mjs tests/profiles.test.mjs tests/profileUI.test.mjs tests/uiIntegration.test.mjs tests/endgameBatches.test.mjs tests/expandedTaskBatch.test.mjs
```

**171 testes aprovados**, sem falhas. SQL real como anon em instalação nova/upgrade: recriação dos itens, ID novo e estados zerados, isolamento de capa/progresso dos outros perfis, remoção do vínculo antigo, limpeza de tarefa privada obsoleta, história 1.10.0 sem backfill, homônimos/importados protegidos, calendários, versão obsoleta, recibo/retry, rollback tardio e reset. DOM real/cliente estrito: padrões de marcação, indicadores sem ações extras, resumo, selecionar todos, cancelamento do aviso sem escrita, retry com mesma tentativa, mudança de seleção/ator e refresh falho depois de salvar.

HTTP real na prévia 5503 (recorte anterior) e 5504 (entrega final) confirmou: carga geral não restaurou SU; seleção recriou Echo/SU com IDs novos e estado zerado; Demo manteve exatamente suas tarefas; repetir a tentativa devolveu o mesmo resultado sem mudar os novos itens. Não se consultou o live.

Fechamento 1.12.0: recorte de conclusão/seleção/lote/weekly/modal passou 130 testes e o recorte expanded passou 15 (execuções com sobreposição; não somar). `npm test` passou **575 testes: 69 Jest + 506 Node**, sem falhas, incluindo recriação dos 16 itens, upgrade dos 14 antigos, GI/NTE no limite do reset, isolamento e preservação. CSS/modal renderizados, PostgREST e concorrência entre conexões reais ainda exigem validação de interface/destino; PGlite e jsdom não provam essas condições.

## Para testar

Abra [a prévia atual](http://127.0.0.1:5504/tasks) e selecione **CRAN**. Os cenários abaixo usaram Echo personalizado/concluído/favorito com prazo manual e sem capa, SU excluído e 14 definições adiadas. Esses dados de teste eram descartáveis e desapareceram com o reinício do PC. Em uma prévia nova, habilite os jogos, carregue o lote e prepare os estados descritos antes de reproduzir os cenários.

1. Abra **Escolher itens…**. Confira Echo como **Já criado** e SU como **Excluído**, ambos habilitados/desmarcados. Os 14 ainda não criados começam marcados. Não há botões adicionais nas linhas.
2. Desmarque todos e marque apenas Echo e SU. Confira duas recriações no resumo. Clique **Carregar escolhidos** e cancele o aviso: nada muda e a seleção fica aberta.
3. Repita e confirme. Echo volta com nome padrão, nova capa, prazo automático e sem conclusão/favorita. SU volta zerado, também com nova capa. Recarregue para conferir persistência; os demais continuam adiados.
4. Confira **Demo** antes/depois: os itens desse perfil mantêm seus IDs/dados/capas. A troca no CRAN não deve alterá-los.
5. Volte ao CRAN, exclua SU e use somente **Carregar Lote**: SU permanece excluído, enquanto os 14 adiados são carregados. Para recuperá-lo zerado, selecione-o explicitamente no modal.
6. No CRAN, abra **Escolher itens…**, selecione Weekly Boss em GI e NTE e carregue. Confira capas, jogos distintos e prazo de segunda às 06h de Brasília. Use Convidado para conferir o catálogo completo; uma capa removida/personalizada em template antigo permanece preservada na carga normal.
7. Opcional: deixe o modal aberto, edite/conclua uma tarefa selecionada em outra aba do mesmo perfil e tente substituir. A carga deve ser rejeitada inteira; feche/reabra para conferir os dados atuais antes de repetir.

Para iniciar outro banco descartável: `npm run preview:profiles -- --port=5504` (a porta precisa estar livre). Dados somem ao encerrar esse servidor. Não aplicar a migração no Supabase nem usar reset live sem autorização.

**Workflow:** fluxo alinhado e implementação concluída, versão 1.12.0/changelog/commit autorizados. Testes locais completos aprovados; validação visual permanece pendente. Push concluído; SQL live aplicado por Cristian em 09/10/2026.

## Continuidade

Cristian adiou SweetAlert2 inicialmente e depois autorizou a integração em 09/10/2026. O recorte atual instala a versão 11.26.25 com assets locais e usa `showDialog` de `js/ui/dialogs.js`; a confirmação do lote tornou-se assíncrona, sem adicionar ações por item. 64 testes focados passaram; conferência visual pendente. O registro documental anterior conservou 1.12.0; SweetAlert2 e o roadmap fecham em 1.12.1 em 10/10/2026.

### Conferência do Supabase

Após Cristian informar “Success. No rows returned.” no SQL Editor do projeto `zzcxhtblbmiakuvdakic`, consultas públicas sem escrita confirmaram HTTP 200 para `task_batch_catalogue` (16), `task_batch_cover_catalogue` (16) e `list_profile_task_batch` do CRAN (16: dez novos e seis protegidos pelo lote anterior). A API também respondeu à leitura dos jogos. Nenhuma recriação/seleção foi executada pelo agente no banco real nessa conferência.
