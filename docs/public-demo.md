# Demo pública isolada

**Estado em 03/11/2026: implementação revisada e validada para a versão 1.20.0; ativação da hospedagem e verificação da URL pública pendentes.** O perfil chamado Demo na aplicação normal continua usando o banco compartilhado e não deve ser oferecido como demonstração descartável.

## Executar e gerar

```sh
npm ci
npm run demo:preview
# http://127.0.0.1:5503/GachaManagement-cloud/demo/
npm run demo:capture
npm run demo:build
npm run pages:build
```

O preview prepara automaticamente um catálogo se ele ainda não existir ou tiver mais de 24 horas; `--refresh` força nova coleta. `--port=5504` permite outra porta. O comando de captura exige rede no computador de desenvolvimento/CI; depois da preparação, o visitante não depende da API nem dos servidores de imagem.

Artefatos ignorados pelo Git: `.local-deliveries/public-demo/catalogue/` contém o catálogo e capas; `build/` contém somente a demo; `pages/` contém a aplicação normal na raiz e a demo em `demo/`. O servidor de prévia é somente estático; não recebe consultas ou gravações. Depois do build, qualquer servidor de arquivos HTTP(S) pode entregar a demo no caminho `/GachaManagement-cloud/demo/`.

## Decisão e isolamento

