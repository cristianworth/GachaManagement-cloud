# Roadmap — prioridades por tier

Atualizado em 19/10/2026 conforme o pedido de Cristian. O objetivo é facilitar seu uso pessoal: um usuário frequente, poucos jogos e dados de baixa criticidade. Priorizar benefícios visíveis com ajustes pequenos na estrutura JavaScript/HTML/CSS. Esta lista registra trabalho futuro; sua ordem não autoriza implementar tudo.

Saíram da tierlist de implementação: perfis/seleção de jogos, sincronização diária, identidade por edição/limpeza de eventos, estimativa manual de resina, favoritas e lote de 16 definições/capas com recriação explícita. As migrações até 1.12.0 foram aplicadas por Cristian no Supabase em 09/10/2026; catálogos/leitura do lote responderam pela API. SweetAlert2 fechou em 1.12.1; menu lateral e tema Sangonomiya foram entregues até 1.13.2. Em 12/10/2026 os dois recortes S foram entregues em 1.14.0: paginação visual 20/10 e estimativa local por minuto. [Comportamento e validação](task-pagination-stamina.md); commit e push autorizados por Cristian. Histórico em [CHANGELOG.md](../CHANGELOG.md).

S = próximas melhorias de uso; A = alto retorno depois da base imediata; B = necessidade específica ou trabalho maior; C = acabamento ou mudança condicionada a evidência. Ordem dentro de cada tier indica preferência; complexidade é relativa, sem previsão de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / referência |
| --- | --- | --- | --- | --- |
| **A** | 1 | Estado diário de Games: Pendente / Voltar depois / Feito por hoje | Mostrar quais jogos ainda precisam de atenção, com ajuda opcional do Save de resina e sem esconder uma intenção de voltar. Posição sugerida para o novo item. | Média. [Proposta e decisões pendentes](#5-estado-diário-de-games--proposta). |
| **A** | 2 | Alerta de resina alvo com contagem regressiva | Benefício pessoal claro, depois de deixar a estimativa acompanhando o tempo. Alerta dentro do site; notificações com site fechado ficam separadas. | Média. TODO 6; [levantamento](resin-alerts-plan.md). |
| **B** | 1 | Calendário das próximas fases de Endstate Matrix | Necessário quando a próxima fase estiver disponível; requer fonte verificada e referência absoluta, sem inventar recorrência nem pedir datas na importação. | Média/alta. TODO 9.1; [limites](expanded-task-batch.md). |
| **B** | 2 | Avisos de manutenção e próximos banners | Informação útil, mas exige manutenção de datas e anúncios; começar com cadastro manual. | Média. TODO 7 e 7.1. |
| **B** | 3 | Ampliar catálogo da API/variantes regionais | Adicionar primeiro jogos que Cristian passar a acompanhar, com horários e metadados verificados; catálogo inteiro não é necessidade de escala. | Alta. TODO 10. |
| **B** | 4 | Fallback inglês/chinês | Avaliar diante de lacunas reais; associação entre edições precisa ser confiável. | Alta. Parte restante do TODO 8. |
| **B** | 5 | Poucos testes de navegador no CI e conferência do Pages | Complementa os testes existentes quando houver falha visual recorrente ou recorte de layout; não priorizar infraestrutura sobre os ajustes cotidianos. | Média. Aproveitar CI existente. |
| **C** | 1 | Favicon e consistência dos ícones restantes | Os ícones principais acompanham o menu; acabamento geral fica depois do uso. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Facilita identificar novidades sem alterar o fluxo principal. | Baixa/média. TODO 11. |
| **C** | 3 | Busca por nome de tarefa — opcional | Complemento se filtros e paginação ainda dificultarem encontrar uma atividade; não incluir automaticamente no primeiro recorte. | Baixa. Complemento futuro do TODO 12. |
| **C** | 4 | Paginação real da consulta no Supabase | Só promover com lentidão/crescimento medido. Exige filtros, ordenação e contagem na RPC, além da navegação. | Média. Segunda etapa do TODO 12. |

## Recortes e continuidade

**1. Paginação visual — entregue em 1.14.0.** Aplicar filtros por jogo/intervalo/conclusão e ordenar favoritas → prazo → ID antes de separar as páginas. Padrão de 20 com opção de 10; rodapé com intervalo/total e Anterior/Próxima. Mudança de filtro volta à primeira página. Concluir, favoritar ou excluir conserva a página válida; recuar quando a página ficar vazia. Contagens e ordenação consideram a lista filtrada inteira. Continuar carregando todas as tarefas deve ficar explícito: isso melhora a leitura, não reduz os registros consultados. Busca por nome é opcional e separada.

**2. Estimativa local — entregue em 1.14.0.** Enquanto Games estiver visível, recalcular a cada minuto com o horário atual e os minutos por unidade de cada jogo. Reutilizar a previsão salva; não incrementar um contador por tick, salvar automaticamente ou sobrescrever o valor digitado. Recalcular ao retornar à página, pois timers podem atrasar em segundo plano. Sem parâmetros/previsão válidos, conservar a mensagem de estimativa indisponível.

**3. Leitura periódica — entregue em 1.15.0 em 18/10/2026.** [Contrato e validação](silent-refresh.md). Intervalo inicial de 6 minutos para buscar dados do Supabase na tela visível; pausar em segundo plano e consultar ao retornar se a leitura estiver antiga. O intervalo é de sincronização da interface, não o tempo de regeneração de um jogo: não precisa de margem de 6,5/8,5 minutos para garantir a resina. Reaproveitar a atualização que preserva rascunhos. Evitar overlay global, consultas sobrepostas, troca de perfil e reconstrução durante edição/modal/gravação; manter linhas após falha. Atualizar somente o contexto exibido e conservar filtros/paginação. Esse fluxo não importa calendários das APIs dos jogos.

**4. Menu lateral — base entregue em 1.13.0.** Desktop com lateral estreita: nome do app, perfil ativo/Trocar perfil, Games, Tasks, Revisar eventos, Selecionar jogos e versão discreta. Usar ícones SVG simples com texto e destacar a rota atual. Celular com botão que abre/fecha o menu. Reaproveitar o seletor de perfil público e o Router; não implementar autenticação. Retirar View Tasks/Back to Games repetidos e manter criação, lote e filtros no conteúdo. Um contador de Tasks, se incluído, deve representar as pendências do perfil inteiro, não apenas a página exibida.

### 5. Estado diário de Games — proposta

**Pedido de Cristian em 19/10/2026:** oferecer a opção de, após salvar a resina, marcar a diária do jogo como feita quando a previsão de stamina cheia cair no próximo dia. Usar verde para o jogo concluído, evitar vermelho como estado normal de pendência e permitir um estado amarelo quando a diária estiver feita, mas ele ainda quiser voltar para fazer outra coisa. Somente planejamento autorizado neste pedido; o comportamento abaixo é uma recomendação para alinhamento.

**Objetivo:** responder “em quais jogos ainda preciso entrar hoje?”. Separar a conclusão da rotina da intenção de voltar: gastar resina, fazer a diária e encerrar as atividades do jogo são sinais relacionados, mas diferentes.

| Estado sugerido | Significado | Aparência proposta |
| --- | --- | --- |
| Pendente | A rotina do ciclo atual ainda não foi marcada como concluída. | Azul acinzentado, com texto/ícone; sem aparência de erro. |
| Voltar depois | A rotina foi concluída, mas ainda há algo que Cristian quer fazer. | Âmbar suave, com texto/ícone; continua visível como jogo que merece atenção. |
| Feito por hoje | A rotina foi concluída e Cristian não pretende voltar neste ciclo. | Verde suave com texto Done / Feito por hoje. |

**Comportamento recomendado:**

1. Um único controle compacto por jogo permite escolher o estado e desfazer uma marcação. Voltar depois é uma escolha intencional, sem exigir cadastrar uma tarefa ou preencher um motivo; as anotações existentes podem registrar o que falta. Usar cor no indicador/borda, mantendo o tema e a legibilidade, em vez de pintar todo o card com uma cor forte. Não esconder nem reordenar jogos neste primeiro recorte.
2. A automação pelo Save é opcional por jogo e perfil. Quando habilitada, uma gravação bem-sucedida de resina com previsão elegível pode marcar Feito por hoje, assumindo a rotina pessoal de salvar depois de jogar. Isso é uma conveniência escolhida por Cristian, não uma confirmação obtida da conta do jogo. Permitir marcar manualmente mesmo quando a resina não satisfizer o critério.
3. Voltar depois tem prioridade sobre essa automação: salvar novamente não pode trocar âmbar por verde. Só a escolha explícita de encerrar o jogo remove essa intenção no ciclo atual. Uma previsão posterior que deixe de satisfazer o critério também não desfaz sozinha uma rotina já marcada como feita.
4. Recomenda-se comparar a previsão com o **próximo reset diário do jogo**, e não apenas com a meia-noite do navegador. Lotar amanhã às 01h ainda pode exigir voltar antes de um reset às 04h; lotar depois de amanhã também deveria satisfazer a condição. Comparar instantes completos, incluindo mês/ano, com limite inclusivo. Horários deste exemplo são hipotéticos. Confirmar as regras dos jogos antes de implementar; não presumir que um reset usado por um evento serve para toda rotina. A decisão entre essa recomendação e a regra original de “próximo dia” continua aberta.
5. O estado pertence ao ciclo diário do jogo e ao perfil selecionado. No próximo reset, a rotina volta a Pendente; anotações permanecem. Identificar o ciclo salvo permite reconhecer a virada ao abrir/retornar à tela, sem depender de o navegador ficar aberto. Uma gravação atravessando o reset deve usar um único instante de referência. Sem regra de reset confirmada, suspender a automação e alinhar o ciclo antes de ativá-la, sem solicitar datas a cada Save.
6. O indicador de resina continua independente: Feito por hoje não esconde uma previsão de lotar nem impede um alerta futuro. A passagem do relógio, a estimativa por minuto e a leitura silenciosa não concluem a rotina por conta própria.
7. Preservar o contrato atual: `handleGameSave` em `js/ui/gameUI.js` salva resina **e anotações** e calcula a nova previsão; `updateGame` usa a RPC pública `save_profile_game`. Antes de implementar, distinguir o registro de resina de um Save apenas de anotações para evitar conclusão acidental. Falha na gravação não pode anunciar conclusão; evitar gravar resina e estado em operações separadas que possam ficar pela metade.
8. Persistir a preferência e o estado por jogo/perfil, para funcionar entre celular, computador e recarregamentos; não guardar apenas no navegador nem na definição compartilhada do jogo. Avaliar a menor extensão dos contratos públicos existentes, com schema/migração se necessário. Esta funcionalidade não deve ser tratada antecipadamente como alteração só de frontend.

**Relação com Tasks:** recomenda-se que esta primeira entrega marque a rotina em Games, sem concluir automaticamente tarefas Daily nem limpar o To-do. Um jogo pode ter várias tarefas diárias ou nenhuma; resina não identifica qual foi feita. Vincular uma tarefa específica pode ser avaliado separadamente por identidade explícita, sem procurar por nome ou concluir todas as tarefas do jogo. Confirmar com Cristian se “marcar a diária” também pretende alterar Tasks.

**Primeiro recorte sugerido:** alinhar estados, ciclo e critério temporal; implementar os três estados manuais com persistência por perfil. Acrescentar em seguida a automação opcional do Save, usando o mesmo modelo. Não acoplar alertas, ordenação ou novas integrações de API.

**Validação futura:** relógio fixo antes/no/depois do reset, virada de mês/ano, previsão mais de um dia à frente, Save apenas de anotações, falha sem conclusão, âmbar preservado após novo Save, desfazer manual, troca de perfil, recarregamento/outro dispositivo e ausência de escrita pelos timers. Conferir texto/ícone, contraste e controle no celular; cor não pode ser a única informação.

## Critérios e sequência

Paginação visual e estimativa local foram entregues em 1.14.0, com testes e conferência visual concluídos. Menu lateral já possui sua base entregue; a leitura periódica silenciosa foi entregue em 1.15.0 em 18/10/2026, com testes aprovados. **Ajustes pontuais no celular foram concluídos em 1.15.1 em 19/10/2026**: alvos de toque maiores, filtros/anotações mais legíveis e conferência de tabelas, formulários e lote, preservando o desktop. O item saiu das prioridades; novos refinamentos dependem de uma necessidade concreta observada no uso. Conferir a necessidade real antes de acrescentar busca, consultas paginadas ou automação de fontes. Não adicionar dependência para paginação, timers ou navegação simples.

Paginação SQL, se necessária depois, deve usar contrato público por perfil, com todos os filtros antes do limite, ordenação estável e total correspondente. Não limitar uma página para só então filtrar suas tarefas no navegador.

Para validação futura: conferir navegação/filtros em listas com mais de 20 itens; edição preservada durante atualização; resina após retorno de aba; perfil/rota e menu no celular. Seguir a política de testes em [project-conventions.md](project-conventions.md). Não criar arquitetura de escala nem converter essas propostas em implementação sem pedido.
