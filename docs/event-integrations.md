# Preparação das próximas integrações

## O que está pronto

O fluxo continua simples: calendário da StarRailAssistant → normalização → candidatos → RPC transacional → tarefas → interface. Genshin, HSR, ZZZ, WuWa e NTE estão ativos. Ativação exige política conferida e suporte SQL; uma amostra capturada sozinha não habilita o jogo.

O catálogo está em `js/events/eventGames.js`. `EVENT_GAMES` é somente o subconjunto ativo; as rotas são derivadas dele. Não é necessário copiar a lista de jogos para o router. O banco continua validando fontes e siglas em SQL: os testes de contrato executam a importação para cada jogo ativo, tanto no schema novo quanto no banco migrado. Ativar um jogo sem atualizar o SQL faz a suíte falhar.

Isso prepara a integração de eventos; não implementa seleção inicial de jogos, perfis, fallback entre idiomas ou mudanças na população de weeklies.

## Amostras reais, sem consultas durante os testes

| Jogo | Fixture em `tests/fixtures/` | Situação |
|---|---|---|
| Genshin | `ys-en-US.json` | Normalização e dry-run testados |
| HSR | `sr-en-US.json` | Normalização e dry-run testados |
| ZZZ | `zzz-en-US.json` | Normalização e dry-run testados |
| WuWa | `ww-en-US.json` | Normalização América, edições, dry-run e importação testados |
| NTE | `nte-en-US.json` | Normalização global/América, edições, dry-run e importação testados |

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
| WuWa/NTE por campo e edição | `wuwaEvents.test.mjs`, `wuwaSourceContract.test.mjs`, `nteEvents.test.mjs` | Evidência independente, clocks globais/servidor, estimativa expressamente aceita, desconhecidos para revisão e preservação de estado no PostgreSQL |
| Sincronização REST | `autoEvents.test.mjs`, `genshinSync.test.mjs`, `eventSyncSafety.test.mjs` | Fonte/jogo corretos, preservar decisão de ignorar, dry-run sem banco, rejeitar respostas inválidas sem mutações, ausência na API apenas inativa candidatos |
| CLI e rotas | `eventSyncSafety.test.mjs`, `eventRoutes.test.mjs` | Continuar os outros jogos após falha; validar argumentos; abrir revisão local e no GitHub Pages para todos os ativos |
| PostgreSQL e migrações | `database.test.mjs` + cinco arquivos `.sql` | Importação repetida, conclusão preservada, correções manuais, restaurar API, ignorar, isolamento de jogos, limpeza HSR, recorrência e rollback |
| HTML e formulários | `uiIntegration.test.mjs` | Campos e validação reais, URL manual, presets/Custom, edição importada bloqueada, erro de salvamento preserva entrada, filtros combinados e placeholders |
| Lógica existente | `*.test.js` | Stamina, datas, mappers, filtros e renovação de ciclos vencidos |

Os testes SQL usam PGlite, um PostgreSQL descartável em memória, e carregam os arquivos reais do projeto. O ambiente cria a role `anon` e os grants padrão relevantes do Supabase; as verificações rodam com essa role e RLS habilitado. Há dois caminhos: schema atual + seed e baseline anterior aos eventos + todas as migrações na ordem de entrega. O segundo preserva uma tarefa semanal antiga, já concluída. A migração de recorrência também é reexecutada para verificar idempotência. Cada arquivo SQL deve deixar as linhas intactas após rollback; sequências podem avançar mesmo com rollback, como no PostgreSQL.

Os testes de interface usam jsdom e um cliente Supabase simulado que rejeita operações inesperadas. Executam os módulos e o HTML reais, mas não renderizam CSS. Não substituem a inspeção visual no navegador, testes de concorrência com múltiplas conexões, nem a verificação final do PostgREST e das permissões reais do projeto Supabase. A captura de fixtures requer rede; a suíte normal não precisa de credenciais ou conexão ao banco real.

O CI executa a suíte em Windows e Linux. O workflow semanal executa os testes antes da sincronização. Uma falha impede a etapa de escrita; isso não transforma toda a sincronização REST em uma transação única: uma falha de escrita após candidatos anteriores terem sido salvos pode deixar uma atualização parcial, reconciliada na próxima execução.

## Wuthering Waves: implementação

Investigação e fontes em [wuwa-validation.md](wuwa-validation.md); convenções para próximas sessões em [project-conventions.md](project-conventions.md). WuWa e NTE estão ativos no registro, CLI e revisão.

