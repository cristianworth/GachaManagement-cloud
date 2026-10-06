# Próximas melhorias

Prioridades reordenadas em [docs/roadmap-priorities.md](docs/roadmap-priorities.md). Sincronização diária, weeklies, perfis, seleção de jogos e política de eventos ficam fora dessa tier list porque já foram implementados; contexto de continuação em [docs/handoff-daily-sync-weeklies.md](docs/handoff-daily-sync-weeklies.md).

Eventos atualizados em [docs/event-integrations.md](docs/event-integrations.md): GI/HSR/ZZZ/WuWa/NTE ativos na versão 1.4.0; fixtures, testes SQL/DOM e CI prontos. WuWa/NTE distinguem horários e edições; Moonlit Path usa a estimativa aceita por Cristian. Convenções para próximas sessões em [docs/project-conventions.md](docs/project-conventions.md).

Complexidade estimada para este projeto (HTML, CSS, JavaScript e Supabase): **baixa** = alteração localizada; **média** = envolve interface e lógica existente; **alta** = envolve várias partes do sistema, migração de dados ou decisões de produto. São estimativas relativas, não prazos.

## 1. Mostrar a resina atual na coluna "Max Stamina At"

- [x] Exibir, junto do horário em que a resina ficará cheia, uma estimativa da resina **agora** (por exemplo, `175/240`). Entregue em 1.8.0.
- **Complexidade: média.** Usar a previsão salva, o limite e os minutos por unidade para calcular unidades inteiras entre zero e o máximo. Sem previsão salva ou parâmetros válidos, informar que a estimativa está indisponível. A estimativa é atualizada ao carregar a lista ou clicar no botão; não há timer automático neste recorte.
- **Concluído quando:** o valor mostrado acompanha o tempo decorrido, respeita o limite do jogo e permanece coerente após salvar uma nova resina.

### 1.1. Botão para atualizar a resina exibida

- [x] Adicionar um botão na linha de cada jogo para recalcular e exibir a resina estimada naquele momento. Entregue em 1.8.0.
- **Complexidade: baixa.** Atualização visual com os dados já carregados, conforme pedido de Cristian em 06/10/2026.
- **Decisão:** clicar não consulta nem grava no Supabase; conserva a resina digitada e as anotações, inclusive rascunhos. A ação Save continua registrando uma quantidade real e uma nova previsão.
- **Concluído quando:** clicar no botão atualiza apenas o jogo escolhido e mostra o valor calculado para o horário atual.
- **Teste local:** `npm run preview:profiles`, abrir `http://127.0.0.1:5501`, selecionar WuWa e salvar 175. Conferir `175/240`; depois de seis minutos, atualizar para `176/240`. Digitar outro valor/anotação sem salvar e atualizar conserva o rascunho. Recarregar calcula a estimativa a partir do último valor salvo; ao atingir o prazo, limita em `240/240`. Outro perfil sem resina salva mostra estimativa indisponível.

## 2. Usar imagem por URL para jogos novos

- [x] Adicionar ao formulário de jogo um campo opcional de URL da imagem. Quando estiver vazio, manter `img/default-icon.png` como imagem padrão.
- **Entregue em 1.3.0:** cadastro/edição com URL HTTPS, preservação de ícone interno e placeholder para falhas. Cobertura com HTML real em `uiIntegration.test.mjs`.
- **Concluído quando:** é possível cadastrar ou editar um jogo com imagem externa sem fazer upload, e uma URL vazia ou imagem indisponível não deixa um ícone quebrado na lista.

## 3. Separar os dados em perfis fixos

**Implementado na versão 1.6.0, validado localmente por Cristian:** três perfis: CRAN, Demo e Convidado. A migração conserva o estado principal no CRAN; Demo/Convidado começam vazios. Contratos, limite público e testes em [docs/profiles-phases.md](docs/profiles-phases.md).