- Reutiliza HTML, CSS Sangonomiya, repositórios, roteador e telas reais. O build adapta o cliente de dados, a seleção de perfil inicial/chave de preferência, a origem da agenda e o base path. Tasks e revisão mantêm as informações de fonte reais da API; o calendário de banners permanece demonstrativo.
- PGlite 0.5.8 já faz parte do lock de testes/prévias. Seu runtime é copiado do pacote instalado, com licença Apache-2.0, para o artefato. Não há framework, bundler ou dependência nova.
- O PostgreSQL roda em worker, com IndexedDB no navegador e os contratos SQL de `db/schema.sql`. O worker de múltiplas abas compartilha uma conexão por navegador e caminho da demo. Visitantes de navegadores/dispositivos diferentes não compartilham dados. [Persistência](https://pglite.dev/docs/filesystems) e [worker oficial](https://pglite.dev/docs/multi-tab-worker).
- O artefato não inclui cliente Supabase, endpoint/chave pessoais nem catálogos de banners publicados. O arquivo de compatibilidade `supabaseClient.js` apenas reexporta o adaptador local; `supabase.config.js` só libera a inicialização da interface, sem credenciais ou biblioteca remota.
- CSP restringe scripts e conexões à própria origem e imagens a recursos locais. `unsafe-eval` é necessário ao código Emscripten do PGlite instalado; não autoriza scripts remotos. Downloads do runtime são explícitos para tratar falhas de rede antes da inicialização.
- Preferência de perfil da demo possui chave própria; não lê/escreve a seleção da aplicação normal. Não há login, telemetria ou envio do progresso local. Somente o catálogo público publicado é atualizado; nunca aplicar este SQL de instalação/restauração ao banco compartilhado.

## Eventos e capas da API

`scripts/captureDemoCatalogue.js` consulta as cinco fontes de `eventGames.js`. Reutiliza `discoverEventCandidates` e `assignEditionKeys`, extraídos para o módulo público puro `js/events/eventCatalogue.js`; o sincronizador de produção conserva suas exportações e comportamento. A captura da demo não importa configuração, cliente ou rotina de gravação do Supabase.

Cada jogo registra sua própria data de coleta. Falha parcial conserva o último catálogo válido daquele jogo; uma captura sem nenhum dado disponível falha sem substituir o artefato anterior. O horário do build não é apresentado como data de coleta de uma fonte que falhou. Imagens válidas são armazenadas por hash, com URL de procedência; arquivos inválidos, indisponíveis ou maiores que 5 MB usam somente uma cópia anterior da mesma imagem, se disponível. Sem capa própria, o evento é omitido. Não há substituição pelo ícone do jogo. O navegador recebe somente caminhos locais; mesmo um catálogo retido é filtrado por prazo e existência dos arquivos.

`demo/events.js` aplica o catálogo ao PostgreSQL local em transações por fonte. Reutiliza a identidade por edição e as funções SQL públicas de importação, limpeza e favoritas. Capturas antigas não revertem uma coleta mais recente. Correções preservam conclusão, favoritas, exclusões e prazos manuais; edições novas começam com estado próprio. Horários não confirmados de WuWa/NTE continuam em revisão, sem inventar base para América. GI/HSR/ZZZ conservam a política de sugestão/fallback do produto.

A abertura da demo lê o catálogo publicado. As leituras existentes de Games/Tasks conferem novamente esse arquivo no intervalo de seis minutos, sem uma segunda rotina de renderização. Falha mantém dados locais e informa a indisponibilidade. A limpeza trata eventos encerrados mesmo quando o catálogo não mudou; tarefas pessoais e prazos estendidos manualmente são preservados conforme o contrato normal.

A primeira população escolhe uma favorita da API por jogo, dando preferência a uma capa disponível, para apresentar os fluxos. Essa escolha inicial não é reaplicada nas sincronizações. A atualização da primeira prévia para esta versão remove somente o exemplo vencido intocado e neutraliza os prazos ainda originais dos exemplos avulsos; notas, stamina, favoritas e prazos editados pelo visitante permanecem. A migração ocorre somente nos metadados do banco local da demo, sem mudança no schema/migrações do Supabase real.

## Exemplos e limites

Minha demo abre automaticamente. Outro exemplo e Perfil livre permitem experimentar a separação de perfis locais. Os exemplos reutilizam `seedDesignPreview`, com estados diários distintos, stamina, anotações e tarefas abertas/concluídas, recorrentes e favoritas. Exemplos avulsos não têm prazo; as recorrentes usam a renovação normal. Eventos importados preservam datas reais da fonte, sem deslocá-las para parecerem atuais.

A agenda e os avisos usam o mesmo calendário fictício persistido: fases próximas do fim geram avisos reais da interface. Os nomes e descrições deixam explícito que não são informações atuais dos banners. Tasks e Revisar eventos usam o catálogo da API. Os lotes e recorrências continuam sendo os contratos do produto, dentro do contexto demonstrativo.

Capas da API são empacotadas na hospedagem. Conforme orientação de Cristian, a demo prioriza consistência sobre quantidade: Tasks e favoritas exibem somente tarefas com capa própria carregada e prazo futuro, quando houver prazo. O adaptador filtra antes das contagens/paginação e do agrupamento de favoritas, para qualquer perfil. Ícones, capas quebradas e tarefas vencidas (inclusive manuais/recorrentes) ficam fora da exibição; o banco local preserva os dados pessoais ocultados. A revisão usa o mesmo critério de imagem e não mantém eventos com prazo bruto já encerrado quando o horário proposto é desconhecido.

O navegador verifica o carregamento das imagens, compartilha a verificação entre leituras e tenta novamente uma imagem que falhou. Os campos de imagem externa ficam somente para leitura na demo, com explicação no próprio formulário. Novas tarefas manuais e itens de lote sem capa podem ser salvos, mas não aparecem até cumprir o critério; o formulário e a área de lotes explicam essa seleção. Não há dependência de serviços de imagens durante a visita. A procedência está no catálogo; os direitos das artes continuam pertencendo aos respectivos titulares.

“Sobre a demo” explica o armazenamento e oferece “Restaurar exemplos”, com confirmação. A restauração reconstrói somente o schema local em uma transação; uma falha SQL preserva o estado anterior. Se a confirmação for interrompida, a interface orienta recarregar para conferir. Após sucesso, outras abas da demo recarregam. Não há alteração em perfis ou preferências da aplicação normal.

## Automação preparada, ainda não ativada

`.github/workflows/public-demo-pages.yml` prepara captura diária às 07:45 de Brasília, cache do último catálogo/capas, testes focados, build e deploy do site completo. O job fica condicionado a `PUBLIC_DEMO_PAGES_ENABLED=true` e à branch `main`. Nenhuma variável, configuração de Pages ou publicação foi alterada nesta entrega.

Na etapa autorizada de publicação, configurar Pages para GitHub Actions e habilitar a variável. O build do site mantém a aplicação normal/configuração existente na raiz e adiciona somente a demo isolada em `/demo/`; o subartefato da demo não contém configuração/cliente reais. Falha de build/teste impede um novo deploy. [Fluxo oficial do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) e [comportamento do cache](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching).

O visitante precisa de navegador atual com WebAssembly, Worker, Web Locks, BroadcastChannel e IndexedDB disponíveis. A primeira visita baixa cerca de 17 MB de runtime sem compressão, além das imagens da interface e das capas. A preparação e a restauração podem levar dezenas de segundos: a prévia ainda executa diversas chamadas SQL pelo worker, com o andamento informado durante a espera. Não há garantia de funcionamento com armazenamento bloqueado, espaço insuficiente ou em todo modo privado. Falhas mostram uma opção de tentar novamente; não existe fallback para o banco real. Limpar o armazenamento do navegador apaga a demo. Não é uma aplicação offline completa: recargas precisam dos arquivos estáticos da hospedagem.

## Validação local em 02/11/2026

Esta seção registra a primeira prévia, anterior à integração dos eventos reais.

- **89 testes focados aprovados em 10 arquivos.** Cobrem a demo, isolamento entre instâncias, SQL real, recibos dos avisos, lotes, rollback da restauração, exclusão de credenciais/cliente reais do artefato, entrada única e rotas. Incluem regressões dos perfis, Games/favoritas, Tasks/formulários, leitura silenciosa, notificações, agenda e seleção de lotes. O arquivo da demo (4 testes) foi repetido após os ajustes finais, sem falhas.
- Navegador Chromium da prévia: desktop 1440×1000 e celular 360×800, sem rolagem horizontal observada; teclado nas abas e diálogo, Escape e devolução de foco.
- Pela interface: Save de stamina/anotações, estado diário, recarga com persistência, favoritas/conclusão e CRUD de tarefa; perfis separados; calendário com dez fases e cinco avisos fictícios, salvando “lido”. Restauração confirmou a substituição das alterações e a atualização de outra aba.
- Recarga direta de `/tasks?game=2`, `/agenda` e `/events/genshin`, incluindo o redirecionamento estático. Aprovação do candidato fictício pela interface. A prévia normal `--design` também abriu Games/Tasks usando seu próprio banco descartável e sem identificação de demo.
- `git diff --check` aprovado. Não executada a suíte completa nesta etapa; fica para o fechamento MINOR, depois da revisão. Não testados aparelhos físicos nem outros motores de navegador. Não houve leitura/gravação no Supabase pessoal, commit, push ou publicação.

Comando focado usado:

```sh
node --test tests/publicDemo.test.mjs tests/profileUI.test.mjs tests/designPreview.test.mjs tests/gameFavoritesUI.test.mjs tests/silentRefreshUI.test.mjs tests/uiIntegration.test.mjs tests/gameNoticesUI.test.mjs tests/gameAgendaUI.test.mjs tests/eventRoutes.test.mjs tests/taskBatchPickerUI.test.mjs
```

## Validação inicial da API em 03/11/2026

- **211 testes focados em 18 arquivos aprovados nesta etapa**, incluindo regressões das cinco integrações, identidade/limpeza SQL fresh/upgrade, segurança do sincronizador, Games/favoritas, estado diário, perfis, leitura silenciosa, formulários e rotas. Não foi executada a suíte completa; ela fica para o fechamento MINOR após revisão.
- `npm run test:demo`: **11 testes aprovados**, repetidos após o ajuste final da restauração. Cobrem captura sem banco, falha parcial/offline, cache sem falsificar a data de coleta, imagem inválida/ausente, schema/localização do artefato, atualização por edição, perfil, exclusão, conclusão, favorita, prazo manual, snapshot atrasado e migração da primeira prévia.
- A restauração também foi testada com erro depois de todo o schema ser instalado: o instalador retira os wrappers `BEGIN/COMMIT` do arquivo somente durante a transação local, garantindo rollback inclusive de uma falha tardia no seed. O schema original e suas migrações de produção permanecem intactos.
- Captura pública real em **03/11/2026 às 09:33 de Brasília**: 42 eventos nos cinco jogos. No banco local, 38 foram importados e quatro ficaram em revisão pelas regras existentes; os exemplos manuais completam a apresentação. O artefato contém 20 arquivos de capa da API, cerca de 18 MB sem compressão, além dos assets e runtime da base.
- Build completo do Pages gerado localmente; `npm run validate:banners` aprovou os cinco jogos/seis fases normais. O teste verifica a configuração normal preservada na raiz e sua ausência no subartefato `/demo/`.
- Conferência de navegador: capas locais carregadas, data da coleta visível, edição de prazo manual e conclusão preservadas após recarga. Restauração pela interface concluída, voltando aos exemplos e favoritas iniciais da API. Desktop 1440×1000 e viewport 360×800 sem transbordamento horizontal da página; Tasks conserva a tabela com rolagem lateral interna do produto. Teclado entre filtros, tarefas e diálogo; Escape e retorno do foco ao botão de origem conferidos. Capturas em `.local-deliveries/public-demo/review/api-tasks-desktop.jpg` e `api-tasks-mobile-360.jpg`. Sem validação em aparelhos físicos.
- Revisão/publicação permanecem pendentes; não houve consulta/gravação no Supabase pessoal nem alteração no repositório do portfólio.

Comandos de verificação da demo:

```sh
npm run test:demo
npm run pages:build
npm run validate:banners
```

O log da execução de 211 testes fica no artefato local ignorado `.local-deliveries/public-demo/review/api-focused-tests.log`.

## Seleção visual da demo em 03/11/2026

Esta etapa substitui o preenchimento com ícones da primeira prévia. `npm run test:demo` aprovou 13 testes; mais 55 testes focados de Games/favoritas, atualização silenciosa, formulários e rotas passaram. Os casos incluem ausência de foto, imagem inválida/indisponível, prazo passado ou no instante exato, recorrência vencida, tarefa sem prazo com capa, perfil e preservação do estado SQL ocultado. A aplicação normal mantém a interface original de Tasks, sem alteração do filtro normal ou do schema de produção.

Nova coleta pública em 03/11/2026 às 14:47 de Brasília: 21 candidatos com capas próprias (GI 2, HSR 3, ZZZ 3, WuWa 8 e NTE 5), usando 20 arquivos de imagem. Os candidatos em revisão continuam sujeitos às regras de horário existentes. Build do Pages gerado localmente; publicação permanece pendente.

Na conferência do estado já salvo no Chromium, sem reset, a lista passou de 50 para 20 tarefas visíveis e um candidato em revisão. As 20 capas carregaram; nenhuma linha usou ícone ou prazo passado. Games mostrou uma favorita elegível por jogo. O link de HSR abriu três tarefas com artes distintas e contagem correspondente. Desktop e viewport 360×800 conferidos, com teclado e sem transbordamento horizontal da página (a tabela mantém sua rolagem lateral interna). Capturas: `.local-deliveries/public-demo/review/demo-consistency-hsr-desktop.jpg` e `demo-consistency-hsr-360.jpg`.

## Conferência e publicação pendentes

No fechamento 1.20.0, `npm test` aprovou 702 testes (69 Jest + 633 Node), sem falhas. Log local ignorado: `.local-deliveries/public-demo/review/release-1.20.0-tests.log`. A revisão local foi aceita para fechamento; a publicação exige mudar o Pages de raiz/branch para GitHub Actions e habilitar a variável do workflow preparado.

1. Revisar a prévia local com Cristian: Games/Tasks, favoritas, anotações, CRUD, teclado, celular, calendário e avisos.
2. Fechar versão conforme o fluxo do projeto, executar a validação exigida e autorizar commit/push/publicação separadamente.
3. Autorizar e ativar o workflow preparado conforme a seção acima. O `404.html` da raiz despacha rotas `/demo/...` para a demo, conservando query e rota; rotas normais seguem para a aplicação normal. Nenhum artefato foi publicado nesta etapa.
4. URL planejada: `https://cristianworth.github.io/GachaManagement-cloud/demo/`. **Ainda não verificada; não adicionar o botão público antes de conferir essa URL**, suas rotas diretas e o isolamento na versão hospedada.
5. Só após essa conferência, atualizar a pendência do roadmap e enviar ao chat do portfólio o texto preparado em `docs/portfolio-demo-prompt.md`. O repositório do portfólio não é alterado por esta entrega.
