# Preparação das próximas integrações

## O que está pronto

O fluxo continua simples: calendário da StarRailAssistant → normalização → candidatos → RPC transacional → tarefas → interface. Genshin, HSR e ZZZ estão ativos. WuWa e NTE estão no catálogo como `planned`: podem ter amostras capturadas, mas não entram nas rotas, na revisão nem na sincronização.

O catálogo está em `js/events/eventGames.js`. `EVENT_GAMES` é somente o subconjunto ativo; as rotas são derivadas dele. Não é necessário copiar a lista de jogos para o router. O banco continua validando fontes e siglas em SQL: os testes de contrato executam a importação para cada jogo ativo, tanto no schema novo quanto no banco migrado. Ativar um jogo sem atualizar o SQL faz a suíte falhar.

Isso prepara a integração de eventos; não implementa seleção inicial de jogos, perfis, fallback entre idiomas ou mudanças na população de weeklies.

## Amostras reais, sem consultas durante os testes

| Jogo | Fixture em `tests/fixtures/` | Situação |
|---|---|---|
| Genshin | `ys-en-US.json` | Normalização e dry-run testados |
| HSR | `sr-en-US.json` | Normalização e dry-run testados |
| ZZZ | `zzz-en-US.json` | Normalização e dry-run testados |
| WuWa | `ww-en-US.json` | Contrato da resposta capturado; horários ainda não validados |
| NTE | `nte-en-US.json` | Contrato da resposta capturado; horários/região ainda não validados |

`manifest.json` registra URL, idioma, captura, relógio de referência, hash SHA-256 e quantidade de atividades. ZZZ mantém a amostra anterior de 02/10/2026; as outras foram capturadas em 03/10/2026. São dados congelados de teste, não calendários usados pela aplicação em produção. O relógio fixo impede que o teste falhe daqui a um mês porque os eventos venceram.

A documentação pública da fonte lista os endpoints `ww-en-US.json` e `nte-en-US.json`: https://starrailassistant.top/reference/public-api/. O JSON não contém ID por atividade nem offset de fuso nos horários. Idioma inglês não comprova que o calendário corresponde ao servidor América.

Para atualizar uma amostra explicitamente, com acesso à internet:

```sh
node scripts/captureEventFixture.js wuwa
```

O comando grava somente a fixture escolhida e seus metadados; não acessa o Supabase. As quebras de linha são normalizadas para LF e preservadas por `.gitattributes`, para manter os hashes iguais no Windows e no Linux. Não o execute automaticamente no CI. Revise o diff e ajuste expectativas concretas em `tests/eventFixtures.test.mjs` após conferir datas, nomes e contagens. Não gere as expectativas usando a mesma função que está sendo testada. `npm test` usa apenas os arquivos versionados.

## Como executar e interpretar os testes

```sh
npm ci
npm test
# Suítes separadas, para investigar uma falha
npm run test:jest
npm run test:node
npm run test:db
```

Node 20 ou superior. O executor enumera os arquivos sem depender de expansão de `*.mjs` pelo shell, funcionando no Windows e no Linux. `npm test -- --runInBand` continua aceito. Opções adicionais são encaminhadas ao Jest; `test:node` executa a seleção completa de testes Node.

| Fronteira | Testes | Comportamento protegido |
|---|---|---|
| Resposta real da API | `eventFixtures.test.mjs`, `zzzEvents.test.mjs` | Proveniência, nomes únicos na amostra, eventos atuais/futuros, capas opcionais, prazos com relógio fixo |
| Normalização | `starRailAssistantGenshin.test.mjs`, `hsrEvents.test.mjs`, `eventSyncSafety.test.mjs` | Datas ausentes, datas impossíveis, fallback, reset América e instante exato de expiração |
| Sincronização REST | `autoEvents.test.mjs`, `genshinSync.test.mjs`, `eventSyncSafety.test.mjs` | Fonte/jogo corretos, preservar decisão de ignorar, dry-run sem banco, rejeitar respostas inválidas sem mutações, ausência na API apenas inativa candidatos |
| CLI e rotas | `eventSyncSafety.test.mjs`, `eventRoutes.test.mjs` | Continuar os outros jogos após falha; validar argumentos; abrir revisão local e no GitHub Pages para todos os ativos |
| PostgreSQL e migrações | `database.test.mjs` + quatro arquivos `.sql` | Importação repetida, conclusão preservada, correções manuais, restaurar API, ignorar, isolamento de jogos, limpeza HSR, recorrência e rollback |
| HTML e formulários | `uiIntegration.test.mjs` | Campos e validação reais, URL manual, presets/Custom, edição importada bloqueada, erro de salvamento preserva entrada, filtros combinados e placeholders |
| Lógica existente | `*.test.js` | Stamina, datas, mappers, filtros e renovação de ciclos vencidos |

Os testes SQL usam PGlite, um PostgreSQL descartável em memória, e carregam os arquivos reais do projeto. O ambiente cria a role `anon` e os grants padrão relevantes do Supabase; as verificações rodam com essa role e RLS habilitado. Há dois caminhos: schema atual + seed e baseline anterior aos eventos + todas as migrações na ordem de entrega. O segundo preserva uma tarefa semanal antiga, já concluída. A migração de recorrência também é reexecutada para verificar idempotência. Cada arquivo SQL deve deixar as linhas intactas após rollback; sequências podem avançar mesmo com rollback, como no PostgreSQL.

