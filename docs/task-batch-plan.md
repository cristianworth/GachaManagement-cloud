# Plano — Lote único de tarefas

Pedido de Cristian em 08/10/2026. **Este documento planeja a próxima implementação; não descreve uma interface já entregue.** O commit intermediário mantém a versão 1.9.2 e o changelog em “Não publicado”, sem push, conforme escolha explícita de Cristian. Nenhuma alteração no Supabase live faz parte deste planejamento.

## Objetivo e entregas recomendadas

Na interface, apresentar somente **Carregar Lote**, com uma ajuda curta: “Adiciona as atividades padrão dos jogos selecionados neste perfil, preservando tarefas existentes e exclusões.” O filtro de jogo da lista não limita essa ação. O usuário não precisa ver o inventário completo na entrega inicial.

1. **Unificar os controles dos nove itens implementados.** Substituir o botão semanal por jogo e o formulário separado GI/NTE por uma entrada única. Manter weekly/endgame como categorias internas, com identidades e recorrências próprias. Usar uma operação SQL transacional para os jogos habilitados, sem encadear gravações parciais no frontend. O próximo prazo NTE continua necessário quando ainda não houver referência válida; nessa situação, abrir uma confirmação curta do prazo antes de gravar. Depois de uma referência válida, o carregamento normal pode ser um clique.
2. **Ampliar para 14 itens ativos, após conferir calendário.** Acrescentar Deadly Assault, Shiyu Defense, Endstate Matrix, Whimpering Wastes e Tower of Adversity. Não transformar os contadores restantes em intervalos. Modos sem data/hora regional utilizável ficam pendentes de calendário, sem prazo inventado. A entrega que os ativa deve resolver essa pendência antes de anunciar “carrega tudo”.
3. **Personalização futura, em entrega separada.** Ao lado de Carregar Lote, oferecer **Escolher itens…**. Um modal com grupos por jogo, checkboxes, “Selecionar todos” e resumo do que será criado/preservado. Não criar uma página nova inicialmente: a seleção é pequena e o modal conserva o contexto de Tasks. Tooltip serve apenas como explicação, com acesso também por toque/teclado; não deve conter controles essenciais.

O pedido atual é processamento, documentação e planejamento. A unificação e os cinco novos modos ainda não foram implementados. Não alterar a sincronização diária nem importar novamente eventos da API ao apertar Carregar Lote.

## Inventário único

**Hoje implementados: nove itens de lote** (seis weeklies + três desafios). **Planejados: cinco adicionais.** **HSR: três reservas inativas**, já atendidas pela API. O catálogo documentado soma 17 definições; a meta do lote padrão é 14 ativas, não 17. Os números contam definições, não todas as edições simultâneas da API.

| Jogo | Definição | Situação atual | Regra / pendência |
| --- | --- | --- | --- |
| HSR | Echo of War | Weekly implementada | 7 dias, segunda às 09:00 UTC / 06:00 Brasília |
| HSR | Simulated Universe | Weekly implementada | 7 dias por preferência pessoal de Cristian; não é confirmação do reset das recompensas |
| WuWa | Weekly Boss | Weekly implementada | 7 dias, segunda às 09:00 UTC / 06:00 Brasília |
| WuWa | Fantasies of the Thousand Gateways | Weekly implementada | 7 dias, mesma referência semanal |
| ZZZ | Hollow Zero | Weekly implementada | 7 dias, mesma referência semanal |
| ZZZ | Notorious Hunt | Weekly implementada | 7 dias, mesma referência semanal |
| GI | Imaginarium Theater | Desafio implementado localmente | Dia 1º, 09:00 UTC / 06:00 Brasília; horário adotado para lembrete |
| GI | Spiral Abyss | Desafio implementado localmente | Lembrete no dia 15, 09:00 UTC / 06:00 Brasília; reset oficial dia 16 |
| NTE | Beyond the Rails | Desafio implementado localmente | 14 dias desde o próximo prazo informado; âncora atual regional ainda não conferida |
| ZZZ | Deadly Assault | Novo, planejado | Referência histórica: sexta a cada 14 dias; conferir a âncora e o horário da edição na América |
| ZZZ | Shiyu Defense | Novo, planejado | Referência histórica: sexta a cada 14 dias, alternada com Deadly Assault; não aplicar regra antiga de dias 1/16 |
| WuWa | Endstate Matrix | Novo, planejado | Calendário por fase/versão, com fim explícito; não repetir a cada 33 dias nem presumir 42 |
| WuWa | Whimpering Wastes | Novo, planejado | Referência histórica: 28 dias; conferir fase recorrente, próxima âncora e horário na América |
| WuWa | Tower of Adversity | Novo, planejado | Hazard Zone recorrente: referência histórica de 28 dias; não repetir zonas permanentes |
| HSR | Pure Fiction | API; reserva inativa | Manter por edição na API; alternativa documentada/comentada, sem criação pelo lote |
| HSR | Apocalyptic Shadow | API; reserva inativa | Mesmo tratamento, sem duplicar ou substituir eventos existentes |
| HSR | Memory of Chaos | API; reserva inativa | Mesmo tratamento; não supor intervalo universal a partir do tempo restante |

