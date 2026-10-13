# Paginação visual e estimativa local de resina

Recortes S entregues em 1.14.0 em 12/10/2026 sobre a versão 1.13.2. Commit, push, changelog e escolha da numeração autorizados por Cristian.

## Comportamento

- Tasks mostra 20 itens por página, com opção de 10. O rodapé informa intervalo, total filtrado e página atual, com Anterior/Próxima.
- Filtros por jogo, intervalo e conclusão e a ordem favoritas → prazo → ID consideram a lista inteira antes do corte. Trocar filtro ou tamanho volta à primeira página.
- Concluir, favoritar, excluir/ignorar ou recarregar conserva uma página válida. Quando a última fica vazia, a lista recua; carregar outro perfil ou remover o jogo que estava filtrado volta à primeira página. Se a estrela focada sair da página após favoritar, o foco vai ao tamanho da página. Lista vazia desabilita as duas setas.
- A consulta continua trazendo todas as tarefas do perfil. Navegar entre páginas ou filtrar não consulta o banco; o lote continua independente dos filtros/paginação.
- Em Games, a estimativa e o tempo restante são recalculados a cada minuto a partir da previsão salva e dos minutos por unidade cadastrados. O timer não altera stamina/anotações em edição, foco ou seleção de texto, nem consulta/grava dados.
- Aba oculta pausa o timer. Ao voltar, o cálculo usa o horário atual, inclusive após uma longa pausa. Sair de Games encerra timer/listener; renderizar novamente mantém apenas um timer. O cálculo respeita o máximo e conserva “Estimativa indisponível” quando falta previsão válida.
- Save continua registrando o valor real e uma nova previsão. Atualizar dados continua sendo uma leitura explícita; a leitura automática a cada seis minutos é outro recorte.

## Implementação e limites

Mudanças localizadas em `taskUI.js`, `gameUI.js`, Router, HTML e tema Sangonomiya. O Router usa a função pública `stopStaminaEstimateTimer`; o cálculo existente `estimateCurrentStamina` permanece em uso. Sem dependência nova ou alteração SQL.

O tamanho da página é mantido durante a navegação da sessão; recarregar o navegador volta ao padrão de 20. Não foram adicionados busca por nome ou consulta paginada no Supabase. O relógio do navegador e a previsão salva determinam a estimativa; ela não mede o saldo real dentro do jogo.

A grade central usa uma coluna com largura mínima zero, mantendo rolagem horizontal de tabelas dentro do próprio contêiner em telas estreitas. O rodapé reutiliza cores/botões do tema atual e quebra em linhas no celular.

## Validação

Os testes DOM com cliente simulado e relógio fixo cobrem ordenação/filtros antes da paginação, limites 20/10, ausência de consultas na navegação, ações na última página, falhas e troca de perfil. Os testes do timer cobrem jogos com seis/oito minutos por unidade, rascunhos/foco/cursor, ausência de leituras/escritas, teto, previsão ausente, retorno de aba, Save, timer único e encerramento pelo Router.

Comando focado inicial: `node --test tests/taskPaginationUI.test.mjs tests/staminaEstimateTimerUI.test.mjs tests/gameStamina.test.mjs tests/uiIntegration.test.mjs tests/uiFeedback.test.mjs tests/designPreview.test.mjs` — 56 testes aprovados. A suíte completa passou 593 testes (69 Jest + 524 Node), sem falhas, após completar a API de remoção de listener no documento simulado dos dez testes antigos de rota. Depois, os ajustes finais de foco/fallback de filtro foram validados junto de timer, rotas e build/shell em 23 testes focados aprovados. Log completo em `.local-deliveries/task-pagination-stamina/full-suite.log`.

Prévia isolada com 24 tarefas conferida no navegador: 20/4 e 10/10/4, totais/páginas e celular a 390 × 844 sem overflow horizontal da página. Screenshots locais em `.local-deliveries/task-pagination-stamina/`: `mobile.png`, `desktop.png` e `games.png`. A rolagem horizontal da tabela permanece disponível. Em Games, o rascunho e foco foram mantidos; não foram observados erros de console. Avanço da resina e ciclo do timer foram verificados com relógio fixo nos testes DOM.

## Para testar

Prévia: `npm run preview:profiles -- --design --port=5505`, com dados fictícios em PostgreSQL descartável. Se a porta já estiver servindo esta entrega, use [Tasks](http://127.0.0.1:5505/tasks). Os dados desaparecem ao encerrar o servidor.

1. Selecione CRAN e clique Carregar Lote para obter mais de 20 tarefas. Confira 20 na primeira página, o restante em Próxima e limites desabilitados quando necessário. Troque para 10; a lista deve voltar à primeira página.
2. Em uma página posterior, troque jogo, intervalo ou Hide completed. Confira primeira página, total filtrado e favoritas no topo da lista inteira. Desfaça os filtros para navegar novamente.
3. Na última página, exclua ou conclua todos os itens visíveis com Hide completed ativo. Quando ela ficar vazia, deve recuar. Favoritar deve reorganizar a lista e manter a página válida.
4. Em Games, digite stamina/anotações sem salvar e deixe a tela aberta. A cada minuto a estimativa/tempo restante são recalculados; a quantidade só avança quando completa o intervalo do jogo (por exemplo, seis/oito minutos por unidade). Os rascunhos e o foco devem permanecer.
5. Oculte a aba por alguns minutos e retorne: a estimativa deve acompanhar o horário atual. Salve uma quantidade real e confira que a previsão nova passa a guiar os próximos cálculos. Saia de Games e retorne sem acumular timers.
6. No celular, confira rodapé em linhas, controles acessíveis e rolagem horizontal apenas na tabela.
