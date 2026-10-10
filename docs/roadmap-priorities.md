# Roadmap — prioridades por tier

Atualizado em 10/10/2026 conforme o pedido de Cristian. O objetivo é facilitar seu uso pessoal: um usuário frequente, poucos jogos e dados de baixa criticidade. Priorizar benefícios visíveis com ajustes pequenos na estrutura JavaScript/HTML/CSS. Esta lista registra trabalho futuro; sua ordem não autoriza implementar tudo.

Saíram da tierlist de implementação: perfis/seleção de jogos, sincronização diária, identidade por edição/limpeza de eventos, estimativa manual de resina, favoritas e lote de 16 definições/capas com recriação explícita. As migrações até 1.12.0 foram aplicadas por Cristian no Supabase em 09/10/2026; catálogos/leitura do lote responderam pela API. SweetAlert2 fecha em 1.12.1. Conferência visual dos avisos permanece como verificação da entrega, separada de novas funcionalidades. Histórico em [CHANGELOG.md](../CHANGELOG.md).

S = próximas melhorias de uso; A = alto retorno depois da base imediata; B = necessidade específica ou trabalho maior; C = acabamento ou mudança condicionada a evidência. Ordem dentro de cada tier indica preferência; complexidade é relativa, sem previsão de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / referência |
| --- | --- | --- | --- | --- |
| **S** | 1 | Paginação visual de Tasks: 20 itens, opção de 10 | Reduz a rolagem agora, mantendo a consulta e os filtros existentes. Para o volume pessoal atual, limitar a exibição é suficiente como primeiro recorte. | Baixa/média. TODO 12. |
| **S** | 2 | Recalcular a resina estimada a cada minuto | Atualiza o número exibido usando a previsão salva, sem consultas/escritas periódicas e sem alterar campos em edição. | Baixa. TODO 1.2. |
| **A** | 1 | Atualização silenciosa do banco a cada 6 minutos enquanto visível | Recebe alterações de outra aba/celular. Complementa a estimativa local; preserva rascunhos, filtros e página atual. | Média. TODO 1.3. |
| **A** | 2 | Menu lateral com perfil ativo e ícones/texto | Unifica Games, Tasks e revisão, retirando botões repetidos de navegação; no celular vira menu recolhido. | Média. TODO 14; aproveita as rotas/perfis existentes. |
| **A** | 3 | Ajustes pontuais no celular | Conferir tabelas, áreas de toque, filtros e formulários em cada recorte de uso. | Baixa/média por recorte. TODO 5. |
| **A** | 4 | Alerta de resina alvo com contagem regressiva | Benefício pessoal claro, depois de deixar a estimativa acompanhando o tempo. Alerta dentro do site; notificações com site fechado ficam separadas. | Média. TODO 6; [levantamento](resin-alerts-plan.md). |
| **B** | 1 | Calendário das próximas fases de Endstate Matrix | Necessário quando a próxima fase estiver disponível; requer fonte verificada e referência absoluta, sem inventar recorrência nem pedir datas na importação. | Média/alta. TODO 9.1; [limites](expanded-task-batch.md). |
| **B** | 2 | Avisos de manutenção e próximos banners | Informação útil, mas exige manutenção de datas e anúncios; começar com cadastro manual. | Média. TODO 7 e 7.1. |
| **B** | 3 | Ampliar catálogo da API/variantes regionais | Adicionar primeiro jogos que Cristian passar a acompanhar, com horários e metadados verificados; catálogo inteiro não é necessidade de escala. | Alta. TODO 10. |
| **B** | 4 | Fallback inglês/chinês | Avaliar diante de lacunas reais; associação entre edições precisa ser confiável. | Alta. Parte restante do TODO 8. |
| **B** | 5 | Poucos testes de navegador no CI e conferência do Pages | Complementa os testes existentes quando houver falha visual recorrente ou recorte de layout; não priorizar infraestrutura sobre os ajustes cotidianos. | Média. Aproveitar CI existente. |
| **C** | 1 | Favicon e consistência dos ícones restantes | Os ícones principais acompanham o menu; acabamento geral fica depois do uso. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Facilita identificar novidades sem alterar o fluxo principal. | Baixa/média. TODO 11. |
| **C** | 3 | Busca por nome de tarefa — opcional | Complemento se filtros e paginação ainda dificultarem encontrar uma atividade; não incluir automaticamente no primeiro recorte. | Baixa. Complemento futuro do TODO 12. |
| **C** | 4 | Paginação real da consulta no Supabase | Só promover com lentidão/crescimento medido. Exige filtros, ordenação e contagem na RPC, além da navegação. | Média. Segunda etapa do TODO 12. |