Catálogo semanal atual: `js/data/weeklyTasks.js`. Catálogo GI/NTE atual: `db/migrations/2026-10-08-endgame-batch.sql` e seção correspondente em `db/schema.sql`. Não existe ainda um catálogo físico unificado. A próxima implementação deve concentrar a definição lógica com chaves estáveis, jogo, categoria, origem, estado ativo/inativo e regra de calendário; validar a correspondência com SQL para evitar listas divergentes. HSR deve usar um estado inativo explícito (ou bloco comentado de referência), sem ativação automática quando uma consulta à API falhar.

## Contadores fornecidos por Cristian

Recebidos nesta conversa em 08/10/2026. A data/hora em que foram observados no jogo não foi informada. `xh` significa horas restantes não especificadas. Os valores abaixo são **evidência fornecida pelo usuário, não datas finais verificadas**.

| Jogo | Modo | Texto fornecido |
| --- | --- | --- |
| ZZZ | Deadly Assault | 1d xh left |
| ZZZ | Shiyu Defense | 7d xh left |
| WuWa | Endstate Matrix | 33d xh left |
| WuWa | Whimpering Wastes | 17d xh left |
| WuWa | Tower of Adversity | 3d xh left |
| GI | Imaginarium Theater | 23d xh left |
| GI | Spiral Abyss | 7d xh left |
| HSR | Pure Fiction | 10d xh left |
| HSR | Apocalyptic Shadow | 38d xh left |
| HSR | Memory of Chaos | 24d xh left |
| NTE | Beyond the Rails | 12d xh left |

Um contador não informa sozinho o intervalo completo, o instante de captura nem o horário final. As horas restantes podem estar relacionadas ao reset, mas isso precisa de confirmação para cada modo; Endstate Matrix pode encerrar perto da manutenção, diferente do reset diário. Não somar “dias restantes” ao momento em que o botão for clicado: isso deslocaria os prazos a cada carregamento.

Antes de ativar os novos modos, registrar uma **data/hora absoluta e a região América**, além da recorrência. Se vier somente do jogo, registrar a leitura como confirmação manual, não como verificação independente na web. Manter o lembrete antecipado do Abismo no dia 15, escolha já aprovada; o contador real do jogo não muda essa decisão silenciosamente.

## Consulta das APIs e referências

Consulta pública somente leitura realizada nesta entrega, sem sincronização, escrita no live ou alteração das fixtures:

| Fonte | Atividades recebidas | Correspondências dos desafios listados |
| --- | --- | --- |
| GI | 8 | Nenhuma por nome |
| HSR | 15 | Seis edições, incluindo uma vencida e edições futuras, dos três modos |
| ZZZ | 12 | Nenhuma por nome |
| WuWa | 12 | Nenhuma por nome |
| NTE | 9 | Nenhuma por nome |

URLs são as do registro `js/events/eventGames.js` (StarRailAssistant `*-en-US.json`). Ausência por nome nesta amostra não garante ausência permanente da API nem comprova que outro nome representa o mesmo modo. Não usar falha/ausência momentânea como autorização para gerar fallback.

