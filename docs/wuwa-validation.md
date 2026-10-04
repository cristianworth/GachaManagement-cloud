# Validação inicial de Wuthering Waves

Investigação iniciada em 03/10/2026, depois do commit de preparação `02f7c77` (1.3.1). Integração e conferência concluídas em 04/10/2026: WuWa está ativo, a migração foi aplicada no Supabase e a sincronização foi executada duas vezes. A carga inicial importou nove eventos e deixou Moonlit Path em revisão. Para a entrega conjunta 1.4.0, Cristian confirmou as datas de Moonlit Path e aceitou usar a estimativa de horário da API.

## Horários confirmados

As [notas oficiais da versão 3.7](https://wutheringwaves.kurogames.com/en/main/news/detail/5571) diferenciam manutenção em UTC+8 e atividades em horário do servidor. O conteúdo foi lido no [JSON público usado pelo próprio site oficial](https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en/article/5571.json); o HTML inicial da página é carregado por JavaScript.

| Caso | Evidência | Implicação para a integração |
|---|---|---|
| Início junto da versão | Manutenção prevista termina em 30/09/2026, 11:00 UTC+8; Cubie Wars, Dreams in the Capsule e Gifts of Waking Moon começam após a atualização | Preservar o instante global 03:00 UTC, sujeito a eventual extensão da manutenção; não deslocar esse início para 11:00 América |
| Reset diário | [Bountiful Crescendo](https://wutheringwaves.kurogames.com/en/main/news/detail/4466) e [Chord Cleansing](https://wutheringwaves.kurogames.com/en/main/news/detail/4368) usam início às 04:00 e fim às 03:59, com renovação diária às 04:00 do servidor | Horário do servidor, com conversão pelo servidor acompanhado |
| Início fora do reset | Echo Erase e Gifts of Singing Drizzle começam em 22/10 às 10:00 do servidor | A regra atual que reconhece somente início às 04:00 não basta |
| Fim fora do reset | Cubie Wars encerra em 11/11 às 11:59 do servidor | A regra atual que reconhece somente fim às 03:59:59 não basta |

Os sete eventos conferidos têm datas compatíveis com `ww-en-US.json` na precisão de minutos dos anúncios. A API acrescenta segundos, inclusive `:59` no fim; o anúncio não comprova individualmente esse segundo. As datas atuais de Bountiful Crescendo/Chord Cleansing foram confirmadas nos trechos do Game8 fornecidos por Cristian, enquanto os anúncios anteriores confirmam a recorrência e o reset desses modos. Para Moonlit Path, Cristian forneceu o trecho atual do Game8 com 30/09–11/11/2026 e aceitou em 04/10 usar a estimativa da API: início global em 30/09 03:00 UTC e fim em 11/11 08:59:59 UTC (05:59:59 Brasília). A hora exata não foi verificada independentemente; essa é uma exceção expressa para esta edição, não uma regra geral. A consulta indexada anterior retornou fevereiro/março e não valida a edição atual.

O [guia de reset do Game8](https://game8.co/games/Wuthering-Waves/archives/454085), consultado em 03/10/2026, informa América em UTC−5 e reset diário às 04:00 do servidor. Cristian também confirmou o reset às 04:00 do servidor. Isso corresponde a 09:00 UTC e 06:00 em Brasília (UTC−3). A pendência de offset para começar a implementação está resolvida. O conteúdo em inglês da API mantém as mesmas horas locais do calendário chinês, mas não informa servidor/fuso por campo.

## Referência solicitada por Cristian

Usar Game8 para confirmar datas e horários de eventos na América, inclusive nas próximas integrações. A StarRailAssistant permanece como fonte de descoberta; os anúncios oficiais podem complementar a classificação entre horário global e horário do servidor. Uma tabela com somente datas não comprova a hora exata; o reset diário não determina automaticamente o encerramento de todo evento.

Links fornecidos por Cristian:

- [Lista de eventos do WuWa](https://game8.co/games/Wuthering-Waves/archives/453473).
- [Chord Cleansing](https://game8.co/games/Wuthering-Waves/archives/457211): trecho fornecido informa 04–11/11/2026, compatível com a fixture da API.
- [Bountiful Crescendo](https://game8.co/games/Wuthering-Waves/archives/458244): trecho fornecido informa 15–22/10/2026, compatível com a fixture da API.

A consulta automatizada/indexada das páginas de eventos retornou edições antigas. As datas atuais acima foram conferidas a partir dos trechos colados por Cristian e da fixture, sem apresentá-las como uma leitura independente atualizada das páginas. O guia de reset consultado explicita o offset UTC−5. Não é necessário pedir mais links para iniciar a implementação; políticas por campo e identidade de edição são trabalho de implementação, não informações adicionais que Cristian precise fornecer.

Há confirmação dos tipos de horário, mas ainda não há uma regra segura para classificar qualquer evento futuro usando apenas seu horário. `11:00` pode representar o fim global da manutenção em um início e um horário do servidor em outro evento. A referência oficial ou metadado explícito por evento/campo deve prevalecer sobre uma heurística por sufixo da hora.

## Identidade: o risco foi confirmado

O mesmo nome é usado em edições diferentes nos anúncios oficiais:

| Nome | Edição anterior | Outra edição |
|---|---|---|
| Bountiful Crescendo | [19–26/02/2026](https://wutheringwaves.kurogames.com/en/main/news/detail/4264) | [02–09/04/2026](https://wutheringwaves.kurogames.com/en/main/news/detail/4466) |
| Chord Cleansing | [17–24/12/2025](https://wutheringwaves.kurogames.com/en/main/news/detail/3774) | [11–18/03/2026](https://wutheringwaves.kurogames.com/en/main/news/detail/4368) |

O provedor também repete `回音盈域` e `声弦涤荡` em seus calendários chineses das versões [3.6](https://github.com/Shasnow/Shasnow.github.io/blob/8d38b5820b812de3e8bb8a4e37df06393bed39d1/public/api/v1/activity/ww.json) e [3.7](https://github.com/Shasnow/Shasnow.github.io/blob/13f1d7759f472e4d41b0c55479d9ea900014f29d/public/api/v1/activity/ww.json), com intervalos diferentes. Isso confirma reutilização de nome na fonte; não habilita associação automática entre idiomas.

O histórico inglês tem somente duas revisões em 30/09/2026, ambas da versão 3.7. A unicidade dos dez títulos no snapshot atual não garante unicidade entre edições. Usar somente `activityKey(name)` importaria a próxima edição como atualização da anterior, podendo preservar `is_done` ou `ignored` indevidamente.

## Contrato recomendado para a implementação

1. **Horário por campo:** distinguir `server-time` e `version-update`/offset explícito. O início após atualização pode ser global, enquanto o fim da mesma atividade é horário do servidor. Manter a procedência dessa classificação e enviar casos sem classificação confiável para revisão.
2. **Identidade persistida de edição:** o nome identifica a família; cada edição precisa de uma chave própria, preservada quando o prazo é corrigido. Usar ID do anúncio oficial quando houver associação comprovada. Se for necessário gerar uma chave, persistir essa chave e o vínculo com a edição; não recalculá-la do prazo final em cada sincronização.
3. **Reconciliação com cautela:** nome + versão pode ajudar a reconhecer uma edição, mas não deve ser a única chave. Duas ocorrências do mesmo modo dentro da mesma versão e um evento que atravessa versões precisam de tratamento explícito. Se uma edição nova e uma correção da antiga não puderem ser distinguidas, exigir revisão da associação antes de reusar conclusão/ignorado ou criar outra tarefa.
4. **Compatibilidade:** aplicar o novo contrato inicialmente ao WuWa. Não alterar as chaves existentes de GI/HSR/ZZZ sem uma migração dos candidatos e vínculos. Reusar importação transacional, proteção de prazo manual e ignorar por edição.

## Casos cobertos pelos testes da integração

- Cubie Wars: início global após manutenção e fim às 11:59 do servidor na mesma atividade.
- Echo Erase: início às 10:00 do servidor e fim no reset; eliminar o deslocamento incorreto de 13 horas causado pelo fallback atual quando América for confirmado em UTC−5.
- Bountiful Crescendo/Chord Cleansing: completar ou ignorar uma edição não completa nem ignora a seguinte de mesmo nome.
- Correção do prazo/início da mesma edição: atualizar a tarefa existente, preservando seu ID, conclusão e prazo manual.
- Duas edições com mesmo nome simultâneas ou dentro da mesma versão: manter identidades separadas ou bloquear a associação ambígua, sem sobrescrever dados.
- Atividade que atravessa mudança da versão: não criar outra edição apenas porque `calendar.version` mudou.
- Prazo ausente, intervalo inválido ou base de horário desconhecida: revisão sem importação automática com prazo presumido.
- Repetição da sincronização, desaparecimento na fonte, correção manual e isolamento de jogos: reaproveitar as suítes compartilhadas já preparadas.

`tests/fixtures/wuwa-source-contract.json` registra os fatos extraídos dos anúncios, com URLs de origem, precisão de minutos e quatro exemplos de edições recorrentes. `tests/wuwaSourceContract.test.mjs` cruza as datas dos sete eventos com a fixture da API e verifica os inícios globais. `tests/wuwaEvents.test.mjs` acrescenta resultados UTC independentes para os nove eventos validados, limite exato de expiração e revisão dos horários desconhecidos. Também exercita a sincronização contra PostgreSQL descartável: correção de início/prazo reutiliza o ID, preserva conclusão e prazo manual, mudança da versão não recria a edição, ignorar uma edição não afeta a próxima, e repetição não duplica tarefas.

## Implementação e resultado no destino

- `js/events/wuwa.js` contém as bases por campo/edição verificadas. As ocorrências futuras de Bountiful Crescendo/Chord Cleansing usam o padrão de reset já confirmado; edições desconhecidas dos demais eventos ficam em revisão. Não existe regra universal que trate todo horário da API como América.
- `scripts/eventSync.js` conserva as chaves anteriores de GI/HSR/ZZZ. Para WuWa, uma chave inicial usa nome + início da fonte; a reconciliação reutiliza a chave persistida quando o início é igual ou os períodos se sobrepõem. Períodos disjuntos criam outra edição; múltiplas correspondências ou ocorrências sobrepostas do mesmo nome bloqueiam antes das mutações. Sem ID do provedor, uma correção que move todo o intervalo para um período disjunto ainda precisa de investigação; renomeação não é associada automaticamente.
- `db/migrations/2026-10-03-wuwa-events.sql` amplia as funções públicas existentes sem migrar linhas ou alterar grants/roles. O schema atual recebe o mesmo contrato. A limpeza de HSR só roda quando a sincronização seleciona HSR.
- `npm test`: **213 testes aprovados** (43 Jest + 170 Node) na suíte conjunta WuWa/NTE, incluindo schema novo, upgrade completo e reaplicação da migração com conclusão e prazo manual preservados.
- No Supabase `zzcxhtblbmiakuvdakic`, os testes SQL compartilhados e de WuWa passaram como `anon`, com rollback. A conferência posterior encontrou zero fixtures temporárias.
- Primeira sincronização: dez candidatos novos, nove tarefas importadas e um candidato em revisão. Segunda sincronização: zero novos candidatos, dez candidatos sem alteração e as mesmas nove tarefas atualizadas; nenhuma duplicata de vínculo.
- Conferência SQL independente: nove inícios/prazos coincidem com os valores esperados; hashes dos jogos, das tarefas manuais/outros jogos e dos candidatos de outras fontes permaneceram iguais aos anteriores à migração. Funções continuam `security invoker`.

Na entrega conjunta 1.4.0, a sincronização após aceitar a estimativa de Moonlit Path atualizou um candidato e importou uma tarefa. A repetição encontrou zero candidatos novos, dez sem alteração e as mesmas dez tarefas atualizadas, sem revisão. SQL confirmou o início/fim estimado de Moonlit Path, ausência de duplicatas e preservação exata das nove tarefas WuWa anteriores, dos jogos, tarefas manuais/outros jogos e candidatos de outras fontes. A migração NTE posterior e os contratos dos cinco jogos também passaram no destino com rollback.

Comandos de manutenção: `node scripts/syncEvents.js --game=wuwa --dry-run` e, para sincronizar, o mesmo comando sem `--dry-run`. `npm start` serve a interface local. A estimativa aceita de Moonlit Path consta da política e da evidência; novas edições continuam exigindo conferência.
