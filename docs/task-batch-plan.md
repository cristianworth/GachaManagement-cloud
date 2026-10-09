# Lote único — inventário e entregas

Atualizado em 08/10/2026. **Itens 1 e 2 implementados localmente:** Carregar Lote reúne 14 definições, incluindo os cinco desafios novos. Cristian validou a unificação anterior e autorizou esta expansão. O item 3 (seleção individual) e as imagens dos endgames são a próxima entrega. Fechamento em **1.10.0**, com commit/push autorizados por Cristian em 08/10/2026; sem aplicação no Supabase live. Continuidade em [handoff-task-batch-personalization.md](handoff-task-batch-personalization.md).

## Inventário central

O botão considera todos os jogos habilitados no perfil, independentemente do filtro visual. Criação é explícita, mas o calendário é automático: não há confirmação nem campo de prazo. Homônimos conservam os dados e a recorrência que já tinham. O catálogo conta definições, não todas as edições da API.

| Jogo | Atividade | Regra ativa | Próxima referência em Brasília, a partir de 08/10/2026 |
| --- | --- | --- | --- |
| HSR | Echo of War | Weekly, 7 dias | Segunda às 06h |
| HSR | Simulated Universe | Weekly por preferência pessoal de Cristian | Segunda às 06h; não afirma o ciclo oficial de recompensas |
| WuWa | Weekly Boss | Weekly, 7 dias | Segunda às 06h |
| WuWa | Fantasies of the Thousand Gateways | Weekly, 7 dias | Segunda às 06h |
| ZZZ | Hollow Zero | Weekly, 7 dias | Segunda às 06h |
| ZZZ | Notorious Hunt | Weekly, 7 dias | Segunda às 06h |
| GI | Imaginarium Theater | Dia 1º do mês | 01/11 às 06h |
| GI | Spiral Abyss | Lembrete no dia 15, escolha aprovada | 15/10 às 06h; reset oficial dia 16 |
| NTE | Beyond the Rails | 14 dias, América 05h UTC−5 | 21/10 às 07h |
| ZZZ | Deadly Assault | 14 dias, sextas, América 04h UTC−5 | **09/10 às 06h**, referência escolhida por Cristian |
| ZZZ | Shiyu Defense | 14 dias, sextas alternadas, América 04h UTC−5 | **16/10 às 06h** |
| WuWa | Tower of Adversity | Hazard Zone, 28 dias, América 04h UTC−5 | **12/10 às 06h** |
| WuWa | Whimpering Wastes | Zonas recorrentes, 28 dias, América 04h UTC−5 | **26/10 às 06h** |
| WuWa | Endstate Matrix | Fase 3.7, sem intervalo fixo | **10/11 às 17h**, fim global derivado da versão e aceito por Cristian |
| HSR | Pure Fiction | **Reserva inativa**, atendida pela API | Contador fornecido: 10d + horas |
| HSR | Apocalyptic Shadow | **Reserva inativa**, atendida pela API | Contador fornecido: 38d + horas |
| HSR | Memory of Chaos | **Reserva inativa**, atendida pela API | Contador fornecido: 24d + horas |

São **14 definições ativas no catálogo e três reservas inativas**. As reservas HSR também estão comentadas no SQL; ausência/falha da API não as ativa. Não duplicar nem substituir suas edições importadas.

Catálogo público: `public.task_batch_catalogue()`. Contrato usado pelo frontend: `public.create_profile_task_batch()`. Fonte atual dos cinco modos, decisões, limites e implementação em [expanded-task-batch.md](expanded-task-batch.md). GI/NTE em [endgame-batch.md](endgame-batch.md); história das weeklies em [weekly-batches.md](weekly-batches.md).

## Entregas e preservação

1. **Lote único:** uma RPC e uma transação para weeklies, GI e NTE. Referência NTE automática, sem formulário. Mantém os contratos anteriores.
2. **Cinco desafios novos:** agora incluídos na mesma transação. Registro por definição/fase em `profile_task_batch_items` permite acrescentar somente os novos itens a um lote antigo. Aplicar a migração não cria tarefas. O clique não reabre marcadores antigos nem restaura tarefas excluídas/renomeadas.
3. **Futuro — Escolher itens…:** modal ao lado de Carregar Lote, com grupos por jogo, checkboxes, selecionar todos e resumo. Carregar Lote continua carregando todas as definições elegíveis. Definir estados “nunca escolhido”, “adiado”, “criado” e “excluído”; adiar não é excluir. Tooltip só explica, sem controles essenciais. Não foi implementado nesta entrega.

Os intervalos fixos usam âncoras absolutas e UTC; não somam o contador ao dia de cada clique. Renovação de tarefas vencidas ocorre ao abrir/recarregar, conserva capas/favoritas e reabre conclusão no próximo ciclo futuro. Não há timer em segundo plano. Homônimos exatos no mesmo jogo são preservados inclusive se forem Event/Custom; lote registrado não garante que foram convertidos à recorrência do catálogo.

**Endstate Matrix:** a fase atual tem identidade própria e fica sem repetição. Ao vencer, uma tarefa já criada permanece com sua conclusão/prazo; não é evento importado da API. Uma primeira importação após o prazo não cria tarefa vencida e informa que o calendário da próxima fase está pendente. Não há próxima fase nem intervalo de 33/42 dias inventados. Atualizar automaticamente o calendário de futuras fases exige evolução separada; o botão atual não busca a API da versão. Essa limitação está no roadmap. Novos calendários devem preservar decisões e distinguir fases anteriores de homônimos manuais.

