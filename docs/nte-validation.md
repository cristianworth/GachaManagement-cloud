# Validação de Neverness to Everness

Revisado em 04/10/2026 para a entrega conjunta 1.4.0 de WuWa e NTE.

## Região e fontes

O [Game8 confirma reset às 05:00 e América em UTC−5](https://game8.co/games/Neverness-to-Everness/archives/598313), equivalente a 10:00 UTC / 07:00 Brasília. Reset não determina o horário final de todos os eventos. A consulta indexada recupera essa informação, embora a abertura direta tenha falhado.

As [notas oficiais globais da versão 1.4](https://nte.perfectworld.com/en/article/news/gamenews/20260929/264409.html), publicadas em 29/09/2026, confirmam os nove eventos da fixture em inglês, distinguindo horários fixos UTC+8 e horários do servidor. O idioma da API não foi usado como prova de região. Não foi localizada uma página indexada atual do Game8 para os eventos individuais; a nota global explícita fornece as bases dos campos. Em dúvidas futuras sobre datas finais, conferir Game8 e identificar a edição correta antes de substituir uma data.

| Campo / evento | Base confirmada | Resultado na América |
|---|---|---|
| Início após atualização | Manutenção global prevista termina 30/09 às 11:00 UTC+8 | 30/09 03:00 UTC; sujeito a eventual extensão da manutenção |
| Circle Gifts, Pukaland Travelogue, Born to Race, Everdriving, Terminal Depths | Fim em 11/11 05:59 UTC+8 | Instante global; não deslocar 13 horas para o reset americano |
| Circle Bounty | Fim em 10/11 23:59 UTC+8 | Instante global diferente do encerramento dos demais eventos |
| Coal Lump's Treasure | Início 08/10 10:00 e fim 11/11 05:59 UTC+8 | Ambos globais |
| Stamina Recharge | 05/10 05:00 até 19/10 04:59, horário do servidor | Converter ambos com UTC−5 |
| Pixel Surge | 19/10 05:00 até 26/10 04:59, horário do servidor | Converter ambos com UTC−5 |

Os anúncios especificam minutos; os segundos `:59` são fornecidos pela API. A correspondência é registrada em `tests/fixtures/nte-source-contract.json`, separada da resposta bruta `nte-en-US.json`. As expectativas UTC dos testes são valores independentes, não gerados pela política de produção.

## Política e identidade

`js/events/nte.js` reconhece somente as edições/campos conferidos. Evento novo, horário alterado, início/fim ausente ou impossível fica em revisão, sem prazo presumido. O fim global é usado também no limite exato de expiração; não manter um evento encerrado durante 13 horas adicionais.

NTE usa a reconciliação por edição introduzida para WuWa: chave inicial do nome e início da fonte, reutilizada em correções com o mesmo início ou períodos sobrepostos. Períodos disjuntos começam sem conclusão/ignorado herdado. Múltiplas correspondências bloqueiam antes de escrever. Sem ID estável do provedor, uma renomeação ou correção que desloca todo o período continua exigindo investigação.

`Everdriving` preserva progresso dentro do próprio jogo segundo o anúncio; isso não autoriza herdar a conclusão da tarefa de acompanhamento de outra edição no Gacha Management.

## Fluxo de entrega

Adicionar a fonte/sigla às funções públicas do schema e à migração incremental; executar testes em instalação nova e upgrade; validar a API real em dry-run; aplicar/verificar a migração no projeto de destino antes da carga inicial. Conferir também eventos ainda ausentes da API: a integração representa o calendário do provedor, não promete cobertura completa do jogo.

## Resultado da entrega 1.4.0

- `npm test`: 213 testes aprovados (43 Jest + 170 Node), incluindo banco novo, upgrade, reaplicação e sincronização com PostgreSQL descartável.
- API real: dry-run encontrou nove candidatos; todos têm bases por campo conferidas.
- Migração `2026-10-04-nte-events.sql` aplicada no Supabase `zzcxhtblbmiakuvdakic`. Os contratos dos cinco jogos passaram como `anon` com rollback; funções continuam security invoker e não houve alteração de grants/roles.
- Carga inicial: nove candidatos e nove tarefas importados, sem revisão. Repetição: zero candidatos novos, nove sem alteração e as mesmas nove tarefas atualizadas.
- SQL independente confirmou os nove inícios/prazos esperados. Zero duplicatas de vínculo e zero fixtures temporárias após os testes.
- Hashes dos jogos, tarefas manuais/outros jogos, candidatos de outras fontes e nove tarefas WuWa já existentes permaneceram iguais. A única tarefa acrescentada ao WuWa foi Moonlit Path com a estimativa aceita por Cristian.

Manutenção: `node scripts/syncEvents.js --game=nte --dry-run`; retire `--dry-run` para escrever. `npm start` serve a interface local. A sincronização diária às 07h30 de Brasília (10h30 UTC) inclui os cinco jogos depois dos testes aprovados.