- [x] Criar uma tela simples de entrada com perfis predefinidos, sem opção de cadastro.
- [x] Associar progresso/decisões ao perfil e mostrar somente seus jogos selecionados e tarefas, mantendo catálogo/capas compartilhados.
- [x] Associar os registros existentes ao perfil principal na migração e testar instalação nova/upgrade. A interface foi validada localmente. Na parte 4, o live foi reinstalado do zero por escolha de Cristian; RPCs, relacionamentos e sincronização foram conferidos. Validação da interface no destino e duas conexões reais permanecem pendentes.
- **Complexidade: média.** Envolve uma tela, filtros nas consultas e gravações e uma migração cuidadosa dos dados atuais; não exige implementar cadastro de usuários.
- **Concluído quando:** cada perfil mostra seus próprios jogos e tarefas no navegador e no celular; criar, editar ou excluir em um perfil não altera a lista do outro; os dados existentes continuam acessíveis no perfil principal.
- **Limite da solução:** essa entrada serve para organizar os dados, não para proteger a privacidade. Sem autenticação real, qualquer visitante pode escolher qualquer um dos três perfis; senhas ou PINs escritos no JavaScript também não protegeriam o banco. A futura tela de login deverá adicionar autenticação e políticas RLS por usuário em uma etapa separada.

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

**Entrega separada, somente levantamento inicial realizado:** plano em [docs/resin-alerts-plan.md](docs/resin-alerts-plan.md). Nenhum alerta ou notificação foi implementado junto da estimativa visual.

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

**Parte 4 implementada:** identidade por edição de GI/HSR/ZZZ e exclusão permanente dos importados vencidos por perfil em GI/HSR/ZZZ/WuWa/NTE. Commit e push autorizados em 06/10/2026. Testes, limites e reinstalação do live do zero em [docs/event-editions-expiry.md](docs/event-editions-expiry.md). Fallback chinês continua pendente; não marcar o MVP inteiro como concluído.

**Recorte implementado na versão 1.4.0:** importação automática em inglês dos cinco jogos, proteção de datas manuais, ignorados, filtros, fixtures, testes SQL/HTML e CI. WuWa/NTE têm identidade por edição e política por campo validada. A parte 4 completa identidade em GI/HSR/ZZZ e limpeza geral; os itens abaixo descrevem o MVP completo, incluindo o fallback chinês ainda pendente.

- [ ] Importar eventos atuais e futuros diretamente para a lista de tarefas quando existir uma data final utilizável. A revisão humana fica reservada aos eventos sem prazo utilizável nas fontes disponíveis.
- [ ] Preferir os dados em `en-US`; completar o prazo com o registro chinês do mesmo evento quando necessário. Se o calendário inglês estiver indisponível, usar o chinês quando disponível. Registrar a origem do prazo e manter a edição manual.
- [ ] Usar capa quando disponível e placeholder quando estiver ausente ou não carregar. A falta de capa ou de data inicial não impede a importação de um evento com prazo final utilizável.
- [ ] Manter o motor de sincronização, a tabela de candidatos e a gravação de tarefas no projeto atual. A tabela de candidatos continua registrando a origem, o vínculo com a tarefa e as decisões de ignorar; a tela de revisão mostra apenas as pendências de prazo.
- [x] Validar a mudança primeiro nos jogos já integrados, Genshin e HSR, e depois habilitar WuWa, ZZZ e NTE no mesmo fluxo. Os cinco jogos atuais usam a seleção por perfil entregue em 1.6.0. Endfield fica para uma expansão posterior, salvo mudança explícita de escopo.
- [x] Fazer uma sincronização inicial dos eventos atuais/futuros e reaproveitar o workflow existente, agora diário às 07h30 de Brasília (10h30 UTC). A aplicação lê as tarefas salvas no Supabase; abrir a página não precisa disparar uma importação completa.
- [x] Criar ou atualizar cada edição sem duplicar tarefas em novas execuções. Preservar a conclusão da mesma edição e as decisões de ignorar. Uma edição futura de um modo recorrente deve ter sua própria identidade e estado.
- [x] Implementar a proteção dos prazos ajustados manualmente. **Decisão aprovada:** atualizar automaticamente o prazo controlado pela API, mas preservar uma correção manual até o usuário optar por voltar à data da fonte.
- [x] Generalizar a limpeza de edições importadas vencidas para os jogos habilitados, preservando tarefas manuais e weeklies. Não excluir tarefas apenas porque um evento sumiu de uma resposta parcial da API.
- [x] Isolar falhas por jogo/fonte e registrar o resultado da sincronização. Falha de rede ou resposta inválida não apaga tarefas nem cria uma pendência de revisão para cada evento já conhecido.
- [ ] Verificar importação automática, fallback de prazo, ausência de capa/início, repetição da sincronização, eventos ignorados, correções manuais e troca de edição dos modos recorrentes.

