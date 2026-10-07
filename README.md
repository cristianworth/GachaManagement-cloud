# 🎮 Gacha Management

As melhorias planejadas e suas estimativas de complexidade estão em [TODO.md](TODO.md).

O **Gacha Management** é uma aplicação projetada para ajudar jogadores de **gacha games** a gerenciar sua **resina/stamina** e acompanhar **tarefas recorrentes** nos jogos. Ele oferece ferramentas para rastrear a regeneração da stamina, organizar atividades programadas e facilitar o planejamento dentro dos jogos.

Versão atual: **1.9.0**. Consulte o [CHANGELOG](CHANGELOG.md) para ver as alterações de cada versão e as regras de versionamento utilizadas.

**Perfis da versão 1.6.0, validados localmente:** CRAN, Demo e Convidado, seleção de jogos e progresso pessoal. Perfis são públicos, sem autenticação. Aplicar modelo e contratos antes de usar este frontend no destino. Roteiro em [docs/profiles-phases.md](docs/profiles-phases.md).

**Eventos da versão 1.7.0:** identidade por edição em GI/HSR/ZZZ e exclusão por perfil dos importados vencidos nos cinco jogos. Prévia sintética, reinstalação do live e verificações manuais restantes em [docs/event-editions-expiry.md](docs/event-editions-expiry.md).

Para testar visualmente sem alterar o Supabase, execute `npm run preview:profiles` e abra `http://127.0.0.1:5501`. A prévia usa o frontend e SQL reais em banco descartável; os dados somem ao encerrar o servidor. Não valida o PostgREST real nem consulta os calendários remotos.

**Resina da versão 1.8.0:** Games mostra a resina estimada atual junto da previsão de lotar. **Atualizar estimativa** recalcula apenas essa linha, preservando os campos digitados; **Save** registra o valor real e uma nova previsão. Sem previsão salva, a estimativa fica indisponível. A estimativa usa os dados carregados; alterações salvas em outro dispositivo exigem recarregar a lista. Alertas continuam planejados em [docs/resin-alerts-plan.md](docs/resin-alerts-plan.md).

**Favorite tasks da versão 1.9.0:** estrela por perfil e favoritas no topo, mantendo filtros e ordenação por prazo. Para testar sem alterar o live, use `npm run preview:profiles`; para usar no Supabase, aplique antes a migração indicada em [docs/favorite-tasks.md](docs/favorite-tasks.md), ainda pendente no destino.

![Resin Management](img/demo/resin-management-demo-01.png)

## 🚀 Funcionalidades

### 🏆 **Gerenciamento de Resina**
- Registre a quantidade atual de **resina/stamina**.
- Calcule automaticamente o tempo necessário para atingir o limite máximo.
- Visualize rapidamente quando sua resina estará cheia.

### 📅 **Gacha Schedule**
- **Acompanhe eventos e tarefas recorrentes** dentro dos seus jogos favoritos.
- As tarefas são **vinculadas aos jogos cadastrados** e possuem **atualização automática** com base no tipo de recorrência:
  - **Diário**
  - **Semanal**
  - **Mensal (a cada 30 dias)**
  - **Personalizado (quantidade inteira de dias)**
  - **Evento sem repetição**
- Permite visualizar todas as tarefas em um **calendário simples**, evitando que você esqueça **eventos importantes**.

### Eventos do Genshin, HSR, ZZZ, WuWa e NTE

