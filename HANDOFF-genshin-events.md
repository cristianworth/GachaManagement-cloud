# Handoff: piloto de eventos do Genshin

## Objetivo e escopo

Automatizar a descoberta de **eventos temporários do Genshin ainda não cadastrados** no GachaManagement. O usuário joga no **servidor América**; o prazo final é o dado mais importante, pois um vencimento antecipado pode fazê-lo perder o evento. Começar por Genshin; HSR e ZZZ ficam para depois. Na primeira etapa, listar candidatos para inspeção, sem notificações nem gravação automática. Preservar tarefas manuais e recorrentes existentes.

## Estado do projeto

- Aplicação simples em HTML/JavaScript/CSS com Supabase. `db/schema.sql` define `games` e `tasks`; `tasks` tem `description`, `expiration_date`, `refresh_type`, `game_id` etc., mas não tem fonte, região ou ID externo.
- `scripts/previewGenshinEvents.js` consulta, em modo somente leitura, `https://api.ennead.cc/mihoyo/genshin/calendar?lang=en-us` e mostra dados recebidos, prazo americano proposto e motivo de revisão. `scripts/syncGenshinEvents.js` usa a mesma normalização e grava **candidatos** no Supabase. Executar com `--dry-run` para não gravar.
- Na consulta real de 29/09/2026, havia nove candidatos: Silverwing com prazo americano proposto, três com horário fora do padrão e cinco sem datas válidas. O retorno muda com o calendário e deve ser reconsultado.

## Fonte e evidência sobre região

- `api.ennead.cc` é uma **API comunitária** que consulta o calendário da HoYoLab. [Código do endpoint Genshin](https://github.com/torikushiii/hoyoverse-api/blob/main/src/http/routes/calendar/genshin.rs): envia `role_id` e `server` configurados pelo mantenedor ao calendário da HoYoverse e repassa os timestamps; o endpoint público não recebe região, só idioma ([documentação](https://github.com/torikushiii/hoyoverse-api#event-calendar)).
- Exemplo: evento 446, *Silverwing in Pursuit of the Moon*. API: início `2026-09-24T02:00:00Z`, fim `2026-10-11T19:59:59Z`. Em UTC+8 são 24/09 10:00 e 12/10 03:59:59, exatamente os horários de servidor informados pelo Game8. Cristian comparou os contadores simultâneos do Game8: Ásia `11d 18h`, América `12d 7h`, diferença de **13 horas**. Isso também confere com os fusos de servidor publicados pela HoYoverse: [Ásia UTC+8 e América UTC-5](https://genshin.hoyoverse.com/en/news/detail/103756). Portanto, **esta resposta da API corresponde ao servidor Ásia**. Para este evento, o prazo americano derivado é `2026-10-12T08:59:59Z` (12/10 03:59:59 no servidor América; 12/10 05:59:59 em Brasília).
- Para eventos anunciados no **mesmo horário local de cada servidor**, converter o instante asiático para o americano somando 13h. Eventos com horário global único ou regra própria não devem receber essa conversão. O script atual ainda mostra os timestamps brutos e sinaliza que não representam diretamente o prazo americano.

## Decisão arquitetural provisória

Para o piloto, manter a rotina no mesmo repositório, isolada do código de UI e sem criar uma segunda API/serviço. A rotina semanal armazena candidatos no Supabase; a UI aprova e cria/atualiza tarefas. Uma API separada só passa a fazer sentido se houver necessidade real de compartilhar o processamento entre aplicações.

## Implementação do piloto

Implementado em `js/events/genshinCalendar.js`, `scripts/syncGenshinEvents.js`, `db/schema.sql` e na área **Revisar eventos** da tela de tarefas. A sincronização semanal salva candidatos idempotentemente pelo par fonte + ID externo. Nenhuma tarefa é criada antes da aprovação; a função SQL aprova e grava tarefa/vínculo na mesma transação. Pode-se vincular tarefa de evento já existente. Se a fonte alterar o prazo de um evento aprovado, a candidata volta para revisão e a tarefa mantém o prazo anterior até nova aprovação. Candidatos ausentes da fonte saem da fila sem apagar tarefas. Datas ausentes ou horários não reconhecidos ficam sem sugestão. O workflow GitHub Actions precisa estar na branch padrão; o SQL atualizado precisa ser aplicado ao Supabase existente para a tela e a sincronização funcionarem.

## Pendências operacionais

1. Branch local `codex/genshin-events-pilot` criada neste worktree a partir de `cloud/main` (`11e072b`). Cristian executou `db/backup-existing-data.sql` no SQL Editor e confirmou `games` 5/5 e `tasks` 15/15 nas tabelas originais e `_duplicate`.
2. Cristian executou `db/migrations/2026-09-29-genshin-events.sql`; a consulta final retornou zero candidatos antes da primeira sincronização.
3. A sincronização inicial gravou nove candidatos; a segunda execução reportou nove inalterados e zero novos. A leitura pela API confirmou `games` 5, `tasks` 15 e `event_candidates` 9. A interface local exibiu nove candidatos na área **Revisar eventos**. Nenhum candidato foi aprovado neste teste.
4. Publicar o workflow na branch padrão para a execução semanal. Continuar avaliando padrões de horário além de 03:59:59 antes de propor datas automaticamente para esses eventos.