## Contadores e decisões do usuário

Contadores fornecidos e reafirmados por Cristian como observados no jogo em 08/10/2026: Deadly 1d + horas; Shiyu 7d + horas; Endstate 33d + horas; Whimpering 17d + horas; Tower 3d + horas; Theater 23d + horas; Abyss 7d + horas; Pure Fiction 10d + horas; Apocalyptic 38d + horas; Memory 24d + horas; Beyond 12d + horas. Isso confirma uma observação, **não a duração de um ciclo**.

Esclarecimentos aprovados:
- NTE: 08/10 + 13 dias às 05h da América, resultando em 21/10T10:00Z.
- Deadly: entre o arredondamento para sábado e o calendário de sexta, Cristian escolheu **09/10 às 06h de Brasília**.
- Endstate: Cristian aceitou **o fim global da versão**, derivado da API, em 10/11 às 17h de Brasília. Não tratá-lo como reset local da América.
- Abismo: manter lembrete no **dia 15**, mesmo com reset oficial no dia 16.
- Importações não devem pedir datas ao usuário. Dúvidas são resolvidas durante desenvolvimento e documentadas uma vez.

## Banco e teste local

Banco existente atualizado até favoritas, nesta ordem:
1. `db/migrations/2026-10-08-endgame-batch.sql`
2. `db/migrations/2026-10-08-unified-task-batch.sql`
3. `db/migrations/2026-10-08-expanded-task-batch.sql`

Aplicar somente as que faltam. Instalação nova usa `db/schema.sql` + `db/seed.sql`. Não reaplicar schema inteiro num banco existente. Nenhuma dessas migrações foi aplicada ao live nesta entrega.

```powershell
npm run preview:profiles
# Abra http://127.0.0.1:5501/tasks
```

Reiniciar a prévia para recriar o banco temporário com o schema atual. Ela não usa Supabase e perde dados ao encerrar. `npm start` usa a configuração normal.

**Para testar:** selecione CRAN ou Demo, habilite os cinco jogos e desmarque a criação opcional de weeklies para observar 14 atividades de uma vez. Em Tasks, clique em Carregar Lote e confira os cinco novos nomes e os prazos da tabela. Não aparece diálogo. Se as seis weeklies já vieram pela seleção, serão oito desafios novos, totalizando 14 atividades de lote. Em banco com os nove anteriores, o clique acrescenta apenas cinco.

Favorite/conclua/edite capa ou prazo de um novo desafio, recarregue e carregue novamente: os dados devem permanecer. Exclua outro, repita e confira que ele não voltou. Troque de perfil para conferir isolamento. O filtro visual da lista não limita os jogos carregados.

Etapa 1, offline:
```powershell
node --test tests/taskBatch.test.mjs tests/expandedTaskBatch.test.mjs tests/taskBatchUI.test.mjs tests/endgameBatches.test.mjs tests/endgameBatchesUI.test.mjs tests/endgameRecurrence.test.mjs tests/profileUI.test.mjs tests/uiFeedback.test.mjs
```

**124 testes aprovados** nesta expansão: SQL real como anon, instalação nova/upgrade, migração com lote anterior, UTC/DST, virada exata/ciclos perdidos, fase vencida, reset, homônimos, isolamento, rollback e DOM real com cliente simulado. Evidências históricas: 107 na automação NTE, 178 na primeira unificação e 205 antes da unificação; não somar execuções. No fechamento MINOR 1.10.0, `npm test` passou **487 testes (69 Jest + 418 Node)**. As duas verificações históricas de migrações incompatíveis com a evolução foram corrigidas e a suíte completa repetida com sucesso. Prévia reiniciada e conferida por HTTP com SQL real: Convidado criou 14 tarefas, os cinco prazos coincidem com a tabela, repetição criou zero e o HTML não contém diálogo. CRAN e Demo ficaram livres para testar a criação. Navegador real e PostgREST/Supabase live ainda não validados.

## Consulta anterior das APIs

Consulta pública somente leitura nesta entrega, sem alterar fixtures: GI 8 atividades; HSR 15; ZZZ 12; WuWa 12; NTE 9. Nenhum dos desafios fora do HSR apareceu por nome. HSR apresentou seis edições dos três modos, incluindo vencidas/futuras. Ausência numa amostra não autoriza fallback.

HSR retornou Domain Genesis até 19/10/2026, Crossing the Afterlife até 02/11/2026 e Dominance of Oblivion até 16/11/2026, com fim bruto 03:59:59. São dados da fonte, não novos horários regionais conferidos aqui.

Raiz do JSON WuWa, separada de activities[0]:
```json
{"version":"3.7","versionName":"Prism's Illusion, Heart's Illumination","startTime":"2026-09-30T11:00:00","endTime":"2026-11-11T03:59:59","cover":"https://i0.hdslb.com/bfs/new_dyn/7ae8269b71e9ad214db2ef026d8075ee1955897084.jpg"}
```
A primeira atividade é Cubie Wars, com outro prazo; não usá-la como metadados da versão. O JSON não fornece offset. A interpretação do fim global para Endstate é uma referência **derivada, aceita por Cristian**, conforme documentação da expansão.