- `js/events/wuwa.js` explicita a base por campo/edição: UTC−5 América e UTC+8 para inícios globais confirmados. Bountiful Crescendo/Chord Cleansing reaproveitam o padrão de reset validado em diversas edições. Horários desconhecidos não recebem prazo presumido e ficam em revisão.
- Os dez eventos da fixture 3.7 são importáveis: nove com bases conferidas e Moonlit Path com estimativa de horário aceita por Cristian, mantendo as datas atuais fornecidas por ele. Os sete anúncios oficiais e os trechos atuais dos dois modos enviados por Cristian são registrados como evidências distintas.
- Identidade inicial combina nome normalizado e início bruto interpretado da fonte; datas sem início usam o fim, e ausência dos dois gera chave de revisão. Reconciliação com a mesma ocorrência (início igual ou períodos sobrepostos) conserva a chave persistida. Períodos disjuntos criam edição independente; mudar a versão do calendário não muda a chave. Associação ambígua bloqueia antes das mutações.
- Uma correção que move todo o período para fora do anterior e altera o início não pode ser distinguida de nova edição sem ID do provedor; revisar essa situação antes de sincronizar. Renomeação também não é associação automática. As chaves de GI/HSR/ZZZ não foram alteradas.
- Schema e migração `2026-10-03-wuwa-events.sql` habilitam a fonte/sigla, preservando funções públicas, grants e security invoker. Testes cobrem instalação nova, upgrade, repetição da migração e dados existentes. A limpeza HSR só roda ao sincronizar HSR; sincronizar WuWa não remove tarefas dos outros jogos.
- A suíte combina fixtures, horários esperados independentes, REST, rotas, DOM e PostgreSQL. Um teste executa o fluxo de sincronização usando o banco descartável para verificar correção de datas, conclusão, prazo manual, mudança da versão, ignorado e nova edição sem herdar estado.

Para novas edições: confirmar no Game8, complementar a base global/servidor em anúncio oficial quando necessário, acrescentar evidência e política por campo e atualizar expectativas com relógio fixo. A captura da fixture continua explícita; não adicionar datas de produção aos testes automaticamente.

Entrega conjunta 1.4.0: 213 testes passaram; migrações aplicadas no destino e contratos dos cinco jogos passaram como `anon` com rollback. Sincronizados dez eventos WuWa e nove NTE; repetir não criou candidatos/tarefas extras. SQL confirmou datas esperadas, ausência de revisão/duplicatas e preservação dos dados anteriores. Resultados e limitações completos nos documentos de validação de cada jogo.

## Neverness to Everness: implementação

Fontes e campos em [nte-validation.md](nte-validation.md). As notas oficiais globais 1.4 conferem os nove eventos da fixture e especificam UTC+8 ou horário do servidor. Game8 confirma América UTC−5 e reset às 05:00. `js/events/nte.js` aplica bases por campo somente às edições verificadas; fim global expira no instante global, sem acrescentar 13 horas. Novas edições ou horários alterados ficam em revisão.

A integração reutiliza identidade por edição, revisão, CLI e testes compartilhados. `2026-10-04-nte-events.sql` amplia as funções públicas após WuWa, preservando grants e security invoker. `tests/nteEvents.test.mjs` cruza evidência oficial e fixture, verifica limites de expiração e executa sincronização com PostgreSQL, protegendo conclusão, prazo manual, ignorados e independência da próxima edição. O adaptador estrito em `tests/helpers/databaseFetch.mjs` é compartilhado com WuWa. A API pode omitir eventos presentes no jogo; sua integração não promete calendário completo.

## Sugestões anteriores: o que mudou e o que fica separado

- **Já resolvido antes desta preparação:** falhas ao salvar mantêm os formulários; tarefas recorrentes vencidas avançam até o próximo ciclo futuro; imagens manuais e filtros estão implementados.
- **Resolvido nesta preparação:** fixtures por jogo, relógio controlado, comando único, testes SQL/DOM reproduzíveis, rotas derivadas do registro e barreira de testes antes da sincronização.
- **Prioridade alta para integrações:** política de horário por jogo e identidade de novas edições. WuWa/NTE já distinguem edições; GI/HSR/ZZZ conservam suas chaves atuais. Não trocar a chave simplesmente para `nome + datas`: correções de prazo poderiam criar duplicatas.
- **Melhoria independente, complexidade média:** distinguir erro de leitura de lista vazia e propagar erros de conclusão/exclusão. Hoje alguns métodos de `taskDB.js`/`gameDB.js` capturam erros e retornam vazio/null ou apenas registram a falha. Alterar isso exige atualizar os consumidores e seus estados de erro.
- **Melhoria independente, complexidade média:** weeklies iniciais por sigla e próximo reset, removendo IDs fixos/datas de 2025; tratar repetição do seed e preferência de não recriar tarefas removidas.
- **Mudança de comportamento a revisar:** limpeza de vencidos continua restrita ao HSR. Generalizá-la exige decidir preservação/recuperação para todos os jogos e testar tarefas manuais e recorrentes. Ausência em resposta da API continua sem excluir tarefas.

Não é necessário adicionar framework, camadas genéricas de providers ou reorganizar toda a aplicação para integrar mais dois endpoints do mesmo fornecedor. Uma política de horário explícita, contratos verificados e migrações pequenas atendem ao problema atual.
