# Estado diário de Games

Base **1.16.0**, de 22/10/2026, refinada em 26/10/2026. Cristian definiu o reset por jogo, o padrão de 06:00 de Brasília para Endfield/siglas personalizadas, a conclusão ao clicar Save em Games e a ordenação por estado. A confirmação independe de alterar o número da resina: salvar 0 novamente no dia seguinte também deixa o jogo verde. Voltar depois é escolhido manualmente após o Save.

## Uso e ciclo

- O controle **Hoje**, abaixo do nome, salva imediatamente a escolha: **Pendente** (azul acinzentado), **Voltar depois** (âmbar) ou **Feito por hoje** (verde). Texto e cor aparecem juntos; o destaque fica no controle e na borda do card.
- Voltar depois indica que a rotina foi feita, mas ainda há algo para fazer. A escolha é reversível; não exige preencher uma tarefa ou motivo.
- Escolher um estado altera somente essa marcação. Resina e To-do em edição permanecem na tela e não são salvos por essa ação.
- Clicar Save em Games marca **Feito por hoje**, mesmo se a stamina for igual ao último valor salvo ou se o jogo estava em Voltar depois. Isso inclui salvar apenas anotações pelo mesmo botão. Não é necessário que a previsão de lotar seja amanhã. A resina, as anotações e a marcação são gravadas na mesma RPC; falha não deixa uma conclusão sem a resina correspondente. Um único instante capturado ao clicar Save guia o ciclo e a previsão.
- Depois de salvar, Cristian pode escolher Voltar depois manualmente. A automação não precisa de opção extra para habilitar. O Save do cadastro em Edit permanece separado e não conclui a diária.
- No reset, um estado de um ciclo anterior é apresentado como Pendente, sem apagar anotações ou gravar um reset no banco. A tela verifica isso no relógio existente de um minuto e ao retornar à aba; não é necessário manter o site aberto. Com a página visível, a mudança pode aparecer no próximo tick, em até um minuto.
- Uma gravação que atravessa o horário do reset pertence ao ciclo capturado no começo da operação. Ao receber a resposta, a tela já apresenta o estado efetivo do novo ciclo.
- Falha restaura a marcação anterior e permite tentar de novo. Durante a gravação, o controle e os botões da linha ficam desabilitados. Respostas de um perfil/tela anterior não alteram a tela atual.
- A lista ordena por **Pendente → Voltar depois → Feito por hoje** e, dentro de cada grupo, pela previsão de stamina cheia, da mais próxima para a mais distante. Previsões ausentes/inválidas ficam no fim de seu grupo; empates mantêm a ordem relativa. A ordem é reaplicada após uma escolha manual, Save, leitura e virada de ciclo. Mover os cards reutiliza os nós, preservando rascunhos/foco/cursor; salvar um jogo também preserva rascunhos dos demais.
- Tasks continua independente: o estado de Games não conclui tarefas nem apaga o To-do. Outras abas/dispositivos recebem o estado pela carga normal, por Atualizar dados ou pela leitura silenciosa de seis minutos, quando elegível.

## Horários e limite do recorte

O cálculo usa instantes UTC completos, sem depender do fuso do navegador ou do horário de verão americano. A base é o servidor América adotado no projeto:

| Jogo | Reset do servidor (UTC−5 fixo) | UTC | Brasília |
| --- | --- | --- | --- |
| GI / HSR / ZZZ / WuWa | 04:00 | 09:00 | 06:00 |
| NTE | 05:00 | 10:00 | 07:00 |
| Endfield e outras siglas | Padrão pessoal | 09:00 | 06:00 |

