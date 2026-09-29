# Próximas melhorias

Complexidade estimada para este projeto (HTML, CSS, JavaScript e Supabase): **baixa** = alteração localizada; **média** = envolve interface e lógica existente; **alta** = envolve várias partes do sistema, migração de dados ou decisões de produto. São estimativas relativas, não prazos.

## 1. Mostrar a resina atual na coluna "Max Stamina At"

- [ ] Exibir, junto do horário em que a resina ficará cheia, uma estimativa da resina **agora** (por exemplo, `175/240`).
- **Complexidade: média.** O jogo já guarda `currentStamina`, `capStamina`, `staminaPerMinute` e `dateMaxStamina`, mas a tela só formata a data. É preciso definir como calcular a estimativa a partir do tempo restante, limitar o resultado entre zero e o máximo e lidar com jogos ainda não atualizados.
- **Concluído quando:** o valor mostrado acompanha o tempo decorrido, respeita o limite do jogo e permanece coerente após salvar uma nova resina.

### 1.1. Botão para atualizar a resina exibida

- [ ] Adicionar um botão na linha de cada jogo para recalcular e exibir a resina estimada naquele momento.
- **Complexidade: baixa**, se for apenas uma atualização visual com os dados já carregados; **média**, se também buscar os dados mais recentes do Supabase antes do cálculo.
- **Depende de:** item 1. Decidir se o botão deve só atualizar a tela ou também gravar um novo valor no banco. Uma atualização visual não deve sobrescrever a resina salva sem uma ação explícita.
- **Concluído quando:** clicar no botão atualiza apenas o jogo escolhido e mostra o valor calculado para o horário atual.

## 2. Usar imagem por URL para jogos novos

- [ ] Adicionar ao formulário de jogo um campo opcional de URL da imagem. Quando estiver vazio, manter `img/default-icon.png` como imagem padrão.
- **Complexidade: baixa a média.** O banco e o modelo já possuem o campo `img`; falta expor a edição na interface, validar a URL e tratar links que não carreguem.
- **Concluído quando:** é possível cadastrar ou editar um jogo com imagem externa sem fazer upload, e uma URL vazia ou imagem indisponível não deixa um ícone quebrado na lista.

## 3. Separar os dados em dois perfis fixos

- [ ] Criar uma tela simples de entrada com apenas dois perfis predefinidos, sem opção de cadastro.
- [ ] Associar os jogos e as tarefas ao perfil correspondente e mostrar somente os dados do perfil selecionado.
- [ ] Fazer backup e associar os registros já existentes ao perfil principal antes de aplicar os filtros. Conferir a quantidade de jogos e tarefas antes e depois da mudança.
- **Complexidade: média.** Envolve uma tela, filtros nas consultas e gravações e uma migração cuidadosa dos dados atuais; não exige implementar cadastro de usuários.
- **Concluído quando:** cada perfil mostra seus próprios jogos e tarefas no navegador e no celular; criar, editar ou excluir em um perfil não altera a lista do outro; os dados existentes continuam acessíveis no perfil principal.
- **Limite da solução:** essa entrada serve para organizar os dados, não para proteger a privacidade. Sem autenticação real, qualquer visitante pode escolher qualquer um dos dois perfis; senhas ou PINs escritos no JavaScript também não protegeriam o banco. Se a privacidade se tornar necessária, adicionar autenticação e políticas RLS por usuário em uma etapa separada.

## 4. Atualizar favicon e ícones de botões

- [ ] Substituir o favicon atual e escolher ícones consistentes para as ações principais (salvar, editar, excluir, atualizar e navegar).
- **Complexidade: baixa a média.** A troca do favicon é localizada; os botões exigem conferir legibilidade, contraste, tamanho de toque no celular e textos acessíveis.
- **Concluído quando:** favicon e botões têm aparência consistente e continuam claros sem depender apenas do desenho dos ícones.

## 5. Melhorar a interface em geral

- [ ] Revisar visual, organização, tipografia, espaçamentos, estados de carregamento/erro e uso no navegador do celular.
- **Complexidade: alta.** Afeta as telas de jogos, tarefas e formulários, além da responsividade. Vale dividir a implementação em mudanças menores após definir o visual desejado.
- **Concluído quando:** as telas funcionam bem em desktop e celular, as ações importantes são fáceis de encontrar e há feedback claro após salvar ou quando uma operação falha.
- **Relação com o item 4:** escolher um conjunto visual coerente antes de substituir muitos ícones evita retrabalho.

## 6. Alerta para uma quantidade escolhida de resina

- [ ] Permitir escolher um jogo e uma quantidade alvo de resina (por exemplo, 60) e mostrar o horário previsto para atingir esse valor.
- [ ] Depois de cadastrar o alerta, mostrar na tela uma contagem regressiva até o horário previsto. Atualizar a previsão quando a resina do jogo for salva novamente.
- **Complexidade: média.** Reaproveita a taxa de regeneração e a previsão de resina do item 1, mas exige validar o alvo, salvar o alerta e manter a contagem regressiva correta após recarregar a página ou abrir em outro dispositivo.
- **Depende de:** item 1. Se o alvo já foi atingido, o alerta deve indicar isso em vez de mostrar uma contagem negativa.
- **Concluído quando:** o horário e a contagem estão corretos para o jogo escolhido, o alerta persiste no Supabase e acompanha mudanças na resina registrada.
- **Escopo inicial:** alerta e contagem dentro do site. Notificações do navegador com o site fechado podem ser avaliadas separadamente.

## 7. Avisar sobre atualizações e manutenção dos jogos

- [ ] Cadastrar por jogo a data e hora previstas para início e fim da atualização, incluindo o período em que o jogo ficará indisponível.
- [ ] Mostrar quanto tempo falta para começar; durante a manutenção, indicar que o jogo está indisponível e a previsão de retorno.
- **Complexidade: média.** Exige dados por jogo, exibição do tempo restante e tratamento de fuso horário e de datas alteradas pelo jogo.
- **Concluído quando:** o aviso distingue atualização futura, manutenção em andamento e manutenção encerrada, com horários coerentes no navegador e no celular.
- **Origem dos dados:** começar com cadastro manual. Buscar agendas automaticamente em fontes externas seria uma tarefa separada.

### 7.1. Avisar sobre o próximo banner

- [ ] Cadastrar por jogo a data e hora do próximo banner e quem estará nele.
- [ ] Mostrar o nome ou os nomes anunciados e quantos dias faltam para o banner entrar.
- **Complexidade: média.** Pode aproveitar a apresentação de datas do item 7, mas precisa permitir editar o anúncio caso personagens ou horários mudem.
- **Concluído quando:** cada jogo mostra seu próximo banner e a contagem de dias, sem exibir anúncios vencidos como futuros.
- **Origem dos dados:** cadastro manual inicialmente; integração automática com fontes de banners fica fora deste item.