- **Complexidade: média para automatizar o fluxo existente; alta para completar o fallback entre idiomas e cobrir os cinco jogos.** A expansão exige conferir os calendários de cada jogo e as peculiaridades de suas edições recorrentes.
- **Ponto a resolver antes do fallback por evento:** o contrato atual da API não fornece ID por atividade. Nomes e capas podem mudar entre idiomas; vários eventos podem compartilhar exatamente o início e o fim. Definir uma associação explícita entre os registros, com aliases por jogo quando necessário, e persistir a identidade escolhida. Não unir por posição da lista ou somente por datas. Usar o calendário chinês inteiro quando o inglês falha não resolve sozinho um evento sem prazo dentro de uma lista inglesa parcialmente preenchida.
- **Horários:** idioma não identifica servidor. Manter as conversões já conhecidas para América e aceitar o prazo original da fonte como fallback, com sua origem visível. WuWa/NTE usam bases explícitas por campo e edição; novas edições sem confirmação ficam em revisão. O NTE atual foi conferido nos anúncios globais 1.4; não extrapolar essa correspondência para versões futuras.
- **Dados existentes:** o live foi reinstalado do zero na parte 4 com autorização de Cristian. A política normal remove somente importados vencidos elegíveis, preservando tarefas manuais, recorrência e prazos pessoais futuros; reinstalar o banco não faz parte da sincronização diária.
- **Concluído quando:** eventos com prazo utilizável aparecem sem aprovação prévia, somente os sem prazo vão para revisão, repetir a sincronização não duplica nem desfaz decisões do usuário e as weeklies continuam independentes.

## 9. Manter somente weeklies na população inicial

**Implementado na versão 1.5.0:** catálogo de seis tarefas (Simulated Universe semanal por preferência explícita de Cristian), migração incremental, criação transacional por sigla e botão por jogo. Fontes, decisões e cenários em [docs/weekly-batches.md](docs/weekly-batches.md). Aplicação da migração e validação da interface, PostgREST e concorrência no destino permanecem etapas de implantação.

- [x] Substituir a lista de eventos fixos por definições de atividades semanais separadas dos dados vindos da API.
- [x] Resolver o jogo pela abreviação cadastrada, sem depender de IDs numéricos fixos, e calcular o próximo vencimento pela regra de reset semanal em vez de usar datas de 2025.
- [x] Permitir criar o lote de weeklies de um jogo sem repetir atividades já existentes. A operação deve funcionar mesmo quando a tabela já tiver tarefas de outros jogos.
- [x] Preservar a recorrência das weeklies e impedir que a limpeza de eventos importados as exclua.
- **Complexidade: média.** A implementação substitui a antiga dependência da tabela vazia por decisões persistidas por jogo. Cada lote inicial é registrado uma única vez, preservando tarefas existentes e exclusões posteriores; futuras adições ao catálogo exigirão uma decisão própria de atualização.
- **Concluído quando:** a população inicial cria apenas weeklies, com prazos atuais e jogos corretos, e executar novamente não duplica nem restaura atividades que o usuário decidiu remover.
- **Entregue em 1.6.0:** na seleção de jogos, oferecer a opção de criar o lote semanal. A preferência sobre criar/adiar é persistida por perfil e jogo; abrir a aplicação não recria o lote automaticamente.

## 10. Catálogo de jogos e seleção inicial — depois do MVP

**Base entregue em 1.6.0, validada localmente:** seleção por perfil do catálogo existente, filtros e oferta opcional de weeklies. Catálogo completo da API, variantes regionais e autenticação ficam para entregas posteriores.

