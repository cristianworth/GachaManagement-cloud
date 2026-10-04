# Próximas melhorias

Eventos atualizados em [docs/event-integrations.md](docs/event-integrations.md): GI/HSR/ZZZ/WuWa/NTE ativos na versão 1.4.0; fixtures, testes SQL/DOM e CI prontos. WuWa/NTE distinguem horários e edições; Moonlit Path usa a estimativa aceita por Cristian. Convenções para próximas sessões em [docs/project-conventions.md](docs/project-conventions.md).

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

- [x] Adicionar ao formulário de jogo um campo opcional de URL da imagem. Quando estiver vazio, manter `img/default-icon.png` como imagem padrão.
- **Entregue em 1.3.0:** cadastro/edição com URL HTTPS, preservação de ícone interno e placeholder para falhas. Cobertura com HTML real em `uiIntegration.test.mjs`.
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

## 8. Importar eventos automaticamente pelo StarRailAssistant — MVP

**Recorte implementado na versão 1.4.0:** importação automática em inglês dos cinco jogos, proteção de datas manuais, ignorados, filtros, fixtures, testes SQL/HTML e CI. WuWa/NTE têm identidade por edição e política por campo validada. Fallback chinês, identidade por edição em GI/HSR/ZZZ e limpeza geral continuam separados; os itens abaixo descrevem o MVP completo.

- [ ] Importar eventos atuais e futuros diretamente para a lista de tarefas quando existir uma data final utilizável. A revisão humana fica reservada aos eventos sem prazo utilizável nas fontes disponíveis.
- [ ] Preferir os dados em `en-US`; completar o prazo com o registro chinês do mesmo evento quando necessário. Se o calendário inglês estiver indisponível, usar o chinês quando disponível. Registrar a origem do prazo e manter a edição manual.
- [ ] Usar capa quando disponível e placeholder quando estiver ausente ou não carregar. A falta de capa ou de data inicial não impede a importação de um evento com prazo final utilizável.
- [ ] Manter o motor de sincronização, a tabela de candidatos e a gravação de tarefas no projeto atual. A tabela de candidatos continua registrando a origem, o vínculo com a tarefa e as decisões de ignorar; a tela de revisão mostra apenas as pendências de prazo.
- [ ] Validar a mudança primeiro nos jogos já integrados, Genshin e HSR, e depois habilitar WuWa, ZZZ e NTE no mesmo fluxo. O MVP usa os cinco jogos atuais, sem tela inicial de seleção. Endfield fica preparado para uma expansão posterior, salvo mudança explícita de escopo.
- [ ] Fazer uma sincronização inicial dos eventos atuais/futuros e reaproveitar o workflow semanal existente. A aplicação lê as tarefas salvas no Supabase; abrir a página não precisa disparar uma importação completa.
- [ ] Criar ou atualizar cada edição sem duplicar tarefas em novas execuções. Preservar a conclusão da mesma edição e as decisões de ignorar. Uma edição futura de um modo recorrente deve ter sua própria identidade e estado.
- [ ] Implementar a proteção dos prazos ajustados manualmente. **Decisão aprovada:** atualizar automaticamente o prazo controlado pela API, mas preservar uma correção manual até o usuário optar por voltar à data da fonte.
- [ ] Generalizar a limpeza de edições importadas vencidas para os jogos habilitados, preservando tarefas manuais e weeklies. Não excluir tarefas apenas porque um evento sumiu de uma resposta parcial da API.
- [ ] Isolar falhas por jogo/fonte e registrar o resultado da sincronização. Falha de rede ou resposta inválida não apaga tarefas nem cria uma pendência de revisão para cada evento já conhecido.
- [ ] Verificar importação automática, fallback de prazo, ausência de capa/início, repetição da sincronização, eventos ignorados, correções manuais e troca de edição dos modos recorrentes.

- **Complexidade: média para automatizar o fluxo existente; alta para completar o fallback entre idiomas e cobrir os cinco jogos.** A expansão exige conferir os calendários de cada jogo e as peculiaridades de suas edições recorrentes.
- **Ponto a resolver antes do fallback por evento:** o contrato atual da API não fornece ID por atividade. Nomes e capas podem mudar entre idiomas; vários eventos podem compartilhar exatamente o início e o fim. Definir uma associação explícita entre os registros, com aliases por jogo quando necessário, e persistir a identidade escolhida. Não unir por posição da lista ou somente por datas. Usar o calendário chinês inteiro quando o inglês falha não resolve sozinho um evento sem prazo dentro de uma lista inglesa parcialmente preenchida.
- **Horários:** idioma não identifica servidor. Manter as conversões já conhecidas para América e aceitar o prazo original da fonte como fallback, com sua origem visível. WuWa/NTE usam bases explícitas por campo e edição; novas edições sem confirmação ficam em revisão. O NTE atual foi conferido nos anúncios globais 1.4; não extrapolar essa correspondência para versões futuras.
- **Dados existentes:** comentar as tarefas iniciais não remove registros já salvos. Manter a retirada manual dos duplicados antigos, conforme combinado; não fazer uma exclusão automática ampla das tarefas atuais.
- **Concluído quando:** eventos com prazo utilizável aparecem sem aprovação prévia, somente os sem prazo vão para revisão, repetir a sincronização não duplica nem desfaz decisões do usuário e as weeklies continuam independentes.

