# Convenções do Gacha Management

## Escopo pessoal e decisões proporcionais

Cristian é o único usuário frequente; o projeto atende ao seu uso pessoal, sem objetivo comercial. Demonstrações ocasionais não implicam uma base empresarial de usuários. Os dados têm baixa criticidade e podem ser recriados ou reformulados quando isso for combinado. Preferir ajustes locais e a estrutura existente em correções/melhorias; não presumir necessidade de conversores, arquitetura de escala ou preservação histórica extensa. As decisões devem respeitar o fluxo solicitado e as autorizações do momento. Contexto detalhado em [AGENTS.md](../AGENTS.md).

Este documento registra decisões verificadas do projeto e preferências de Cristian. Não autoriza novas entregas, publicação ou alterações em serviços externos por si só.

## Implementação

- JavaScript com módulos ES, HTML e CSS; Node 20+ para ferramentas e testes. Não introduzir framework ou reorganização ampla para integrar outro endpoint do mesmo provedor.
- Identificadores, testes e comentários técnicos novos em inglês; comunicação e documentação de decisões em português. Preserve a língua dos textos existentes do produto.
- `js/events/eventGames.js` é o registro de jogos/fontes. Rotas de revisão e CLI derivam dos jogos ativos. Uma fixture disponível não significa integração ativa.
- `scripts/eventSync.js` descobre e reconcilia candidatos via REST; funções públicas SQL fazem a importação transacional de tarefas. Use esses contratos; não duplique regras de importação no frontend.
- `db/schema.sql` representa instalação nova. Uma mudança de banco também precisa de migração incremental em `db/migrations/` e da ordem explícita em `tests/helpers/testDatabase.mjs`.

## Fontes e horários

- Preferência de Cristian: importações de API, lotes e qualquer outro carregamento devem ser automáticos, sem solicitar datas ou prazos na interface. Datas confirmadas por ele dentro do jogo são evidência válida: registrar uma referência absoluta e sua procedência uma vez, calcular os próximos ciclos e não pedir a mesma informação novamente. Se faltar uma regra, esclarecer durante o desenvolvimento; não transferir a configuração do calendário para cada importação/perfil. Edição manual de uma tarefa existente continua disponível.

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
- A parte 4 aplica identidade por edição aos cinco jogos. Correção de prazo da mesma edição reutiliza a identidade persistida; períodos separados criam outra edição. Chaves antigas só são adotadas com correspondência segura, nunca apenas pelo nome.
- Uma nova edição começa sem conclusão ou decisão herdada da anterior. Correspondência ambígua deve interromper a escrita e pedir investigação, não escolher silenciosamente uma tarefa.
- Tarefas recorrentes manuais continuam separadas dos eventos importados. A parte 4 exclui importados vencidos nos cinco jogos conforme o prazo e a recorrência de cada perfil; marcas mínimas impedem recriação. O sincronizador limpa antes das correções e após importar. O contrato HSR antigo conserva sua contagem de definições removidas.
- Cristian reafirmou em 05/10/2026 que o banco live é descartável e pode ser reinstalado do zero. `npm run db:reset:build` gera a instalação atômica com o schema atual; geração não é aplicação no destino. Roteiro e cenários em [event-editions-expiry.md](event-editions-expiry.md).

## Testes e fixtures

- `tests/fixtures/*-en-US.json` são amostras reais congeladas, usadas apenas em testes. Produção busca o endpoint remoto.
- `manifest.json` registra URL, idioma, captura, SHA-256, quantidade de atividades e relógio de referência. `.gitattributes` conserva LF para hashes iguais em Windows/Linux.
- Captura explícita: `node scripts/captureEventFixture.js wuwa`. Não atualizar fixtures automaticamente no CI nem em testes; revisar o diff e expectativas independentes antes de aceitar uma nova amostra.
- Use relógio fixo em normalização/sincronização. Escreva resultados esperados concretos a partir das fontes; não derive o resultado esperado da função que está sendo testada.
- `tests/fixtures/wuwa-source-contract.json` e `nte-source-contract.json` registram a evidência independente dos anúncios e trechos fornecidos. Não confundir essa evidência com a resposta bruta da API.
- Jest protege lógica existente; Node testa API/REST/CLI/rotas; PGlite executa SQL real como `anon` com RLS em instalação nova e upgrade completo; jsdom executa HTML/módulos reais com cliente estrito simulado.
- Testar comportamento: conversão/expiração exata, erro sem mutação, preservação de estado, isolamento entre jogos, idempotência, migração e rollback. Contagem de cobertura por si só não é objetivo.
- `npm ci` instala versões do lock; `npm test` executa tudo. Para investigação: `npm run test:jest`, `npm run test:node`, `npm run test:db`. CI testa Windows e Linux; sincronização diária às 07h30 de Brasília (10h30 UTC) exige testes aprovados e roda no GitHub Actions, independentemente do computador local.
- Testes locais não validam permissões reais de PostgREST, concorrência entre conexões ou CSS renderizado. Verificar o destino e a interface quando relevante.