No HSR, o JSON retornou Pure Fiction: Domain Genesis até 19/10/2026, Memory of Chaos: Crossing the Afterlife até 02/11/2026 e Apocalyptic Shadow: Dominance of Oblivion até 16/11/2026, com horários brutos de fim `03:59:59`, além das próximas edições. São campos da fonte, não novos horários regionais conferidos nesta entrega. Os períodos retornados não são todos idênticos; não criar fallback fixo de 42 dias por suposição.

Referências consultadas por busca em 08/10/2026:

- [Deadly Assault — Game8](https://game8.co/games/Zenless-Zone-Zero/archives/489103): conteúdo indexado de abril de 2026 descreve sexta a cada duas semanas.
- [Shiyu Defense — Game8](https://game8.co/games/Zenless-Zone-Zero/archives/457183): seção de reset indexada de abril descreve sexta a cada duas semanas. A mesma página conserva texto antigo de dias 1/16; esse trecho não deve virar regra de produção.
- [Tower of Adversity — Game8](https://game8.co/games/Wuthering-Waves/archives/453474): conteúdo indexado de março descreve Hazard Zone em ciclos de 28 dias.
- [Whimpering Wastes — Game8](https://game8.co/games/Wuthering-Waves/archives/498614): conteúdo indexado de abril mostra fases antigas; não confirma o próximo prazo de outubro.
- [Endstate Matrix — Game8](https://game8.co/games/Wuthering-Waves/archives/572518): conteúdo indexado de março descreve fases por versão, término próximo da atualização e compara Whimpering Wastes/ToA a ciclos de 28 dias. “7 dias depois da atualização” descreve o início de uma fase, não repetição semanal.

A abertura direta dessas cinco páginas falhou com HTTP 402; o levantamento usa o conteúdo indexado retornado pela busca. Isso é suficiente para identificar cuidados do modelo, mas **não confirma a edição atual, âncora ou horário América**. Para GI e NTE, evidências e limitações anteriores permanecem em [endgame-batch.md](endgame-batch.md).

## Comportamento e estado a preservar

- Carregar Lote significa carregar as definições ativas elegíveis dos jogos habilitados no perfil. Não significa sincronizar a API, restaurar exclusões ou alterar recorrências de homônimos.
- Um lote unificado na interface não exige fundir identidades ou transformar todos os modos em Weekly. Manter regras semanais, mensais, intervalos ancorados e calendário por fase separados internamente.
- Aproveitar os contratos existentes dentro de uma transação SQL. Não reabrir lotes já registrados nem reinterpretar tarefas ausentes como nunca criadas. O registro atual é por jogo; a seleção futura precisará de decisões por definição para distinguir itens adiados de itens removidos.
- Na personalização futura, um item desmarcado para adiar não equivale a exclusão permanente. “Carregar tudo” respeita exclusões anteriores. Restauração deve ser ação explícita própria, preservando a política já combinada.
- Endstate Matrix deve usar o fim verificado da fase atual, sem repetição automática presumida. A próxima fase precisará de outra referência de calendário; automatizá-la exige fonte confiável ou manutenção explícita desse calendário. Não rotular isso como ciclo fixo de 33 dias.
- Preferir HSR pela API, com identidade e prazo por edição. Um fallback futuro exige ativação deliberada e reconciliação quando a API voltar; comparar apenas “Pure Fiction” com “Pure Fiction: nome da edição” não impede duplicatas com segurança.

## Testes da próxima implementação

Na entrega de unificação, testar uma única ação/RPC para todos os jogos habilitados, sem dependência do filtro; perfis isolados; clique duplo; preservação de conclusão/favorita/imagem/prazo/recorrência; nenhuma recriação de excluídos; rollback completo se um jogo falhar; retry depois de resposta perdida e depois de falha na leitura da lista. Não repetir a suíte completa a cada ajuste: etapa 1 focada e etapa 2 no fechamento MINOR.

Na expansão, testar a âncora e os horários UTC de cada novo modo, ciclos perdidos/DST, fases com intervalo variável e a ausência de fallback HSR. Calendário sem base válida deve interromper a criação com explicação, sem gravar dados parcialmente.

Para testar a versão intermediária já implementada, usar o roteiro de [endgame-batch.md](endgame-batch.md). Os botões continuam separados neste commit. Nenhuma tela, tooltip ou modal novo foi implementado apenas por este planejamento.
