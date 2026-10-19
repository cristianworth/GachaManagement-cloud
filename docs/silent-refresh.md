# Atualização silenciosa de Games e Tasks

Implementada em 13/10/2026 sobre a versão 1.14.0 e entregue em 1.15.0 em 18/10/2026. Atualização da versão, changelog, commit e push autorizados por Cristian.

## Comportamento

- Uma leitura automática a cada seis minutos na lista visível de Games ou Tasks. Uma carga bem-sucedida, inclusive manual, reinicia o período. Formulários, seleção de jogos e revisão de eventos não recebem esse timer.
- Aba oculta pausa o agendamento. Ao retornar, uma leitura vencida é executada quando seguro; se ainda não passaram seis minutos, aguarda o tempo restante. Há apenas uma atualização automática em andamento.
- Campo focado, modal, confirmação, carga do lote ou operação com loading adiam a leitura. O timer verifica novamente em 15 segundos, sem consultar o banco enquanto estiver bloqueado. Clique fora do campo para liberar a atualização; um rascunho sem foco continua sendo preservado.
- Se edição, navegação, troca de perfil ou gravação começarem durante a consulta, a resposta não reconstrói a tela. Uma nova carga bem-sucedida substitui o agendamento anterior; uma resposta manual atrasada da tela anterior não cancela o timer da atual.
- Games reutiliza a preservação dos campos editados. Dados limpos e previsão salva são atualizados; stamina/anotações alteradas permanecem como rascunhos. Um jogo removido com rascunho impede a substituição da lista, preservando o texto.
- Tasks mantém os filtros, tamanho e página válida, reaplicando a ordenação existente. Se a página ficar vazia, recua conforme a paginação da 1.14.0. O foco de um botão é restaurado quando ele ainda existe; caso contrário, segue para o controle de tamanho de página.
- Atualização automática não mostra overlay, confirmação, aviso de sucesso ou erro, nem apaga feedback/retry das operações manuais. Falha conserva dados/controles e tenta novamente após seis minutos.

## Contratos e limites

`js/ui/silentRefresh.js` concentra o agendamento e o contexto da tela/perfil. Router encerra o timer ao navegar. As listas usam `displayAllGames`/`displayAllTasks` com `silent` e uma verificação `canApply` após a leitura: `true` significa aplicado, `false` falha e `null` adiamento. Estados ocupados usam as funções públicas `isLoading` e `isTaskBatchPickerBusy`.

Games consulta `list_profile_games`; Tasks consulta `list_profile_tasks` e `list_profile_games`. O caminho silencioso de Tasks pula `cleanupExpiredImportedEvents`, pois essa operação escreve no banco. A carga manual/por navegação continua com o comportamento anterior. Não há migração, escrita automática, importação de calendário, dependência nova ou sincronização entre idiomas.

A estimativa local de resina por minuto é independente dessas consultas. Este recorte não é uma assinatura realtime; mudanças de outra aba/dispositivo aparecem na próxima leitura elegível. Atualizar dados e Save continuam disponíveis.

## Validação

- 89 testes focados passaram: atualização silenciosa, Games/resina, Tasks/paginação, loading/falhas, rotas, lote, integração DOM e build/shell.
- `npm test` passou 606 testes (69 Jest + 537 Node), sem falhas. Depois do ajuste final que impede uma carga manual atrasada de cancelar o timer atual, os 13 testes do agendador passaram novamente. Log completo em `.local-deliveries/silent-refresh/full-suite.log`.
- Relógio fixo e DOM real com cliente simulado protegem limite exato de seis minutos, pausa/retorno, edição/modal/gravação, ausência de consultas duplicadas, resposta atrasada, perfil/rota, falha/retry, foco, filtros, rascunhos e ausência de limpeza/escritas no caminho automático.
- Prévia isolada iniciada na porta 5506, sem acesso ao Supabase; carga de Games sem erros de console. Os ciclos completos foram verificados nos testes com relógio fixo, sem acelerar o período no código da aplicação.

## Para testar

Prévia descartável: `npm run preview:profiles -- --design --port=5506`. Abra [Games](http://127.0.0.1:5506/) em duas abas e selecione CRAN. Se o servidor desta entrega já estiver rodando, basta abrir a URL. Os dados desaparecem ao encerrá-lo.

1. Na primeira aba, deixe uma anotação sem salvar. Na segunda, altere a stamina de um jogo e clique Save. Volte à primeira, clique numa área vazia fora do editor para tirar o foco e aguarde a leitura de seis minutos: o campo limpo/previsão deve atualizar, mantendo a anotação local. Nenhum overlay ou confirmação deve surgir.
2. Em Tasks, use Carregar Lote para ter mais de 20 itens; selecione 10, um filtro e uma página posterior. Em outra aba, altere uma favorita/conclusão ou crie uma tarefa do mesmo perfil. Retorne e deixe a lista visível; a próxima leitura deve atualizar os dados, preservando filtros e uma página válida.
3. Deixe um campo focado ou Escolher itens aberto quando a leitura vencer. Ela deve aguardar. Feche o modal ou clique fora do campo; a atualização elegível ocorre na próxima verificação de até 15 segundos.
4. Oculte a aba por mais de seis minutos e retorne: os dados devem atualizar sem novo período completo, desde que não haja campo focado/modal/gravação. Um retorno antes do vencimento aguarda somente o restante.
5. Abra um formulário ou troque de perfil: a atualização da lista anterior não deve reconstruir a nova tela. Save continua registrando somente alterações explícitas.
