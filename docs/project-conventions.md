# Convenções do Gacha Management

Este documento registra decisões verificadas do projeto e preferências de Cristian. Não autoriza novas entregas, publicação ou alterações em serviços externos por si só.

## Implementação

- JavaScript com módulos ES, HTML e CSS; Node 20+ para ferramentas e testes. Não introduzir framework ou reorganização ampla para integrar outro endpoint do mesmo provedor.
- Identificadores, testes e comentários técnicos novos em inglês; comunicação e documentação de decisões em português. Preserve a língua dos textos existentes do produto.
- `js/events/eventGames.js` é o registro de jogos/fontes. Rotas de revisão e CLI derivam dos jogos ativos. Uma fixture disponível não significa integração ativa.
- `scripts/eventSync.js` descobre e reconcilia candidatos via REST; funções públicas SQL fazem a importação transacional de tarefas. Use esses contratos; não duplique regras de importação no frontend.
- `db/schema.sql` representa instalação nova. Uma mudança de banco também precisa de migração incremental em `db/migrations/` e da ordem explícita em `tests/helpers/testDatabase.mjs`.

## Fontes e horários

- StarRailAssistant fornece o calendário JSON de descoberta; Game8 é a referência solicitada para conferir datas finais e horários na América. Anúncios oficiais complementam a distinção entre manutenção global e horário do servidor.
- Confira versão/edição e data da informação. Conteúdo indexado antigo não confirma uma edição atual. Trechos fornecidos por Cristian são evidência identificada como tal, não uma leitura independente da página.
- Inglês no endpoint não significa servidor América. Preserve o horário bruto da fonte e o instante convertido separadamente. Nunca use o fuso do computador para converter o calendário.
- WuWa América: UTC−5 fixo; reset diário às 04:00 do servidor, equivalente a 09:00 UTC / 06:00 Brasília. Não usar horário de verão de Nova York como substituto do fuso do servidor.
- NTE América: UTC−5 fixo; reset às 05:00 do servidor, equivalente a 10:00 UTC / 07:00 Brasília. Seus anúncios distinguem campos UTC+8 globais e campos do servidor; detalhes em [nte-validation.md](nte-validation.md).
- Reset diário não determina todo início/fim. Atualizações podem começar em um instante global e o mesmo evento terminar em horário do servidor. No WuWa e nas novas integrações, campo sem base confirmada fica em revisão; não importar um prazo presumido. GI/HSR/ZZZ conservam a política anterior de sugestão/fallback descrita no README; não alterar esse comportamento incidentalmente.
- Exceção explícita: Cristian aceitou em 04/10/2026 a estimativa da API para Moonlit Path da edição 30/09–11/11/2026. Registrar essa procedência; não apresentar a hora como verificada nem estender a exceção para outras edições.
- Referências WuWa: [reset](https://game8.co/games/Wuthering-Waves/archives/454085), [eventos](https://game8.co/games/Wuthering-Waves/archives/453473), [Chord Cleansing](https://game8.co/games/Wuthering-Waves/archives/457211), [Bountiful Crescendo](https://game8.co/games/Wuthering-Waves/archives/458244). Evidências e limitações em [wuwa-validation.md](wuwa-validation.md).

## Identidade e estado

- Preservar conclusão, decisão de ignorar, prazo manual e vínculo candidato/tarefa durante sincronizações repetidas. Ausência na API inativa o candidato; não exclui a tarefa.
- Não mudar as chaves já utilizadas por GI/HSR/ZZZ incidentalmente. WuWa/NTE identificam edições diferentes do mesmo nome; correção de prazo de uma edição deve reutilizar a identidade persistida.
- Uma nova edição começa sem conclusão ou decisão herdada da anterior. Correspondência ambígua deve interromper a escrita e pedir investigação, não escolher silenciosamente uma tarefa.
- Tarefas recorrentes manuais continuam separadas dos eventos importados. Limpeza automática de vencidos permanece restrita ao contrato existente do HSR.

## Testes e fixtures

- `tests/fixtures/*-en-US.json` são amostras reais congeladas, usadas apenas em testes. Produção busca o endpoint remoto.
- `manifest.json` registra URL, idioma, captura, SHA-256, quantidade de atividades e relógio de referência. `.gitattributes` conserva LF para hashes iguais em Windows/Linux.
- Captura explícita: `node scripts/captureEventFixture.js wuwa`. Não atualizar fixtures automaticamente no CI nem em testes; revisar o diff e expectativas independentes antes de aceitar uma nova amostra.
- Use relógio fixo em normalização/sincronização. Escreva resultados esperados concretos a partir das fontes; não derive o resultado esperado da função que está sendo testada.
- `tests/fixtures/wuwa-source-contract.json` e `nte-source-contract.json` registram a evidência independente dos anúncios e trechos fornecidos. Não confundir essa evidência com a resposta bruta da API.
- Jest protege lógica existente; Node testa API/REST/CLI/rotas; PGlite executa SQL real como `anon` com RLS em instalação nova e upgrade completo; jsdom executa HTML/módulos reais com cliente estrito simulado.
- Testar comportamento: conversão/expiração exata, erro sem mutação, preservação de estado, isolamento entre jogos, idempotência, migração e rollback. Contagem de cobertura por si só não é objetivo.
- `npm ci` instala versões do lock; `npm test` executa tudo. Para investigação: `npm run test:jest`, `npm run test:node`, `npm run test:db`. CI testa Windows e Linux; sincronização semanal exige testes aprovados.
- Testes locais não validam permissões reais de PostgREST, concorrência entre conexões ou CSS renderizado. Verificar o destino e a interface quando relevante.

## Entrega e sincronização

1. Validar calendário/região/horários e contrato de identidade antes de ativar o jogo.
2. Atualizar política, registro, schema/migração e expectativas de testes; ativar cada jogo somente após validação própria.
3. Rodar a suíte e `node scripts/syncEvents.js --game=wuwa --dry-run` (ou `--game=nte`) para consultar a API sem escrever no banco.
4. Conferir projeto de destino e uma única sigla do jogo; aplicar/verificar migração antes de sincronizar. Respeitar a ordem: WuWa antes de NTE. Uma migração anterior reaplicada pode substituir funções; reaplicar também as posteriores nessa ordem.
5. Sincronizar, repetir e conferir ausência de duplicatas, revisão e preservação dos outros jogos. Registrar números reais e qualquer pendência.

Antes de commit/merge, ler `CHANGELOG.md`, sugerir versão e consultar Cristian quando ainda não houver autorização no mesmo escopo. Não incrementar a cada commit da mesma entrega. Commit, push e nova versão dependem do pedido vigente.
