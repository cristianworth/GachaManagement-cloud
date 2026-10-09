# Desafios GI + NTE no Lote

Entrega 1.10.0 de 08/10/2026, com commit/push autorizados; migração no Supabase live pendente. GI/NTE integram **Carregar Lote** junto das seis weeklies. Interface, inventário completo, sequência de migrações e próximos itens em [task-batch-plan.md](task-batch-plan.md).

## Catálogo e decisões

| Jogo | Tarefa | Acompanhamento |
| --- | --- | --- |
| GI | Imaginarium Theater | Dia 1º de cada mês, 09:00 UTC / 06:00 Brasília |
| GI | Spiral Abyss (Abismo) | Lembrete antecipado no dia 15, 09:00 UTC / 06:00 Brasília |
| NTE | Beyond the Rails | A cada 14 dias, referência fixa 21/10/2026 às 10:00 UTC / 07:00 Brasília |

A [HoYoverse](https://support.hoyoverse.com/hc/en-us/articles/50333950598553-When-does-the-Spiral-Abyss-reset-and-what-are-the-rewards) confirma Theater no dia 1º e Abismo no dia 16. Cristian escolheu **“Dia 15 — lembrete antecipado”**. Os horários de 06:00 são o padrão adotado para os lembretes do Genshin, sem afirmar que todos os resets ocorrem nesse instante.

## Referência automática do NTE

Cristian reafirmou em 08/10/2026 que os contadores fornecidos foram **conferidos por ele dentro do jogo**. Esclareceu Beyond the Rails como “12d xh left”: usar **hoje + 13 dias às 05:00 do servidor América**. A referência normalizada é:

- Data de referência da conversa: 08/10/2026.
- Próximo reset confirmado pelo usuário: 21/10/2026 às 05:00 América (UTC−5 fixo).
- Instante absoluto: **2026-10-21T10:00:00Z**, equivalente a **21/10/2026 às 07:00 Brasília**.
- Ciclo acordado: 14 dias; referência central do sistema, independente do perfil e do navegador.

Essa procedência é confirmação em jogo pelo usuário, não uma verificação independente na web. A [Icy Veins](https://www.icy-veins.com/neverness-to-everness/nte-beyond-the-rails) consultada anteriormente descrevia ciclo típico de 14 dias e uma edição antiga; isso não invalida a confirmação atual de Cristian.

public.next_beyond_the_rails_deadline(p_now) calcula o próximo instante **estritamente futuro** a partir da referência fixa. Em 21/10 às 10:00 UTC, já retorna 04/11 às 10:00 UTC; pula ciclos perdidos e mantém UTC mesmo quando o fuso do banco usa DST. Não calcula “hoje + 13 dias” a cada carregamento. Se o calendário do jogo mudar futuramente, atualizar a referência/regra central durante o desenvolvimento.

Preferência registrada em [project-conventions.md](project-conventions.md) e AGENTS.md: importações de API, lotes e outros carregamentos devem ser **automáticos, sem solicitar datas na interface**. A tela de confirmação foi removida. Dúvidas de calendário são esclarecidas durante o desenvolvimento, sem exigir configuração por usuário/perfil.

## Contratos e preservação

- O frontend chama create_profile_task_batch com o perfil ativo. O servidor usa now() e delega às criações semanais, GI/NTE e aos cinco desafios novos de ZZZ/WuWa na mesma transação; falha em um jogo desfaz todas as tarefas e marcadores novos.
- A assinatura SQL anterior create_profile_endgame_batch conserva seu parâmetro opcional de prazo explícito por compatibilidade. Omitido/null calcula automaticamente; um override explícito inválido é rejeitado. A interface e os repositórios de carregamento não solicitam nem enviam esse parâmetro. Edição manual de tarefa existente continua disponível.
- O boot não cria os desafios. A criação explícita por clique é registrada em profile_endgame_batches, por perfil e sigla. Habilitar um jogo depois permite acrescentá-lo sem reabrir lotes antigos.
- Nome exato + jogo + tarefa pessoal ativa preserva homônimos integralmente, inclusive Events/Custom, capas, favoritas, conclusão, prazo e recorrência. Um homônimo registrado não passa a ser recorrente automaticamente. “Abismo” não é inferido como homônimo de “Spiral Abyss”.
- Repetir não recria excluídos/renomeados. Para restaurar, usar o cadastro manual. Reset completo explícito limpa os marcadores; aplicar a migração não executa reset nem reescreve tarefas anteriores.
- Perfis compartilham a identidade da definição em tasks.shared_key (prefixo endgame:), com estado pessoal separado. Nenhum candidato da API é criado/vinculado por este lote.
- Tipos refresh_type=9 (dia 1º) e 10 (dia 15) têm repeat_days=null e prazo obrigatório. Monthly antigo conserva 30 dias (31 nos registros legados sem intervalo explícito).
- Ao abrir/recarregar, vencidos recorrentes reabrem no próximo prazo futuro, conservando favoritas/capas. Calendário mensal e NTE gerenciado seguem UTC; prazo manual existente é respeitado até vencer. Não é timer em segundo plano.

## Banco e teste local

No destino existente atualizado até favoritas, aplicar 2026-10-08-endgame-batch.sql, depois 2026-10-08-unified-task-batch.sql e 2026-10-08-expanded-task-batch.sql. Aplicar somente as migrações que faltam. Instalação nova usa db/schema.sql e db/seed.sql. Nenhuma migração desta entrega foi aplicada ao live.

```powershell
npm run preview:profiles
# Abra http://127.0.0.1:5501/tasks
```

Reiniciar uma prévia anterior para recriar seu banco temporário com o SQL novo. A prévia não acessa o Supabase; seus dados somem ao encerrar o servidor.

Para testar, habilite GI e NTE em um perfil, abra Tasks e clique em **Carregar Lote**. Não deve aparecer formulário ou confirmação de prazo. Confira Theater no dia 1º, Abismo no dia 15 e Beyond the Rails em 21/10/2026 às 07:00 Brasília, caso carregado antes desse instante. Recarregue e repita: nenhuma duplicata. Favorite/conclua/edite uma tarefa; o lote deve preservar suas escolhas. Exclua outra e repita: não deve voltar. Troque de perfil para conferir estado independente.

```powershell
node --test tests/taskBatch.test.mjs tests/expandedTaskBatch.test.mjs tests/taskBatchUI.test.mjs tests/endgameBatches.test.mjs tests/endgameBatchesUI.test.mjs tests/endgameRecurrence.test.mjs tests/profileUI.test.mjs tests/uiFeedback.test.mjs
```

Etapa 1 atual: **124 testes focados aprovados**, incluindo a expansão ZZZ/WuWa, offline, com relógio fixo, SQL como anon em instalação nova/upgrade e DOM com cliente simulado. Cobrem o reset exato, ciclos perdidos, UTC/DST, ausência de entrada manual, rollback integral, perfis, homônimos e preservação. Validações históricas: 205 testes antes da unificação; 178 na primeira unificação com o diálogo agora removido. Não somar execuções históricas à contagem atual.

Navegador real e PostgREST live ainda não conferidos. No fechamento MINOR 1.10.0, `npm test` passou **487 testes (69 Jest + 418 Node)**. Os cinco novos modos estão implementados; seleções individuais e automação de próximas fases Endstate permanecem futuras. Continuidade em [handoff-task-batch-personalization.md](handoff-task-batch-personalization.md).