## 9. Manter somente weeklies na população inicial

- [ ] Substituir a lista de eventos fixos por definições de atividades semanais separadas dos dados vindos da API.
- [ ] Resolver o jogo pela abreviação cadastrada, sem depender de IDs numéricos fixos, e calcular o próximo vencimento pela regra de reset semanal em vez de usar datas de 2025.
- [ ] Permitir criar o lote de weeklies de um jogo sem repetir atividades já existentes. A operação deve funcionar mesmo quando a tabela já tiver tarefas de outros jogos.
- [ ] Preservar a recorrência das weeklies e impedir que a limpeza de eventos importados as exclua.
- **Complexidade: média.** Hoje `populateInitialTasks` só roda quando a tabela inteira está vazia. A criação por jogo exige identificar o lote de origem e tratar repetição, datas e vínculos corretamente.
- **Concluído quando:** a população inicial cria apenas weeklies, com prazos atuais e jogos corretos, e executar novamente não duplica nem restaura atividades que o usuário decidiu remover.
- **Futuro:** na seleção de jogos, oferecer a opção de criar o lote semanal. A preferência do usuário sobre esse lote deve ser persistida para que a abertura da aplicação não o recrie automaticamente.

## 10. Catálogo de jogos e seleção inicial — depois do MVP

- [ ] Evoluir o registro central de integração com chave da API, idiomas disponíveis e regras específicas por jogo, reaproveitando `eventGames.js`.
- [ ] Separar os jogos disponíveis no catálogo dos jogos que o usuário acompanha. Incluir o catálogo completo suportado pela API, distinguindo variantes regionais quando existirem.
- [ ] Criar a tela inicial para selecionar jogos e oferecer opcionalmente seus lotes de weeklies.
- [ ] Usar a mesma seleção nas telas de jogos/resina, tarefas e revisão, e na elegibilidade para importação. Se os perfis do item 3 forem implementados, guardar a seleção por perfil.
- [ ] Cadastrar jogos selecionados em bases já existentes: adicionar uma definição em `Game.js` não basta, porque a população atual de jogos só roda quando a tabela inteira está vazia.
- [ ] Tratar controle de resina como uma capacidade configurada por jogo. Ter um calendário na API não garante que seus parâmetros de resina estejam definidos no sistema.
- **Complexidade: alta.** Envolve seleção persistida, cadastro de jogos, filtros consistentes e sincronização. Preparação no MVP: centralizar os metadados realmente usados e resolver jogos por chave estável; adicionar a persistência da seleção quando a tela for implementada.
- **Concluído quando:** escolher um jogo habilita seus dados e sua integração sem exigir cadastro manual de eventos, e todas as telas respeitam a seleção salva.

## 11. Identificar eventos recém-adicionados — prioridade baixa

- [ ] Mostrar uma indicação discreta como **Recém-adicionado**, baseada na primeira importação da edição para a lista de atividades.
- [ ] Definir por quanto tempo o indicador aparece. Uma atualização de prazo/capa ou uma nova consulta semanal não deve tornar o mesmo evento novo novamente.
- **Complexidade: baixa a média.** Precisa registrar quando a tarefa foi importada; `last_seen_at` do candidato representa sincronização e não serve como data de entrada na lista.

## 12. Paginar a lista de atividades

- [ ] Avaliar paginação quando o filtro por jogo não for suficiente para reduzir a rolagem. A primeira melhoria da versão 1.2 é o filtro por jogo.
- [ ] Paginar a consulta no Supabase, aplicando filtro por jogo antes do limite e ordenação estável por prazo e ID. Mostrar quantidade total e estados sem resultados/erro.
- [ ] Voltar à primeira página ao trocar de jogo e manter a página válida após ignorar/excluir uma atividade.
- **Complexidade: média.** Envolve consultas, navegação e tratamento das alterações na lista; esconder linhas no navegador não reduz a quantidade carregada do banco.
