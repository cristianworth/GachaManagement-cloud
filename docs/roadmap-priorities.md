# Roadmap — prioridades por tier

Atualizado em 25/10/2026 conforme o pedido de Cristian. O objetivo é facilitar seu uso pessoal: um usuário frequente, poucos jogos e dados de baixa criticidade. Priorizar benefícios visíveis com ajustes pequenos na estrutura JavaScript/HTML/CSS. Esta lista registra trabalho futuro; sua ordem não autoriza implementar tudo.

Saíram da tierlist de implementação: perfis/seleção de jogos, sincronização diária, identidade por edição/limpeza de eventos, estimativa manual de resina, favoritas e lote de 16 definições/capas com recriação explícita. As migrações até 1.12.0 foram aplicadas por Cristian no Supabase em 09/10/2026; catálogos/leitura do lote responderam pela API. SweetAlert2 fechou em 1.12.1; menu lateral e tema Sangonomiya foram entregues até 1.13.2. Em 12/10/2026 os dois recortes S foram entregues em 1.14.0: paginação visual 20/10 e estimativa local por minuto. [Comportamento e validação](task-pagination-stamina.md); commit e push autorizados por Cristian. Histórico em [CHANGELOG.md](../CHANGELOG.md).

S = próximas melhorias de uso; A = alto retorno depois da base imediata; B = necessidade específica ou trabalho maior; C = acabamento ou mudança condicionada a evidência. Ordem dentro de cada tier indica preferência; complexidade é relativa, sem previsão de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / referência |
| --- | --- | --- | --- | --- |
| **A** | 1 | Alerta de resina alvo com contagem regressiva | Benefício pessoal claro, depois de deixar a estimativa acompanhando o tempo. Alerta dentro do site; notificações com site fechado ficam separadas. | Média. TODO 6; [levantamento](resin-alerts-plan.md). |
| **A** | 2 | Favoritas de Tasks também em Games | Ver atividades escolhidas junto ao To-do de cada jogo, reutilizando as estrelas e os dados do perfil. Lista compacta abaixo das anotações; disposição lado a lado depende de conferência em telas largas. | Baixa/média. TODO 13.1; proposta, sem implementação. |
| **B** | 1 | Calendário das próximas fases de Endstate Matrix | Necessário quando a próxima fase estiver disponível; requer fonte verificada e referência absoluta, sem inventar recorrência nem pedir datas na importação. | Média/alta. TODO 9.1; [limites](expanded-task-batch.md). |
| **B** | 2 | Ampliar catálogo da API/variantes regionais | Adicionar primeiro jogos que Cristian passar a acompanhar, com horários e metadados verificados; catálogo inteiro não é necessidade de escala. | Alta. TODO 10. |
| **B** | 3 | Fallback inglês/chinês | Avaliar diante de lacunas reais; associação entre edições precisa ser confiável. | Alta. Parte restante do TODO 8. |
| **B** | 4 | Poucos testes de navegador no CI e conferência do Pages | Complementa os testes existentes quando houver falha visual recorrente ou recorte de layout; não priorizar infraestrutura sobre os ajustes cotidianos. | Média. Aproveitar CI existente. |
| **C** | 1 | Favicon e consistência dos ícones restantes | Os ícones principais acompanham o menu; acabamento geral fica depois do uso. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Facilita identificar novidades sem alterar o fluxo principal. | Baixa/média. TODO 11. |
| **C** | 3 | Busca por nome de tarefa — opcional | Complemento se filtros e paginação ainda dificultarem encontrar uma atividade; não incluir automaticamente no primeiro recorte. | Baixa. Complemento futuro do TODO 12. |
| **C** | 4 | Paginação real da consulta no Supabase | Só promover com lentidão/crescimento medido. Exige filtros, ordenação e contagem na RPC, além da navegação. | Média. Segunda etapa do TODO 12. |

## Recortes e continuidade

**1. Paginação visual — entregue em 1.14.0.** Aplicar filtros por jogo/intervalo/conclusão e ordenar favoritas → prazo → ID antes de separar as páginas. Padrão de 20 com opção de 10; rodapé com intervalo/total e Anterior/Próxima. Mudança de filtro volta à primeira página. Concluir, favoritar ou excluir conserva a página válida; recuar quando a página ficar vazia. Contagens e ordenação consideram a lista filtrada inteira. Continuar carregando todas as tarefas deve ficar explícito: isso melhora a leitura, não reduz os registros consultados. Busca por nome é opcional e separada.

**2. Estimativa local — entregue em 1.14.0.** Enquanto Games estiver visível, recalcular a cada minuto com o horário atual e os minutos por unidade de cada jogo. Reutilizar a previsão salva; não incrementar um contador por tick, salvar automaticamente ou sobrescrever o valor digitado. Recalcular ao retornar à página, pois timers podem atrasar em segundo plano. Sem parâmetros/previsão válidos, conservar a mensagem de estimativa indisponível.