### Execução local em etapas

Preferência de Cristian registrada em 07/10/2026 para reduzir o tempo de validação:

1. **Etapa 1 — testes focados:** executar os arquivos que protegem os comportamentos alterados e efeitos colaterais plausíveis. Uma correção de interface pode usar `node --test tests/gamePresentation.test.mjs tests/gameStamina.test.mjs tests/uiFeedback.test.mjs`; selecionar outros arquivos quando o escopo mudar. Mudanças no banco incluem os contratos SQL afetados, com instalação nova/upgrade quando aplicável.
2. **Etapa 2 — suíte completa:** executar `npm test` no fechamento de versões MAJOR/MINOR, como `1.9.0` ou `2.0.0`, depois de passar a etapa 1. Não repetir a suíte completa a cada ajuste intermediário.

Versões PATCH, como `1.9.1` e `1.9.2`, usam somente a etapa 1; a etapa 2 só roda nesses casos se Cristian pedir explicitamente. Não repetir verificações já aprovadas quando só documentação/numeração mudou. Informar quais etapas foram executadas e distinguir evidência anterior de uma execução nova. A numeração continua seguindo o escopo e as regras do changelog.

Essa preferência organiza as execuções locais do agente. Os workflows existentes do GitHub Actions continuam executando seus próprios testes; este registro não muda o CI nem a sincronização diária.

## Orientação prática na entrega

Antes do fechamento **Workflow**, incluir um parágrafo **Para testar** com ações concretas na interface e resultados esperados, em linguagem simples. Não substituir esse roteiro apenas por comandos automatizados. Adaptar os passos ao que mudou; quando Cristian já tiver validado, apresentá-los como conferência opcional após a publicação, sem pedir a mesma validação novamente.

Exemplo aprovado por Cristian: “Para testar, recarregue a prévia, selecione NTE e confira o ícone. Em um To-do vazio, digite o primeiro item, pressione Enter e escreva o segundo. Salve e recarregue para conferir a persistência.”

## Entrega e sincronização

1. Validar calendário/região/horários e contrato de identidade antes de ativar o jogo.
2. Atualizar política, registro, schema/migração e expectativas de testes; ativar cada jogo somente após validação própria.
3. Rodar a suíte e `node scripts/syncEvents.js --game=wuwa --dry-run` (ou `--game=nte`) para consultar a API sem escrever no banco.
4. Conferir projeto de destino e uma única sigla do jogo; aplicar/verificar migração antes de sincronizar. Respeitar a ordem: WuWa antes de NTE. Uma migração anterior reaplicada pode substituir funções; reaplicar também as posteriores nessa ordem.
5. Sincronizar, repetir e conferir ausência de duplicatas, revisão e preservação dos outros jogos. Registrar números reais e qualquer pendência.

Antes de commit/merge, ler `CHANGELOG.md`, sugerir versão e consultar Cristian quando ainda não houver autorização no mesmo escopo. Não incrementar a cada commit da mesma entrega. Commit, push e nova versão dependem do pedido vigente.

## Perfis (versão 1.6.0)

CRAN, Demo e Convidado são perfis públicos, sem autenticação. Catálogo e capas são compartilhados; progresso, resina, recorrência e decisões usam tabelas por perfil e RPCs públicas. A seleção controla Games, Tasks, dropdowns e revisão. Cada página conserva seu perfil ativo mesmo quando outra aba muda a preferência salva. Login futuro exige ator autenticado no servidor e RLS próprios; a preferência do navegador não protege acesso. Roteiro e prévia local em [profiles-phases.md](profiles-phases.md).
