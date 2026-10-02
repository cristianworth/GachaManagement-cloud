# Handoff: piloto de eventos do Genshin

## Objetivo

Descobrir eventos temporários ainda não cadastrados no GachaManagement. A conta de Cristian usa o servidor América; o prazo final é o dado mais importante. O piloto usa somente o endpoint inglês de Genshin da StarRailAssistant. HSR, ZZZ, WuWa e NTE ficam para etapas posteriores.

## Fluxo atual

- `js/events/starRailAssistantGenshin.js` normaliza a resposta de `https://starrailassistant.top/api/v1/activity/ys-en-US.json`. O endpoint não fornece ID de atividade nem fuso nas datas. O nome normalizado é a chave do candidato, para que uma atualização de data da mesma atividade atualize o registro.
- `scripts/previewStarRailAssistantGenshin.js` compara eventos recebidos com candidatos e tarefas de Genshin sem gravar nada. `scripts/syncGenshinEvents.js --dry-run` também não grava; sem a opção, sincroniza candidatos no Supabase.
- Na primeira sincronização após a troca de fonte, candidatos antigos com nome correspondente são adotados pela StarRailAssistant, preservando status e vínculo com a tarefa. Os demais candidatos antigos são desativados; tarefas existentes não são apagadas ou alteradas. A tela de revisão lê somente candidatos da StarRailAssistant.
- Candidatos novos ficam pendentes. Uma mudança de prazo em candidato aprovado reabre a revisão sem alterar imediatamente sua tarefa. A aprovação SQL grava o prazo da tarefa e o vínculo na mesma transação.
- O GitHub Actions executa a sincronização semanal quando o workflow estiver na branch padrão.
- `db/migrations/2026-10-01-task-cover.sql` adiciona `tasks.cover_url`, copia capas dos candidatos vinculados e aprovados sem sobrescrever imagens existentes e atualiza a função de aprovação para gravar a capa junto do prazo. A lista exibe uma miniatura; o mapper omite a capa quando ela não foi informada pelo formulário, preservando a imagem em edições de nome/prazo. Imagens quebradas são removidas da exibição.

## Próxima etapa: mais jogos

- A carga inicial e a sincronização semanal usam a mesma rotina: importam eventos disponíveis na fonte que ainda não venceram, inclusive futuros quando fornecidos, para revisão. Não há aprovação automática nem necessidade de uma carga inicial diferente. A execução semanal começa após o merge do workflow na branch padrão; novos candidatos ficam pendentes, aprovados só reabrem se o prazo da fonte mudar e ignorados continuam ignorados.
- Antes de habilitar um segundo jogo, mover a revisão para uma página própria com o fluxo `Revisar eventos → selecionar jogo (com quantidade pendente) → revisar eventos desse jogo`. Usar o router existente; não requer um framework novo.
- Ao expandir, associar candidatos explicitamente ao jogo e parametrizar consulta e aprovação: hoje a interface filtra a fonte de Genshin e a função SQL procura o jogo `GI`. Preservar os vínculos existentes ao migrar e compartilhar a UI de revisão entre jogos, mantendo regras de prazo em cada adaptador.

## Horários e cobertura

- O evento *Silverwing in Pursuit of the Moon* confirmou a diferença de 13 horas entre os instantes de fim dos servidores Ásia e América. Para fim `03:59:59` no horário Ásia, o piloto propõe a mesma hora local no servidor América. Outros horários usam o instante recebido da fonte como proposta inicial, ainda sujeita a ajuste na aprovação. No caso de *Across the Frozen Wilds* e *Tabletop Troupe*, `14:59:59` na fonte (UTC+8) é `03:59:59` em Brasília, conforme os fins informados por Cristian no HoYoLAB.
- A API fornece `cover` como URL HTTPS; a sincronização salva essa URL no novo campo `cover_url`. A tela mostra a imagem, o prazo sugerido no fuso do dispositivo e o tempo restante até o valor selecionado no formulário. Bancos que já receberam a migração inicial precisam executar `db/migrations/2026-09-30-event-cover.sql` antes da próxima sincronização.
- Em 30/09/2026, o endpoint inglês de Genshin trouxe quatro atividades; o chinês trouxe oito. Eventos ausentes do endpoint inglês não aparecem automaticamente na fila e exigem conferência manual. *Rainbow's End* também agrega benefícios com prazos distintos, segundo o Game8; seu prazo deve ser conferido antes da aprovação.

## Dados existentes e validação

- Cristian confirmou backup de `games` (5/5) e `tasks` (15/15) e aplicou `db/migrations/2026-09-29-genshin-events.sql`.
- A sincronização anterior criou nove candidatos; Cristian aprovou somente *Silverwing*. Em 30/09/2026, a primeira sincronização da StarRailAssistant migrou três candidatos existentes, criou *Rainbow's End* e desativou seis candidatos antigos. *Silverwing* continuou aprovado no candidato 2, ligado à tarefa 16. A segunda execução teve quatro candidatos inalterados e zero novos.
- A interface local mostrou três candidatos pendentes da StarRailAssistant e manteve a tarefa aprovada na lista de atividades. Para nova conferência, execute `node scripts/previewStarRailAssistantGenshin.js` ou `node scripts/syncGenshinEvents.js --dry-run`.
- Em 30/09/2026, a migração `db/migrations/2026-09-30-event-cover.sql` foi aplicada no projeto Supabase GachaManagement pelo SQL Editor. A sincronização seguinte atualizou os quatro candidatos, sem criar tarefas: quatro capas preenchidas, dois candidatos pendentes, um aprovado e um ignorado; a contagem de tarefas permaneceu 16. Na tela local, *Across the Frozen Wilds* apareceu com capa, prazo inicial de 03/11/2026 03:59:59 em Brasília e tempo restante. O host da imagem exigiu `referrerPolicy = 'no-referrer'` para carregá-la no navegador.
- Em 01/10/2026, o mantenedor explicou que os endpoints chinês e inglês usam fontes diferentes e adicionou traduções oficiais para eventos ausentes. Uma nova consulta retornou oito atividades em cada idioma, com os mesmos prazos. A sincronização criou quatro candidatos em inglês (*To Temper Thyself*, *The Godforsaken Frostlands*, *Raiment Collection* e *A Rekviem for the Underworld*). O estado verificado depois foi: seis pendentes, um aprovado (*Silverwing*, tarefa 16) e um ignorado (*Tabletop Troupe*). Nenhuma tarefa foi criada pela sincronização.
- Em 01/10/2026, a migração de capas de tarefas foi aplicada no SQL Editor do mesmo projeto: 16 tarefas e uma capa preenchida (*Silverwing*). Uma verificação SQL em transação com rollback confirmou aprovação de nova tarefa, atualização da capa ao reaprová-la e preservação da imagem quando a fonte não envia capa. Os 24 testes automatizados passaram; a lista local carregou a miniatura de 96×54 ao lado do nome.