**3. Leitura periódica — entregue em 1.15.0 em 18/10/2026.** [Contrato e validação](silent-refresh.md). Intervalo inicial de 6 minutos para buscar dados do Supabase na tela visível; pausar em segundo plano e consultar ao retornar se a leitura estiver antiga. O intervalo é de sincronização da interface, não o tempo de regeneração de um jogo: não precisa de margem de 6,5/8,5 minutos para garantir a resina. Reaproveitar a atualização que preserva rascunhos. Evitar overlay global, consultas sobrepostas, troca de perfil e reconstrução durante edição/modal/gravação; manter linhas após falha. Atualizar somente o contexto exibido e conservar filtros/paginação. Esse fluxo não importa calendários das APIs dos jogos.

**4. Menu lateral — base entregue em 1.13.0.** Desktop com lateral estreita: nome do app, perfil ativo/Trocar perfil, Games, Tasks, Revisar eventos, Selecionar jogos e versão discreta. Usar ícones SVG simples com texto e destacar a rota atual. Celular com botão que abre/fecha o menu. Reaproveitar o seletor de perfil público e o Router; não implementar autenticação. Retirar View Tasks/Back to Games repetidos e manter criação, lote e filtros no conteúdo. Um contador de Tasks, se incluído, deve representar as pendências do perfil inteiro, não apenas a página exibida.

### 5. Estado diário de Games — entregue em 1.16.0

Concluído em 22/10/2026 e retirado das prioridades: Pendente / Voltar depois / Feito por hoje por jogo e perfil; Save de resina alterada conclui automaticamente, e Voltar depois é uma escolha manual. O estado volta a Pendente no reset do jogo; Endfield e siglas personalizadas usam 06:00 de Brasília por escolha de Cristian. A ordenação considera estado e depois a previsão de stamina cheia. Tasks continua independente; não há configuração extra para habilitar o automatismo.

[Contrato final, persistência, horários, validação e Para testar](game-daily-state.md). Reutiliza os contratos públicos existentes, sem nova migração ou dependência. A proposta original de condicionar a conclusão ao dia da previsão e de preservar âmbar após uma resina alterada foi substituída pela orientação explícita de Cristian para esta entrega.

### 6. Favoritas em Games — proposta

Subir o To-do na área de anotações de cada jogo e mostrar abaixo uma lista compacta das atividades favoritas daquele jogo no perfil selecionado. As estrelas e a conclusão continuam pertencendo às Tasks; exibir favoritas em Games não altera o estado diário do jogo. A proposta inicial é mostrar somente pendentes, ordenadas por prazo, com até três itens e acesso a Tasks para consultar as demais; esse limite e a navegação ainda precisam de alinhamento e conferência visual.

A área de anotações no desktop tem largura mínima de 190 px, o que favorece empilhar os dois conteúdos. Avaliar lado a lado somente em telas largas; no celular, manter To-do e favoritas em sequência, sem rolagem horizontal ou expansão ilimitada do card. Reutilizar uma leitura pública das tarefas por perfil e agrupá-las por jogo, preservando rascunhos durante atualizações. Detalhamento no TODO 13.1. Nenhuma interface foi alterada neste levantamento.

## Critérios e sequência

**Agenda e notificações entregues em 1.17.0, em 25/10/2026**, retiradas das prioridades ativas: agenda compartilhada, leitura/preferências por perfil, filtros por jogo/tipo e imagens nos dez banners. Games/Tasks concentram a navegação; Eventos/Agenda ficam na engrenagem e Selecionar jogos em Games. [Contrato e validação](game-notices.md). [Integração automática de fontes](notification-sources-review.md) permanece uma proposta futura e não faz parte da conclusão do cadastro manual.

Paginação visual e estimativa local foram entregues em 1.14.0, com testes e conferência visual concluídos. Menu lateral já possui sua base entregue; a leitura periódica silenciosa foi entregue em 1.15.0 em 18/10/2026, com testes aprovados. **Ajustes pontuais no celular foram concluídos em 1.15.1 em 19/10/2026**: alvos de toque maiores, filtros/anotações mais legíveis e conferência de tabelas, formulários e lote, preservando o desktop. O item saiu das prioridades; novos refinamentos dependem de uma necessidade concreta observada no uso. Conferir a necessidade real antes de acrescentar busca, consultas paginadas ou automação de fontes. Não adicionar dependência para paginação, timers ou navegação simples.

Paginação SQL, se necessária depois, deve usar contrato público por perfil, com todos os filtros antes do limite, ordenação estável e total correspondente. Não limitar uma página para só então filtrar suas tarefas no navegador.

Para validação futura: conferir navegação/filtros em listas com mais de 20 itens; edição preservada durante atualização; resina após retorno de aba; perfil/rota e menu no celular. Seguir a política de testes em [project-conventions.md](project-conventions.md). Não criar arquitetura de escala nem converter essas propostas em implementação sem pedido.