- [ ] Evoluir o registro central de integração com chave da API, idiomas disponíveis e regras específicas por jogo, reaproveitando `eventGames.js`.
- [x] Separar os jogos disponíveis no catálogo dos jogos que o usuário acompanha, com seleção persistida por perfil.
- [ ] Incluir o catálogo completo suportado pela API, distinguindo variantes regionais quando existirem.
- [x] Criar a tela inicial para selecionar jogos e oferecer opcionalmente seus lotes de weeklies.
- [x] Usar a mesma seleção nas telas de jogos/resina, tarefas e revisão, e na materialização pessoal dos importados. Guardar a seleção por perfil; a sincronização continua atualizando as definições compartilhadas.
- [ ] Cadastrar novos jogos da expansão em bases já existentes: adicionar uma definição em `Game.js` não basta, porque a população atual de jogos só roda quando a tabela inteira está vazia.
- [ ] Tratar controle de resina como uma capacidade configurada por jogo. Ter um calendário na API não garante que seus parâmetros de resina estejam definidos no sistema.
- **Complexidade restante: alta.** A seleção e os filtros estão entregues. A expansão exige metadados, horários e resina por jogo, além de cadastro incremental e validação de cada integração.
- **Concluído quando:** escolher um jogo habilita seus dados e sua integração sem exigir cadastro manual de eventos, e todas as telas respeitam a seleção salva.

## 11. Identificar eventos recém-adicionados — prioridade baixa

- [ ] Mostrar uma indicação discreta como **Recém-adicionado**, baseada na primeira importação da edição para a lista de atividades.
- [ ] Definir por quanto tempo o indicador aparece. Uma atualização de prazo/capa ou uma nova sincronização não deve tornar o mesmo evento novo novamente.
- **Complexidade: baixa a média.** Precisa registrar quando a tarefa foi importada; `last_seen_at` do candidato representa sincronização e não serve como data de entrada na lista.

## 12. Paginar a lista de atividades

- [ ] Avaliar paginação quando o filtro por jogo não for suficiente para reduzir a rolagem. A primeira melhoria da versão 1.2 é o filtro por jogo.
- [ ] Paginar a consulta no Supabase, aplicando filtro por jogo antes do limite e ordenação estável por prazo e ID. Mostrar quantidade total e estados sem resultados/erro.
- [ ] Voltar à primeira página ao trocar de jogo e manter a página válida após ignorar/excluir uma atividade.
- **Complexidade: média.** Envolve consultas, navegação e tratamento das alterações na lista; esconder linhas no navegador não reduz a quantidade carregada do banco.

## 13. Favorite tasks — favoritas no topo

**Planejado, sem implementação:** próximo item S-1 em [docs/roadmap-priorities.md](docs/roadmap-priorities.md).

- [ ] Permitir marcar/desmarcar uma tarefa por uma estrela na lista de Tasks, com estado visual, nome acessível e operação por teclado.
- [ ] Persistir a preferência por perfil, sem alterar a definição compartilhada. Recarregar ou ocultar/reselecionar um jogo conserva a escolha; outro perfil tem suas próprias favoritas.
- [ ] Ordenar favoritas antes das demais, mantendo a ordem por prazo dentro dos dois grupos e um desempate estável. Ao desfavoritar, retornar à posição normal.
- [ ] Aplicar os filtros e a visibilidade de concluídas antes de exibir a lista. Favoritar não muda prazo, conclusão ou recorrência.
- [ ] Preservar favoritas nas correções da mesma edição, sincronizações e resets de recorrência. Uma edição nova começa sem herdar essa preferência.
- [ ] Testar isolamento dos perfis, persistência, ordenação, filtros, desfavoritar e falha de gravação sem deixar a estrela em um estado que não foi salvo.
- **Complexidade: baixa a média.** Reaproveita os contratos pessoais, mas exige persistência no banco e mudança na ordenação e na ação da lista.
- **Concluído quando:** a estrela persiste apenas no perfil escolhido, as favoritas visíveis ficam no topo e as demais regras da lista continuam funcionando.
