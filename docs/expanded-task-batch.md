# Expansão do Lote — ZZZ e WuWa

Entrega **1.10.0**, de 08/10/2026, com commit/push autorizados por Cristian. Inventário completo e roteiro em [task-batch-plan.md](task-batch-plan.md); banco live intocado. Continuidade em [handoff-task-batch-personalization.md](handoff-task-batch-personalization.md).

## Calendários e procedência

| Definição | Âncora absoluta UTC | Regra | Evidência |
| --- | --- | --- | --- |
| Deadly Assault | 2026-10-09T09:00:00Z | 14 dias; sexta, 04h América UTC−5 | Escolha explícita de Cristian por sexta 09/10 às 06h BRT; Game8 confirma sexta quinzenal |
| Shiyu Defense | 2026-10-16T09:00:00Z | 14 dias; sexta, 04h América UTC−5 | Contador de Cristian 7d + horas; horário 04h e sexta quinzenal no guia Critical Node |
| Tower of Adversity | 2026-10-12T09:00:00Z | Hazard Zone, 28 dias; 04h América UTC−5 | Contador de Cristian 3d + horas; regra de quatro semanas e alternância oficial |
| Whimpering Wastes | 2026-10-26T09:00:00Z | Zonas recorrentes, 28 dias; 04h América UTC−5 | Contador de Cristian 17d + horas; anúncio oficial confirma quatro semanas às 04h do servidor |
| Endstate Matrix, fase 3.7 | 2026-11-10T20:00:00Z | Prazo único da fase, sem intervalo fixo | Contador de Cristian 33d + horas; fase termina antes da manutenção; fim global derivado da API, aceito por Cristian |

ZZZ/WuWa América usam UTC−5 fixo: 04h do servidor = 09h UTC = 06h Brasília. Não usar DST de Nova York. Endstate usa referência global: 11/11/2026 às 04h UTC+8 = 10/11 às 20h UTC = 17h Brasília. É o limite de término usado pelo lembrete; não uma hora regional publicada para a edição atual.

### Fontes consultadas