Os testes de interface usam jsdom e um cliente Supabase simulado que rejeita operações inesperadas. Executam os módulos e o HTML reais, mas não renderizam CSS. Não substituem a inspeção visual no navegador, testes de concorrência com múltiplas conexões, nem a verificação final do PostgREST e das permissões reais do projeto Supabase. A captura de fixtures requer rede; a suíte normal não precisa de credenciais ou conexão ao banco real.

O CI executa a suíte em Windows e Linux. O workflow semanal executa os testes antes da sincronização. Uma falha impede a etapa de escrita; isso não transforma toda a sincronização REST em uma transação única: uma falha de escrita após candidatos anteriores terem sido salvos pode deixar uma atualização parcial, reconciliada na próxima execução.

## Próxima entrega: Wuthering Waves

1. Conferir `ww-en-US.json` e validar os horários de início/fim com uma fonte do jogo para o servidor acompanhado. A amostra inclui reset às 04:00/03:59:59, início às 10:00/11:00 e fim às 11:59:59. A semelhança com HoYo não basta para reutilizar a conversão.
2. Tornar a política de horários explícita por jogo no normalizador, preservando o padrão validado de GI/HSR/ZZZ. Criar casos esperados para reset, horário fora do reset, prazo ausente/inconsistente e limite de expiração. Não usar um único deslocamento fixo para todos os horários sem evidência.
3. Conferir a identidade das edições recorrentes. A amostra tem dez nomes distintos, mas isso não comprova que o mesmo nome não será reutilizado no calendário seguinte. Manter chaves atuais dos jogos existentes; se for necessário um novo contrato, planejar a migração dos vínculos/estados antes de mudar `external_id`.
4. Adicionar a fonte `starrailassistant-wuwa`/sigla `WuWa` às funções SQL e criar uma migração compatível. Incluir a migração na ordem explícita de `tests/helpers/testDatabase.mjs`; um teste verifica que nenhum arquivo ficou fora dessa sequência. Adicionar a sigla ao teste transacional compartilhado de importação; conferir preservação de conclusão, prazo manual e ignorados.
5. Acrescentar expectativas específicas em `eventFixtures.test.mjs` e trocar o status para `active`. Rotas, revisão e CLI passam a usar o registro automaticamente; testes REST, rotas e SQL acompanham os ativos. A lista esperada de ativos também precisa ser revisada conscientemente.
6. Rodar `npm test`; depois, dry-run da fonte real. Confirmar um único jogo `WuWa` cadastrado. Aplicar e verificar a migração no ambiente de destino antes da primeira sincronização real; repetir a sincronização e conferir ausência de duplicatas.

## Última entrega: NTE

Repetir o mesmo fluxo após WuWa, aproveitando a política por jogo já construída. A amostra de NTE inclui eventos às 05:00/04:59:59 e vários prazos às 05:59:59, diferentes do reset hoje reconhecido. Validar também a correspondência entre calendário asiático e global; uma diferença de dias não se resolve apenas convertendo fuso. Até isso estar explícito, a fixture serve para investigação, sem habilitar importação.

## Sugestões anteriores: o que mudou e o que fica separado

- **Já resolvido antes desta preparação:** falhas ao salvar mantêm os formulários; tarefas recorrentes vencidas avançam até o próximo ciclo futuro; imagens manuais e filtros estão implementados.
- **Resolvido nesta preparação:** fixtures por jogo, relógio controlado, comando único, testes SQL/DOM reproduzíveis, rotas derivadas do registro e barreira de testes antes da sincronização.
- **Prioridade alta para integrações:** política de horário por jogo e identidade de novas edições. Nomes reutilizados ainda podem herdar conclusão/ignorado da edição anterior. Não trocar a chave simplesmente para `nome + datas`: correções de prazo poderiam criar duplicatas.
- **Melhoria independente, complexidade média:** distinguir erro de leitura de lista vazia e propagar erros de conclusão/exclusão. Hoje alguns métodos de `taskDB.js`/`gameDB.js` capturam erros e retornam vazio/null ou apenas registram a falha. Alterar isso exige atualizar os consumidores e seus estados de erro.
- **Melhoria independente, complexidade média:** weeklies iniciais por sigla e próximo reset, removendo IDs fixos/datas de 2025; tratar repetição do seed e preferência de não recriar tarefas removidas.
- **Mudança de comportamento a revisar:** limpeza de vencidos continua restrita ao HSR. Generalizá-la exige decidir preservação/recuperação para todos os jogos e testar tarefas manuais e recorrentes. Ausência em resposta da API continua sem excluir tarefas.

Não é necessário adicionar framework, camadas genéricas de providers ou reorganizar toda a aplicação para integrar mais dois endpoints do mesmo fornecedor. Uma política de horário explícita, contratos verificados e migrações pequenas atendem ao problema atual.
