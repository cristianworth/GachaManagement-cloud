# Favorite tasks — estrelas por perfil

Entrega da versão 1.9.0, com commit e push autorizados por Cristian em 07/10/2026. Frontend, schema, migração e testes entregues; **a migração foi aplicada por Cristian no pacote incremental do Supabase em 09/10/2026**. A publicação do código não executa o SQL no destino.

## Comportamento

- A estrela vazia marca uma tarefa como favorita; a preenchida remove essa preferência. O botão tem ação nomeada, `aria-pressed`, operação nativa por teclado e conserva o foco após a mudança de posição.
- A preferência é `profile_tasks.is_favorite`, com padrão `false`. Tarefas e capas continuam compartilhadas conforme os contratos existentes; a estrela pertence ao perfil.
- Ordem: favoritas primeiro; em cada grupo, prazo crescente, tarefas sem prazo ao fim e ID crescente como desempate. SQL e renderização usam essa mesma regra. Filtros de jogo, intervalo e Hide completed continuam funcionando.
- Recarregar, editar, concluir, renovar uma recorrência ou ocultar/reselecionar o jogo conserva a preferência. Sincronizar a mesma edição conserva a estrela; uma edição nova começa sem ela.
- Favoritar não altera prazo, conclusão, imagem ou recorrência e não protege um importado vencido da limpeza. A RPC não cria tarefas nem restaura removidas.
- Durante a gravação, a linha bloqueia suas ações e a estrela impede envio duplicado. A tela só muda após a gravação aceita. Falha mantém o estado anterior; se salvar funcionar e a recarga falhar, a lista local conserva o resultado salvo e oferece Tentar novamente.

## Favoritas em Games — 1.19.0

Entrega da versão **1.19.0**, de 31/10/2026. Apresentação em abas e ajustes de padrão/navegação definidos por Cristian após a avaliação visual. Reutiliza as preferências existentes; não exige migração ou alteração no banco real.

- Após a avaliação visual, Cristian escolheu abas em vez dos conteúdos empilhados: **Favoritas** é a primeira aba; **Anotações** fica em segundo lugar e conserva o texto livre anterior. Favoritas abre por padrão quando há itens; zero favoritas pendentes confirmado pela consulta abre Anotações. Falha/carga pendente não conta como zero, e escolhas manuais/edição em andamento não são substituídas por uma resposta atrasada. A região tem altura fixa nas duas abas, sem preferência persistida. Save e atualização que preserva rascunhos conservam a aba escolhida de cada jogo; uma nova entrada ou troca de perfil aplica novamente o padrão pelos dados disponíveis.
- Games mostra até três favoritas pendentes por jogo, em linhas com bullets, separadores e prazo à direita. Ordem por prazo crescente e ID, com tarefas sem prazo no fim. Futuras e vencidas retornadas pela consulta continuam elegíveis; Games não executa a limpeza de importados. A aba vazia informa “Nenhuma favorita pendente”, distinguindo carga pendente e indisponibilidade.
- Títulos ocupam até duas linhas, com texto completo no DOM acessível e no atributo `title`. O prazo mostra dia/mês e hora; o texto completo anterior, incluindo ano, continua no título e nome acessível. Ausência de prazo aparece como “Sem prazo”. “Ver em Tasks” fica no cabeçalho quando há favoritas, indica quantas ficaram além das três e abre `/tasks?game=ID`, já filtrado pelo jogo e na primeira página. Outros filtros são preservados. O filtro de jogo é reaplicado ao entrar pela URL, inclusive no redirecionamento do Pages, mas leituras silenciosas/ações de Tasks conservam o filtro escolhido na tela. Um ID ausente da seleção do perfil volta a All games, e uma falha de navegação mantém o jogo solicitado para retry.
- Alternar as abas mantém o mesmo textarea, rascunho e seleção do texto, sem gravar. Setas esquerda/direita, Home e End alternam e focam as abas; atributos de tab/tabpanel e tabulação acompanham a seleção. Anotações longas usam rolagem interna, mantendo a altura do card.
- A listagem é somente consulta. Estrela, edição e conclusão permanecem em Tasks; não há cópia para o To-do nem vínculo com o estado diário de Games.
- Cada carga inicia uma leitura de jogos e uma de tarefas em paralelo. Os jogos ficam utilizáveis após sua própria leitura; favoritas preenchem somente sua região depois dos cards correspondentes. O agrupamento usa `fetchAllTasks`, `filterTasks` e `sortTasks`, sem estado interno de outra tela ou nova persistência.
- Reconstruir os cards conserva as favoritas anteriores do mesmo documento/perfil enquanto a leitura termina. Falha parcial conserva essa lista; na carga manual há mensagem própria e Tentar novamente. Sem leitura anterior, a falha informa indisponibilidade, sem anunciar lista vazia. A leitura silenciosa não acrescenta avisos nem apaga feedback manual.
- Nova carga ou navegação invalida respostas anteriores, inclusive sair e voltar para Games. Perfil/rota e `canApply` são conferidos antes de cada etapa. Trocar de perfil remove imediatamente o snapshot de favoritas anterior. Rascunhos e seleção do texto sobrevivem à reconstrução; a resposta de favoritas não recria os campos.
- Voltar de Tasks faz uma nova leitura normal. Mudanças de outras abas seguem o intervalo silencioso existente de seis minutos, quando elegível; não é atualização em tempo real.

**Validação de 31/10:** o recorte inicial passou 132 testes focados em 13 arquivos. Na alteração para abas, **81 testes focados** passaram em sete arquivos; após o ajuste final de rótulos/cabeçalho, os 15 testes de Games/favoritas e build passaram novamente. Os 13 cenários de Games/favoritas incluem padrão mesmo sem itens, teclado, rascunho/cursor, aba por jogo durante refresh/Save, resposta atrasada e troca de perfil. A suíte completa não foi executada neste recorte intermediário. Prévia com SQL descartável conferida em 1440 × 1000, 1151 × 900 e 360 × 800, sem overflow horizontal observado; card de cerca de 193px no desktop, com a mesma altura nas duas abas. Conferidos título longo, card verde, Save e rascunho ao alternar. Sem aparelho físico ou operação no Supabase real.

Para conferir: `node scripts/previewProfiles.js --design --port=5511`, se a porta estiver livre. Em CRAN, HSR tem cinco favoritas de exemplo, incluindo título longo; GI tem uma sem prazo e os demais jogos abrem Anotações. Confira a ordem Favoritas → Anotações. Edite Anotações, alterne para Favoritas e volte: texto e altura devem permanecer. Save conserva a aba e grava as notas; recarregar reaplica o padrão pela quantidade de favoritas. Ver em Tasks deve selecionar somente o jogo clicado no filtro; recarregar a URL mantém esse jogo. Demo não recebe os exemplos extras de CRAN. Os dados somem ao parar a prévia.

**Ajustes posteriores ao checkpoint `04ca94e`:** 63 testes focados aprovados para o padrão com zero favoritas e navegação filtrada, incluindo falha/retry, escolha manual durante leitura, rascunho em edição, recarga da URL, primeira página e redirecionamento do Pages. Conferido na prévia descartável em desktop e 360px, sem erros de console ou overflow horizontal observado. O fechamento da suíte completa consta no changelog da 1.19.0.

**Fechamento da 1.19.0:** `npm test` passou 689 testes (69 Jest + 620 Node), sem falhas; cinco jogos/seis fases passaram no validador de banners. Sem migração, nova dependência ou escrita no banco real. [Registro da entrega](../CHANGELOG.md#1190---2026-10-31).

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
