# Gacha Management Cloud

Organize a rotina dos seus jogos: acompanhe stamina, tarefas recorrentes, eventos e banners em um só lugar. A aplicação calcula quando os recursos estarão cheios e ajuda a decidir o que ainda falta fazer em cada jogo.

## Experimente a demonstração

**Demo isolada em preparação; publicação pendente.** A aplicação online e seu perfil chamado Demo usam um banco compartilhado e não são uma área descartável para visitantes. A nova [demo estática](docs/public-demo.md) combina eventos e capas da API com progresso demonstrativo, SQL real no navegador e armazenamento local de cada visitante. A URL pública só será anunciada após revisão, publicação e verificação.

```sh
npm ci
npm run demo:preview
```

Abra **http://127.0.0.1:5503/GachaManagement-cloud/demo/**. Na primeira execução, o comando prepara os eventos e baixa as capas da API pública. O servidor e o navegador usam somente os arquivos estáticos gerados; não acessam seu Supabase. Alterações persistem neste navegador e “Sobre a demo” permite restaurar os exemplos. A lista informa a data da coleta; banners e seus avisos continuam fictícios. `npm run demo:capture` renova o catálogo, `npm run demo:build` gera só a demo e `npm run pages:build` prepara o site completo com a demo isolada em `/demo/`. A automação diária está preparada e aguarda a autorização de publicação.

![Prévia atual do Gacha Management Cloud com jogos e dados fictícios](docs/images/overview.png)

Captura com dados fictícios e tema Sangonomiya. Na demo estática, suas alterações ficam no navegador até restaurar os exemplos ou limpar o armazenamento.

A demo prioriza a apresentação: Tasks e favoritas mostram somente tarefas com capa própria carregada e prazo futuro, quando houver prazo. Eventos sem imagem, com imagem indisponível ou vencidos ficam fora da exibição; ícones dos jogos não substituem capas. Essa seleção não apaga tarefas pessoais já salvas e não muda a aplicação normal.

## O que você pode fazer

- Estimar a stamina atual e quando cada jogo atingirá o limite, com taxas próprias de regeneração.
- Marcar a rotina como pendente, voltar depois ou feita por hoje, respeitando o reset diário.
- Organizar tarefas, favoritas e recorrências; filtrar e paginar a lista sem perder o contexto.
- Ver as favoritas de cada jogo em Games, alternar para Anotações e abrir Tasks já filtrado pelo jogo.
- Acompanhar eventos importados, revisar prazos e preservar ajustes manuais durante sincronizações.
- Consultar o calendário de banners e notificações por fase, com fontes e horários registrados.
- Separar progresso e preferências por perfil e acessar os dados salvos em navegador ou celular.

Perfis são públicos, sem autenticação: a seleção organiza dados, mas não oferece contas privadas. [Comportamento e prévia](docs/profiles-phases.md).

## Stack e decisões

| Parte        | Escolha e motivo                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Interface    | HTML, CSS e JavaScript com módulos ES; evolução incremental da aplicação existente.                     |
| Persistência | PostgreSQL/Supabase, migrações e operações transacionais para regras compartilhadas.                    |
| Integrações  | Descoberta de eventos por API; calendário de banners em JSON versionado, separado do progresso pessoal. |
| Verificação  | Jest, testes Node, DOM real e PostgreSQL descartável com PGlite; CI no GitHub Actions.                  |

Fusos, identidade por edição e preservação de decisões manuais são partes centrais do domínio. A leitura atualiza informações sem sobrescrever o que está sendo editado. [Convenções](docs/project-conventions.md) e [mapa dos guias](docs/README.md).

## Executar a prévia local

Requer Git, Node.js 20+ e npm. A prévia usa banco descartável e não acessa o Supabase:

```sh
git clone https://github.com/cristianworth/GachaManagement-cloud.git
cd GachaManagement-cloud
npm ci
node scripts/previewProfiles.js --design --port=5502
```

Abra **http://127.0.0.1:5502**. A prévia reutiliza o frontend e SQL reais, com dados fictícios. Ela não valida o serviço remoto nem a disponibilidade dos calendários externos. [Configuração de uma instância e integrações](docs/setup-and-integrations.md).

## Estado e limites

Versão **1.20.0**. Aplicação pessoal em evolução, com perfis públicos e integração de eventos dos cinco jogos ativos. A demonstração isolada está implementada e validada; ativação da hospedagem e verificação da URL pública permanecem pendentes.

O produto é guiado por Cristian, com desenvolvimento assistido por IA. As decisões de calendário, região e comportamento são registradas nos guias e no histórico de entregas. [Changelog](CHANGELOG.md) e [próximas prioridades](docs/roadmap-priorities.md).

## Verificar e acompanhar

```sh
npm test
```

Os testes usam dados congelados e banco descartável, sem consultar o banco pessoal. As [convenções de validação](docs/project-conventions.md) distinguem testes focados de fechamentos completos.

- [Mapa da documentação](docs/README.md).
- [Estado diário](docs/game-daily-state.md), [atualização silenciosa](docs/silent-refresh.md) e [paginação](docs/task-pagination-stamina.md).
- [Banners publicados](docs/banner-catalogue.md) e [integrações de eventos](docs/event-integrations.md).
- [Issues](https://github.com/cristianworth/GachaManagement-cloud/issues) para problemas e propostas com exemplos reproduzíveis.

O manifesto declara ISC, mas o texto de licença ainda precisa ser incluído na raiz. Dependências e recursos de terceiros mantêm suas próprias licenças e créditos; essa pendência não altera os avisos existentes.