Uma rotina diária consulta o calendário em inglês da [StarRailAssistant](https://starrailassistant.top/reference/public-api/) e importa automaticamente eventos atuais e próximos de Genshin, HSR, ZZZ, WuWa e NTE com prazo final utilizável. WuWa/NTE também exigem base de horário validada; edições sem confirmação ficam para revisão. A lista de atividades pode ser filtrada por jogo. **Revisar eventos** mostra as pendências de prazo, separadas por jogo: informe o fim, crie ou vincule uma tarefa do mesmo jogo, ou ignore. A gravação da tarefa e do vínculo é transacional. Login e seletores também podem aparecer; use **Ignorar** na lista para removê-los e impedir que voltem na próxima sincronização. Weeklies e tarefas manuais mantêm a ação de excluir.

Uma nova data da fonte atualiza tarefas controladas pela API sem desfazer sua conclusão. Editar o prazo de um evento importado protege essa data contra sincronizações; a lista mostra **Prazo ajustado manualmente** e **Usar prazo da API** para devolver o controle à fonte. Candidatos ausentes da fonte saem da revisão, mas suas tarefas não são excluídas por essa ausência. A busca complementar em chinês e os demais jogos ficam para a próxima etapa.

Cada edição dos modos do HSR usa o nome completo fornecido pela API como identidade, com início, fim e capa próprios. Edições vencidas aprovadas são removidas automaticamente da lista ao abrir o aplicativo, carregar a lista de tarefas ou executar a sincronização. **Somente tarefas vinculadas a candidatos importados do HSR são removidas**; as tarefas manuais, incluindo os ciclos antigos, ficam para você excluir após testar. Edições futuras aprovadas indicam quando começam. A limpeza utiliza o prazo salvo na tarefa, inclusive ajustes manuais.

O calendário não informa o fuso junto às datas. As datas de Genshin, HSR e ZZZ são interpretadas como horário do servidor Ásia. Para HSR e ZZZ, a conversão é uma sugestão pela regra de reset do servidor, não uma garantia informada pela API. Se o fim recebido é 03:59:59 nesse servidor, a tela propõe o prazo do servidor América (+13 horas no instante UTC). Para outros horários, o instante do servidor Ásia preenche o prazo inicial; o usuário pode ajustá-lo. Se houver data final válida mesmo sem início, ela também preenche o prazo. Um fim ausente ou inválido ainda exige preenchimento manual. A revisão exibe a capa fornecida pela API e o tempo restante para o prazo escolhido. A cobertura pode variar entre idiomas, pois eles usam fontes diferentes; confira periodicamente se o endpoint `en-US` inclui os eventos relevantes.

Para habilitar o piloto em um banco já existente, primeiro confira o backup de `games` e `tasks` e então execute [`db/migrations/2026-09-29-genshin-events.sql`](db/migrations/2026-09-29-genshin-events.sql) no SQL Editor do Supabase. Se essa migração já foi aplicada antes da inclusão das capas, execute também [`db/migrations/2026-09-30-event-cover.sql`](db/migrations/2026-09-30-event-cover.sql). A migração inicial adiciona `event_candidates` e a função de aprovação sem alterar as tabelas e policies existentes; a segunda apenas adiciona `cover_url`. Execute `node scripts/previewStarRailAssistantGenshin.js` para comparar a fonte com candidatos e tarefas sem gravar nada, `node scripts/syncGenshinEvents.js --dry-run` para inspecionar os candidatos e `node scripts/syncGenshinEvents.js` para sincronizá-los. Na primeira execução, a rotina reaproveita candidatos correspondentes da fonte anterior, preservando tarefas aprovadas, e desativa os que não aparecem na StarRailAssistant. A sincronização diária está em [`.github/workflows/sync-genshin-events.yml`](.github/workflows/sync-genshin-events.yml) e roda todos os dias às 07h30 de Brasília (10h30 UTC), quando o workflow estiver na branch padrão do repositório. A execução usa os servidores do GitHub Actions; o computador local pode estar desligado. Também pode ser acionada manualmente pelo GitHub Actions. O workflow consulta os cinco jogos ativos via `node scripts/syncEvents.js`. A rotina usa a URL e a chave **pública** já configuradas no aplicativo; `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` podem sobrescrevê-las no ambiente.

![Gacha Schedule](img/demo/gacha-schedule-demo-02.png)

As capas dos eventos aprovados ficam salvas como URL em `tasks.cover_url` e aparecem como miniaturas ao lado do nome na lista de tarefas. Para bancos existentes, execute [`db/migrations/2026-10-01-task-cover.sql`](db/migrations/2026-10-01-task-cover.sql) depois das migrações do piloto: ela atualiza a função de aprovação e preenche capas dos eventos já aprovados, preservando imagens existentes. Tarefas manuais permitem informar uma URL HTTPS no cadastro e na edição; deixar o campo vazio remove a URL. Nas tarefas importadas, esse campo mostra a capa da fonte e fica desabilitado. Tarefas sem imagem e links indisponíveis exibem o mesmo placeholder, mantendo o alinhamento das descrições.

O cadastro de jogos também aceita uma URL HTTPS em `games.img`. Ao editar um jogo com ícone interno, deixe o campo vazio para mantê-lo. Apagar uma URL personalizada volta ao ícone padrão. Imagens indisponíveis usam esse ícone, e editar o cadastro preserva stamina, tarefas pendentes e cor.

### Criação inicial de weeklies

Os novos lotes usam a sigla cadastrada e o próximo reset da América: segunda às 06:00 de Brasília. HSR cria Echo of War e Simulated Universe (semanal por preferência de Cristian); WuWa cria Weekly Boss e Fantasies of the Thousand Gateways; ZZZ cria Hollow Zero e Notorious Hunt. Tarefas existentes mantêm seus dados. Em bancos existentes, aplique [`db/migrations/2026-10-04-weekly-batches.sql`](db/migrations/2026-10-04-weekly-batches.sql) após NTE; o boot preserva a decisão de não completar lotes automaticamente. Na lista de tarefas, selecione o jogo e use **Criar lote inicial de weeklies deste jogo** para registrar o lote uma vez. Repetição não duplica nem restaura itens excluídos. Catálogo, fontes, regras de preservação e roteiro de teste em [`docs/weekly-batches.md`](docs/weekly-batches.md).

### Intervalos de repetição e tarefas concluídas

**Repeat interval** oferece Event / No repeat, Daily, Weekly, Monthly e Custom. Os atalhos preenchem 1, 7 e 30 dias; editar a quantidade seleciona Custom. Monthly representa um intervalo fixo de 30 dias, não o mesmo dia do mês. A lista mostra o intervalo como **Every N days**. **Hide completed** oculta tarefas e eventos concluídos, mantendo os filtros de jogo e intervalo; desmarque-o para mostrar e desfazer uma conclusão. Ocultar não exclui tarefas nem impede a renovação de recorrentes.

Em bancos existentes, aplique [`db/migrations/2026-10-03-task-repeat-days.sql`](db/migrations/2026-10-03-task-repeat-days.sql) antes de usar os novos intervalos. Ela adiciona `tasks.repeat_days`, preservando 1, 7, 14, 15, 28, 31 e 42 dias dos tipos antigos. Tarefas antigas de 31 dias aparecem como Custom; selecionar o novo Monthly muda explicitamente para 30. Eventos da API permanecem sem repetição. O código legado `refresh_type` é mantido para compatibilidade com os importadores e clientes anteriores. A migração não altera prazos, conclusão ou vínculos.

Ao abrir o aplicativo, tarefas recorrentes vencidas são reabertas no próximo ciclo futuro, calculado a partir do prazo anterior e preservando o horário local. Os testes transacionais da migração estão em [`tests/taskRepeatDays.sql`](tests/taskRepeatDays.sql) e usam rollback. Um erro ao salvar um cadastro mantém o formulário preenchido e exibe a mensagem para tentar novamente.

Para habilitar HSR e a revisão por jogo em um banco existente, execute [`db/migrations/2026-10-02-hsr-events.sql`](db/migrations/2026-10-02-hsr-events.sql) depois das três migrações anteriores. Ela associa os candidatos existentes ao Genshin, adiciona início às tarefas e atualiza a aprovação e a limpeza. Para um banco novo, `db/schema.sql` já contém a estrutura atual.

Depois, execute [`db/migrations/2026-10-02-auto-events.sql`](db/migrations/2026-10-02-auto-events.sql) para habilitar a importação automática e a proteção de prazos manuais. A migração não importa nem exclui tarefas; a primeira execução de `node scripts/syncEvents.js` importa os candidatos elegíveis já encontrados. As validações transacionais estão em [`tests/autoEvents.sql`](tests/autoEvents.sql) e usam rollback.

Para habilitar WuWa em um banco existente, execute [`db/migrations/2026-10-03-wuwa-events.sql`](db/migrations/2026-10-03-wuwa-events.sql) depois das migrações de ZZZ e de intervalos. Ela amplia as funções de importação, preservando dados, permissões e decisões. É necessário um único jogo com sigla `WuWa`. Use `node scripts/syncEvents.js --game=wuwa --dry-run` para a prévia e retire `--dry-run` para sincronizar.

WuWa América usa UTC−5 fixo: reset às 04:00 do servidor / 06:00 de Brasília. A política distingue início global da atualização e horários do servidor por campo. Nove eventos da amostra 3.7 têm bases confirmadas; Moonlit Path usa a estimativa da API aceita por Cristian para 30/09–11/11/2026, com hora final ainda não verificada independentemente. Edições futuras sem evidência também ficam para revisão. Cada nova edição recebe uma identidade própria; correções de períodos sobrepostos reutilizam a identidade persistida, mantendo conclusão, ignorados e prazos manuais. Períodos ambíguos bloqueiam escrita. Os testes em [`tests/wuwaEvents.test.mjs`](tests/wuwaEvents.test.mjs) atravessam normalização, sincronização e PostgreSQL; [`tests/wuwaEvents.sql`](tests/wuwaEvents.sql) verifica os contratos com rollback.

Para habilitar NTE, execute [`db/migrations/2026-10-04-nte-events.sql`](db/migrations/2026-10-04-nte-events.sql) após a migração WuWa. Cadastre um único jogo com sigla `NTE`; use `node scripts/syncEvents.js --game=nte --dry-run` para consultar e retire `--dry-run` para sincronizar. NTE América tem reset às 05:00 UTC−5 / 07:00 Brasília. As notas globais 1.4 distinguem horários fixos UTC+8 de horários do servidor; os nove eventos da amostra foram conferidos por campo. Edições sem confirmação ficam em revisão. Reaplique migrações sempre na ordem, pois definições antigas de funções podem substituir as mais recentes.

Para habilitar ZZZ, execute [`db/migrations/2026-10-02-zzz-events.sql`](db/migrations/2026-10-02-zzz-events.sql) depois da migração de importação automática. Ela amplia as funções existentes para a fonte ZZZ, mantendo permissões e proteção dos prazos. Cadastre um único jogo com sigla `ZZZ` antes de sincronizar. Os testes transacionais compartilhados estão em [`tests/zzzEvents.sql`](tests/zzzEvents.sql); após a migração NTE, eles verificam os cinco jogos ativos e usam rollback.

```bash
# Inspecionar ZZZ sem gravar
node scripts/syncEvents.js --game=zzz --dry-run
# Carga inicial e sincronização dos cinco jogos ativos
node scripts/syncEvents.js
# Sincronizar somente ZZZ
node scripts/syncEvents.js --game=zzz
# Testes da importação, prazos e proteção dos dados
node --test tests/*.test.mjs
npm test -- --runInBand
```

A API não oferece um ID estável nem identifica o servidor. Nos cinco jogos, nome e período ajudam a distinguir edições: uma correção do mesmo período reaproveita a identidade, enquanto uma ocorrência posterior começa sem herdar conclusão ou decisões. Uma correspondência ambígua interrompe a escrita da fonte. Prazos fora do padrão validado usam a Ásia e continuam ajustáveis; WuWa/NTE exigem confirmação por campo e edição. Eventos sem prazo utilizável vão para revisão. Detalhes da reconciliação e da limpeza por perfil em [docs/event-editions-expiry.md](docs/event-editions-expiry.md).

## 🔧 Tecnologias Utilizadas
- HTML5, CSS3, JavaScript (ES6+)
- **Supabase** (Postgres na nuvem) — sincroniza os dados entre **navegador e celular**
- Modern JavaScript Modules (ESM)
- Jest v29.7.0 (testing)
- Babel (transpilation)

## ☁️ Configuração do Banco (Supabase)

Os dados ficam em um banco na nuvem gratuito (Supabase), então o que você
cadastra no navegador aparece também no celular e vice-versa.

1. Crie uma conta grátis em [supabase.com](https://supabase.com) e um novo projeto.
2. No **SQL Editor**, cole e execute o conteúdo de [`db/schema.sql`](db/schema.sql)
   para criar as tabelas `games` e `tasks`.
3. Em **Project Settings → Data API**, copie a **Project URL** e a chave **anon/public**.
4. Cole os dois valores em [`js/config/supabase.config.js`](js/config/supabase.config.js).
5. Abra a aplicação (local ou no GitHub Pages) — os dados iniciais são semeados
   automaticamente na primeira vez.

> ⚠️ Como o site é público, a chave `anon` fica visível no código. Isso é
> intencional para o uso pessoal/aberto configurado aqui. Para restringir o
> acesso, adicione autenticação e troque as *policies* de RLS em `db/schema.sql`
> por regras baseadas em `auth.uid()`. **Nunca** use a chave `service_role` no
> front-end.

## 🎯 Features
Add under Gacha Schedule:
- Automatic task expiration handling
- Configurable refresh cycles (daily, weekly, etc.)
- Game-specific stamina calculations
- Responsive form inputs with validation

## 📥 Instalação
Para rodar o projeto localmente, siga os passos abaixo:

```bash
# Clone o repositório
git clone https://github.com/cristianworth/GachaManagement.git  
cd GachaManagement  

# Instale as dependências
npm install  

# Inicie o projeto
npm start  
```

## 🧪 Rodando Testes
Com Node 20 ou superior, um comando executa os testes Jest, os testes de integração Node, os formulários com HTML real e as funções SQL em PostgreSQL descartável na memória. Não precisa conectar ao Supabase nem capturar novamente a API:

```bash
npm ci
npm test
# Executar somente o banco descartável
npm run test:db
```

As [convenções do projeto](docs/project-conventions.md) registram fontes, horários, estado, testes e o fluxo de entrega para próximas sessões.

As amostras reais dos cinco jogos ficam em `tests/fixtures/`, com origem e relógio de referência em `manifest.json`. WuWa está habilitado com política de horários da América e identidade por edição. NTE está habilitado com política por campo e identidade por edição; veja [sua validação](docs/nte-validation.md). Veja o [mapa de testes e roteiro das próximas integrações](docs/event-integrations.md) para comandos separados, atualização de fixtures, limites da validação e decisões de horário/identidade.