- [Deadly Assault — Game8](https://game8.co/games/Zenless-Zone-Zero/archives/489103): resultado indexado de abril descreve sextas quinzenais.
- [Shiyu Defense / Critical Node — Game8](https://game8.co/games/Zenless-Zone-Zero/archives/460702): resultado indexado de 09/04/2026 informa reset quinzenal na sexta às 04h. Não usar o texto legado de dias 1/16.
- [Reset América ZZZ — Game8](https://game8.co/games/Zenless-Zone-Zero/archives/460247): fuso UTC−5. A recorrência antiga de quatro semanas nesta página não prevalece sobre os guias atuais.
- [Tower — Game8](https://game8.co/games/Wuthering-Waves/archives/453474), [Whimpering — Game8](https://game8.co/games/Wuthering-Waves/archives/498614), [Endstate — Game8](https://game8.co/games/Wuthering-Waves/archives/572518): trechos indexados descrevem 28 dias para Tower/Whimpering e fases por versão para Endstate. A abertura direta retornou HTTP 402; não alegar leitura independente da edição atual no Game8.
- [Whimpering Wastes — anúncio oficial Kuro 2094](https://wutheringwaves.kurogames.com/en/main/news/detail/2094), [JSON oficial](https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en/article/2094.json). O terceiro infográfico foi inspecionado: segunda fase em 17/03/2025 às 04h do servidor, ciclos seguintes de quatro semanas; Tower Hazard Zone passa a quatro semanas desde 03/02/2025. As âncoras atuais vêm dos contadores do usuário, não da edição antiga.
- [Endstate, novo ciclo — anúncio oficial Kuro 5150](https://wutheringwaves.kurogames.com/en/main/news/detail/5150), [JSON oficial](https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en/article/5150.json). Segundo infográfico inspecionado: Adversity Vanguard abrange versões 3.5–3.8; fases se renovam com versões e terminam antes da manutenção seguinte. Não é reset semanal.
- [JSON de calendário WuWa](https://starrailassistant.top/api/v1/activity/ww-en-US.json): raiz versão 3.7, fim 2026-11-11T03:59:59 sem offset. A conversão desse fim para UTC+8 global é derivada, não confirmação de um anúncio da manutenção 3.8. **Cristian aceitou essa referência para a fase atual**, em resposta explícita nesta conversa. Não generalizar silenciosamente a futuras fases.

Deadly tinha divergência entre arredondamento do contador e calendário: Cristian escolheu 09/10 às 06h. Os demais contadores são evidência confirmada por ele em jogo. Não exigir nova digitação durante a importação.

## Implementação e limites

Migração incremental `2026-10-08-expanded-task-batch.sql`, reproduzida ao final de `db/schema.sql` e incluída na ordem de testes. Amplia o catálogo para 14, conserva os contratos anteriores e acrescenta `create_profile_extra_challenges` à transação única. Não importa tarefas ao aplicar SQL.

`profile_task_batch_items` registra por perfil, jogo, definição e fase. O marcador não depende da existência da tarefa: exclusão/renomeação não torna o item elegível de novo. Homônimo exato é preservado integralmente e também registrado. Reset explícito limpa esses marcadores junto dos antigos. Sem autenticação nova: as permissões seguem os perfis públicos já existentes.

Quatro modos usam `next_anchored_batch_deadline`: próximo limite estritamente futuro, ciclos perdidos pulados, cálculo em horas UTC. Tipos 3/5 conservam intervalos de 14/28 dias. A renovação existente reconhece o prefixo `endgame:`, mantém UTC e preserva capas/favoritas.

Endstate usa `endgame:WuWa:endstate-matrix:3.7`, `refresh_type=0`, `repeat_days=null`. O catálogo contém somente o fim conhecido da fase 3.7. Após esse limite, novos carregamentos deixam a fase sem registro e retornam `deferred`; a interface informa calendário pendente sem abrir formulário e carrega os demais itens. Tarefas já criadas não são renovadas nem apagadas automaticamente, pois não são candidatas da API.

**Futuras fases ainda exigem atualização do calendário central durante desenvolvimento.** Automatizar sua descoberta/validação é item separado do roadmap; não foi acrescentada consulta remota ao clique nem inventado intervalo. A identidade por fase prepara o registro, mas a próxima entrega também deve reconciliar a fase anterior com homônimos manuais e exclusões. O seletor individual permanece futuro, sem reutilizar exclusão como adiamento.

HSR Pure Fiction, Apocalyptic Shadow e Memory of Chaos permanecem comentários de reserva, sem definições ativas ou fallback automático.

## Validação

Etapa 1: **124 testes aprovados** no comando de [task-batch-plan.md](task-batch-plan.md), sem APIs nem live. Cobertura inclui migração sobre nove itens já criados (zero escrita automática; clique cria somente cinco), exclusões, edição/recorrência/capa/favorita/conclusão, homônimos, perfis, jogos habilitados depois, reset completo, erro tardio em Shiyu com rollback integral, fases vencidas, instantes exatos, ciclos perdidos e UTC/DST. DOM simulado valida mensagem de calendário pendente e ausência de formulário.

Prévia descartável reiniciada: chamada HTTP real criou 14 tarefas no Convidado, retornou os cinco prazos documentados e repetição criou zero; HTML sem diálogo de prazo. CRAN e Demo disponíveis para criação inicial. Após ajustar somente a mensagem quando há fase pendente sem novos itens, os sete testes do arquivo de interface foram repetidos e passaram; não somados aos 124.

No fechamento MINOR 1.10.0, `npm test` passou **487 testes (69 Jest + 418 Node)**, após ajustar duas verificações históricas de migrações (posição de favoritas e CRLF/LF). Banco real/PostgREST e navegador renderizado continuam pendentes. As fontes remotas foram consultadas separadamente dos testes congelados.