## Recortes propostos

**1. Paginação visual.** Aplicar filtros por jogo/intervalo/conclusão e ordenar favoritas → prazo → ID antes de separar as páginas. Padrão de 20 com opção de 10; rodapé com intervalo/total e Anterior/Próxima. Mudança de filtro volta à primeira página. Concluir, favoritar ou excluir conserva a página válida; recuar quando a página ficar vazia. Contagens e ordenação consideram a lista filtrada inteira. Continuar carregando todas as tarefas deve ficar explícito: isso melhora a leitura, não reduz os registros consultados. Busca por nome é opcional e separada.

**2. Estimativa local.** Enquanto Games estiver visível, recalcular a cada minuto com o horário atual e os minutos por unidade de cada jogo. Reutilizar a previsão salva; não incrementar um contador por tick, salvar automaticamente ou sobrescrever o valor digitado. Recalcular ao retornar à página, pois timers podem atrasar em segundo plano. Sem parâmetros/previsão válidos, conservar a mensagem de estimativa indisponível.

**3. Leitura periódica.** Intervalo inicial de 6 minutos para buscar dados do Supabase na tela visível; pausar em segundo plano e consultar ao retornar se a leitura estiver antiga. O intervalo é de sincronização da interface, não o tempo de regeneração de um jogo: não precisa de margem de 6,5/8,5 minutos para garantir a resina. Reaproveitar a atualização que preserva rascunhos. Evitar overlay global, consultas sobrepostas, troca de perfil e reconstrução durante edição/modal/gravação; manter linhas após falha. Atualizar somente o contexto exibido e conservar filtros/paginação. Esse fluxo não importa calendários das APIs dos jogos.

**4. Menu lateral.** Desktop com lateral estreita: nome do app, perfil ativo/Trocar perfil, Games, Tasks, Revisar eventos, Selecionar jogos e versão discreta. Usar ícones SVG simples com texto e destacar a rota atual. Celular com botão que abre/fecha o menu. Reaproveitar o seletor de perfil público e o Router; não implementar autenticação. Retirar View Tasks/Back to Games repetidos e manter criação, lote e filtros no conteúdo. Um contador de Tasks, se incluído, deve representar as pendências do perfil inteiro, não apenas a página exibida.

## Critérios e sequência

Realizar cada recorte separadamente: paginação visual → estimativa local → leitura periódica → menu lateral. Refinamentos mobile podem acompanhar cada recorte. Conferir a necessidade real antes de acrescentar busca, consultas paginadas ou automação de fontes. Não adicionar dependência para paginação, timers ou navegação simples.

Paginação SQL, se necessária depois, deve usar contrato público por perfil, com todos os filtros antes do limite, ordenação estável e total correspondente. Não limitar uma página para só então filtrar suas tarefas no navegador.

Para validação futura: conferir navegação/filtros em listas com mais de 20 itens; edição preservada durante atualização; resina após retorno de aba; perfil/rota e menu no celular. Seguir a política de testes em [project-conventions.md](project-conventions.md). Não criar arquitetura de escala nem converter essas propostas em implementação sem pedido.