Referências existentes: [convenções](project-conventions.md#fontes-e-horários), [WuWa](wuwa-validation.md), [NTE](nte-validation.md) e [base América de GI/HSR/ZZZ](weekly-batches.md). Game8: [GI](https://game8.co/games/Genshin-Impact/archives/421954) informa o reset do servidor às 04:00; [HSR](https://game8.co/games/Honkai-Star-Rail/archives/410031), [ZZZ](https://game8.co/games/Zenless-Zone-Zero/archives/460247), [WuWa](https://game8.co/games/Wuthering-Waves/archives/454085) e [NTE](https://game8.co/games/Neverness-to-Everness/archives/598313) são as referências de horário registradas no projeto. A confirmação específica de Weekly Boss do NTE não altera seu reset diário.

Por escolha explícita de Cristian em 22/10/2026, **Endfield e qualquer sigla sem regra específica usam 06:00 de Brasília (09:00 UTC)**. Esse padrão organiza o acompanhamento pessoal e não é apresentado como confirmação do reset oficial desses jogos. O controle fica disponível para jogos personalizados. Não há configuração de datas a cada uso.

## Persistência e implementação

`js/utils/gameDailyState.js` define os ciclos, o estado efetivo e a ordenação. `gameUI.js` adiciona o controle, mantém os cards/rascunhos e compartilha o relógio existente. `gameDB.js` expõe `saveGameDailyState`, usando a RPC pública `save_profile_game` com apenas `abbreviation` e `daily_state: { state, cycle_start }`. A sigla é exigida pelo contrato para jogos do catálogo. O Save de resina usa `updateGame` com `completeDaily` explícito para incluir a marcação no mesmo payload da resina/anotações.

`profile_games.overrides` e `list_profile_games` já suportam esse dado pessoal. O mapper lê `daily_state`, mas não o inclui em edições gerais; somente uma ação explícita de estado ou o Save em Games o grava. Isso evita sobrescrever uma marcação mais recente com um snapshot antigo ao editar o cadastro. Não houve alteração de schema, nova RPC, migração, dependência ou acesso ao Supabase real. O campo JSON segue as permissões públicas de perfil já existentes.

## Validação e Para testar

Correção de 26/10: o cenário de stamina 0 repetida após o reset e o Save com o mesmo valor foram reproduzidos em testes que falharam antes da correção. Após remover a comparação numérica como condição de conclusão, **59 testes focados passaram** (estado diário, tela, stamina e feedback), incluindo persistência, falha sem gravação parcial, ciclo capturado e isolamento de perfil. Conferência na prévia descartável: salvar 0, marcar Pendente e salvar novamente sem alterar 0 deixa o controle verde. Sem alteração no banco real ou nova execução da suíte completa.

Os testes focados cobrem limites de reset, viradas de mês/ano e ano bissexto, padrão para siglas personalizadas, ordenação por estado/previsão, persistência SQL em instalação nova/upgrade, Save de resina com conclusão atômica, Save apenas de anotações, falha/retry, gravação atravessando reset, troca de perfil durante a leitura, rascunhos/foco, leitura silenciosa e ausência de escritas pelos timers. A suíte completa integra o fechamento MINOR; o resultado final consta do changelog.

Prévia descartável: `npm run preview:profiles -- --design --port=5508`, usando frontend e SQL reais com dados fictícios. Conferidos 1440 × 1000, 390 × 844 e 360 × 800, sem overflow horizontal da página; controle móvel com 42 px de altura e fonte de 16 px. Nova aba conservou os estados salvos sem trazer os rascunhos; Demo permaneceu independente de CRAN. Evidências locais em `.local-deliveries/game-daily-state/`. Sem teste em aparelho físico.

1. Abra Games na prévia, selecione CRAN e escolha Voltar depois em um jogo. Confira o controle âmbar e o aviso de gravação.
2. Digite resina/anotações sem Save e escolha Feito por hoje. Os rascunhos permanecem; uma nova aba deve mostrar a marcação verde e somente os valores de resina/anotações que já estavam salvos.
3. Escolha Pendente ou Voltar depois e clique Save sem alterar o número: o estado deve ficar verde e o card ir para o grupo Feito por hoje. Repita com stamina 0 e confira a persistência ao recarregar. Escolha Voltar depois após salvar: ele fica âmbar e vai para o grupo intermediário.
4. A virada diária foi verificada com relógio fixo nos testes. Em uso normal, reabra a página após o próximo reset: o jogo deve aparecer Pendente, mantendo suas anotações.
5. Troque para Demo para conferir que a marcação de CRAN não aparece ali. Retorne a CRAN e abra uma nova aba para conferir a persistência. Em cada grupo de estado, confira a previsão mais próxima antes da mais distante.
