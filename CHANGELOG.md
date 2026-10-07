# Changelog

Todas as alterações relevantes do Gacha Management são registradas neste arquivo.

O projeto segue o versionamento semântico (SemVer), no formato `MAJOR.MINOR.PATCH`:

- `MAJOR`: mudança incompatível com o comportamento ou os dados existentes.
- `MINOR`: nova funcionalidade compatível com a versão anterior.
- `PATCH`: correção de bug ou melhoria pequena, sem nova funcionalidade relevante.

## [1.9.1] - 2026-10-07

### Melhorado

- Games passa a ter um único botão **Atualizar dados**, ao lado de Create New Game e View Tasks, substituindo os botões de estimativa por linha. Uma leitura dos jogos do perfil busca resina, anotações, configuração e seleção mais recentes e recalcula todas as estimativas no mesmo instante.
- Campos editados são preservados individualmente, inclusive durante a consulta; os demais recebem os valores salvos. Atualizar não grava dados nem sincroniza calendários. Save continua sendo a ação de gravação.
- Clique repetido é bloqueado durante a consulta. Falhas conservam a lista e os rascunhos, com nova tentativa. Se um jogo removido da seleção tiver rascunho, a substituição da lista é interrompida com aviso.
- Removido o texto “Calculada às…” e simplificado o rótulo para “Resina estimada”, conforme pedido de Cristian. A quantidade estimada e a previsão de lotar continuam visíveis.

Commit, push e escolha da numeração autorizados por Cristian em 07/10/2026. Esta entrega não exige mudança de banco. Roteiro em `docs/refresh-games.md`.

Validação: `npm test` passou 383 testes (69 Jest + 314 Node); `node --test tests/gameStamina.test.mjs tests/uiFeedback.test.mjs` passou 31 testes. Prévia em navegador com SQL descartável conferiu duas abas do mesmo perfil, valores remotos, estimativas e rascunhos preservados. Validação no Supabase live permanece pendente.

## [1.9.0] - 2026-10-07

### Adicionado

- Favorite tasks: estrela por perfil, persistida no estado pessoal. Favoritas aparecem primeiro, com prazo crescente e desempate por ID em cada grupo, mantendo filtros e Hide completed.
- Migração incremental e RPC específica para favoritar sem alterar prazo, conclusão, capa ou recorrência. Correções da mesma edição e renovação conservam a estrela; novas edições começam sem ela.
- Feedback de falhas, proteção contra envio duplicado e foco preservado após reordenar. Roteiro de teste e implantação em `docs/favorite-tasks.md`.

Commit, push e escolha da numeração autorizados por Cristian em 07/10/2026. A migração das favoritas ainda precisa ser aplicada ao Supabase live; publicação do código não executa essa migração.

Validação: `npm test` passou 377 testes (69 Jest + 308 Node). Instalação nova/upgrade e DOM com SQL real cobrem preferência por perfil, preservação, filtros, rejeições, falhas e renovação real de recorrentes. Prévia em navegador conferiu clique, Espaço/Enter, foco, reordenação e persistência após recarregar; `git diff --check` passou.

## [1.8.0] - 2026-10-06

### Adicionado

- Estimativa atual de resina na coluna Max Stamina At, com quantidade inteira, limite do jogo e horário do cálculo. Jogos sem previsão salva ou parâmetros válidos exibem estimativa indisponível.
- Botão Atualizar estimativa por jogo: recalcula a exibição a partir dos dados carregados, sem consultas/escritas no Supabase ou substituição de campos ainda não salvos. Save continua registrando a resina informada.
- Levantamento de alertas em `docs/resin-alerts-plan.md` e item separado B-2 no roadmap. Apenas planejamento de meta por perfil/jogo e contagem dentro do site; alertas ainda não implementados.

Entrega de resina e levantamento separado de alertas. Commit, push e escolha da numeração autorizados por Cristian em 06/10/2026.

Validação: `npm test` passou 355 testes (66 Jest + 289 Node), incluindo cálculo com relógio fixo, ausência de previsão, limites, minutos fracionários, atualização sem consultas/escritas e preservação de rascunhos. Prévia em navegador conferiu salvar, recarregar e atualizar a estimativa; `git diff --check` passou. Nenhuma alteração de banco é necessária neste recorte.

## [1.7.0] - 2026-10-06

Parte 4 implementada e roadmap atualizado. Commit, push e versão 1.7.0 autorizados por Cristian em 06/10/2026. O banco live foi reconstruído do zero com autorização; execução no destino é separada da geração do SQL.

### Melhorado

- Identidade por edição em GI/HSR/ZZZ, com correções que reutilizam a edição e novas ocorrências independentes. Datas incompletas ou correspondência ambígua bloqueiam toda escrita.
- Exclusão permanente de importados vencidos por perfil nos cinco jogos, respeitando prazo pessoal, recorrência, jogos ocultos e tarefas vinculadas na revisão. Marcas mínimas impedem recriação da edição encerrada.
- Limpeza antes das correções da API e após a importação, evitando reabrir um estado já vencido. Workflow diário e regras de horário permanecem iguais.
- Gerador de reinstalação completa e atômica do banco da aplicação (`npm run db:reset:build`), testes SQL/REST e prévia com eventos sintéticos (`npm run preview:profiles -- --events`). Roteiro em `docs/event-editions-expiry.md`.
- Roadmap restrito ao trabalho pendente: Favorite tasks em S-1, resina estimada em S-2 e catálogo limitado à expansão ainda não entregue. TODO 13 define estrela, preferência por perfil e favoritas no topo; o recurso de favoritas permanece planejado.

### Corrigido

- Importação de definições compartilhadas deixa de gravar progresso implícito no CRAN antes de selecionar jogos. Boot e lista de tarefas usam a limpeza dos cinco jogos; o teste DOM também carrega o ponto de entrada real.

Validação local: 334 testes passaram, incluindo 103 de banco; `npm test` foi repetido em 06/10/2026 sem falhas. Live reinstalado com autorização de Cristian, RPCs/relacionamentos e importação dos 50 eventos atuais conferidos; repetição não criou novos registros. Validação pessoal da interface conectada ao live e duas conexões reais com gravações continuam pendentes.

## [1.6.0] - 2026-10-05

Perfis e seleção de jogos (partes 1–3), validados localmente por Cristian, com commit, push e versão autorizados. A parte 4 de identidade/limpeza de eventos permanece pendente; aplicação das migrações e validação do Supabase de destino são etapas separadas.

### Adicionado — modelo e contratos de perfis (partes 1–2)

- Estrutura SQL para CRAN, Demo e Convidado, com catálogo/capas compartilhados e progresso/decisões por perfil.
- RPCs transacionais para seleção, jogos, tarefas, conclusão, revisão e lotes semanais; validação de ator/jogo e proteção contra recriação.
- Testes SQL como `anon` em instalação nova/upgrade, incluindo estado independente, prazos manuais, imagens, ignorados, resina, lotes e reset.
- Migrações do modelo e contratos acompanham a interface desta versão. Login/convite permanecem fora do escopo; implantação e próximos passos em `docs/profiles-phases.md`.

### Corrigido — revisão das partes 1–2

- Descoberta do Jest restrita à pasta oficial `tests`, impedindo que cópias locais incompletas quebrem o comando padrão.
- Limpeza antiga do HSR conserva a tarefa compartilhada enquanto houver perfil com prazo futuro/indefinido ou recorrência, incluindo jogos ocultos e tarefas pessoais vinculadas. Exclusão individual dos vencidos nos cinco jogos permanece na parte 4.

### Adicionado — interface de perfis (parte 3)

- Entrada e troca entre CRAN, Demo e Convidado; seleção de jogos controla Games, Tasks, formulários e revisão. Perfis permanecem públicos, sem login ou convite.
- Oferta opcional do lote inicial de weeklies por perfil/jogo; ocultar e selecionar novamente conserva progresso, decisões e remoções.
- Prévia local com `npm run preview:profiles`, usando frontend real e PostgreSQL descartável, sem acessar o Supabase ou APIs externas.
- Testes DOM com SQL real para seleção, revisão pessoal, weeklies, ocultação, falhas, envio duplicado e recuperação após gravação parcial.

### Corrigido — interface de perfis

- Perfil ativo mantido por página: mudar a preferência em outra aba não redireciona leituras/gravações da aba anterior. Operações pendentes conservam o perfil capturado.
- Dropdown de jogos atualizado ao abrir formulário, preservando seleção válida sem duplicar opções; descrições pessoais são renderizadas como texto.
- Revisão permite ignorar um candidato já aprovado em outro perfil mesmo sem tarefa pessoal vinculada, conservando a decisão do outro perfil.
- Base de recursos na raiz para hospedagem local, permitindo recarregar rotas da prévia sem procurar JS/CSS dentro de `/profile/`.

## [1.5.0] - 2026-10-05

### Adicionado

- Catálogo inicial de weeklies separado dos eventos da API e da classe `Task`: HSR (Echo of War e Simulated Universe), WuWa (Weekly Boss e Fantasies of the Thousand Gateways) e ZZZ (Hollow Zero e Notorious Hunt). Simulated Universe usa acompanhamento de sete dias por preferência explícita de Cristian.
- Criação inicial por jogo na lista de tarefas, com lote persistido e operação transacional. Bancos existentes exigem ação explícita; repetir o lote não duplica nem restaura atividades removidas.
- Migração `2026-10-04-weekly-batches.sql`, com estado dos lotes, identidades das definições, RLS e funções públicas; instalação nova e upgrade completo cobertos por testes offline.
- Roteiro de implantação e validação, incluindo preservação de homônimos, falhas, exclusão, fuso horário e teste de duas abas no destino.

### Corrigido

- População inicial resolve jogos pela sigla cadastrada e funciona com tarefas de outros jogos presentes, sem depender de IDs fixos ou datas de 2025.
- Primeiro vencimento usa o próximo reset estritamente futuro de segunda às 06h de Brasília, com relógio do banco. Novas weeklies gerenciadas renovam em UTC; ciclos manuais, legados e personalizados mantêm seu comportamento.
- Tarefas existentes são preservadas sem assumir origem pelo nome: conclusão, imagens, prazos, recorrência e vínculos dos eventos permanecem intactos na criação dos lotes.
- Reset completo inclui candidatos e estado dos lotes em uma única transação; falhas são propagadas e impedem a reinicialização. A recriação dos dados iniciais ocorre após a limpeza e informa falhas sem anunciar sucesso.

## [1.4.1] - 2026-10-04

### Melhorado

- Sincronização dos cinco jogos agendada diariamente às 07h30 de Brasília (10h30 UTC), após os resets de WuWa e NTE na América.
- Prioridades do planejamento e handoff de sincronização/weeklies documentados, incluindo validação manual antes de commitar a próxima entrega.
- Carregamento compartilhado nas listas de tarefas e jogos, formulários e ações, mantendo o indicador visível até operações encadeadas terminarem.
- Mensagens de confirmação e falha específicas por operação, com opção de tentar novamente a leitura das listas e preservação dos dados preenchidos.
- Testes de interface cobrem operações pendentes, falhas de leitura/gravação, recuperação e prevenção de envio duplicado.

### Corrigido

- Falhas do banco são propagadas para a interface, sem serem interpretadas como listas vazias nem dispararem a população inicial após uma consulta malsucedida.
- Conclusão, exclusão e decisão de ignorar não aparentam sucesso quando a gravação falha; controles são reabilitados e o estado anterior é preservado.
- Uma gravação concluída seguida de falha ao atualizar a lista informa que os dados foram salvos; tentar novamente apenas recarrega a lista, sem repetir a gravação.
- Formulários e ações bloqueiam envios repetidos enquanto a operação está em andamento.

## [1.4.0] - 2026-10-04

### Adicionado

- Importação e revisão de eventos do Wuthering Waves e Neverness to Everness, com os cinco jogos ativos na sincronização semanal.
- Políticas explícitas por evento/campo para horários globais e do servidor América; horários de novas edições sem confirmação continuam na revisão.
- Identidade por edição em WuWa/NTE: correções de períodos correspondentes preservam vínculos, conclusão, ignorados e prazos manuais; edições distintas começam sem estado herdado e associações ambíguas bloqueiam escrita.
- Migrações compatíveis de WuWa/NTE e contratos independentes de evidência das fixtures, com testes de horários, expiração exata, rotas, interface, SQL, repetição e preservação dos dados.
- Convenções locais para próximas sessões, incluindo Game8 como referência de datas/horários, procedência das evidências, fixtures congeladas e fluxo de validação antes da sincronização.

### Melhorado

- Revisão de WuWa/NTE oferece link para Game8 e distingue início desconhecido de horário confirmado.
- Testes de integração exercitam a sincronização real contra PostgreSQL descartável, além de validar schema novo e sequência completa de migrações.
- Moonlit Path usa a proposta de reset da API para América, aceita por Cristian; suas datas foram fornecidas pelo Game8, enquanto a hora exata permanece uma estimativa documentada.

### Corrigido

- Sincronização individual de outro jogo não executa a limpeza de tarefas vencidas do HSR.
- Prazos globais confirmados expiram no instante correto, sem aguardar o deslocamento de 13 horas do reset americano.

## [1.3.1] - 2026-10-03

### Melhorado

- Preparação de WuWa e NTE no catálogo, sem ativar a importação, com amostras reais dos cinco jogos e metadados de captura.
- Rotas de revisão derivadas dos jogos ativos; sincronização com relógio controlável e resultados estruturados para testes.
- Comando único de testes incluindo Jest, integração, HTML real e SQL em PostgreSQL descartável, validando schema novo e sequência de migrações.
- CI em Windows/Linux e testes antes da sincronização semanal; roteiro de políticas de horário, identidade e validação das próximas integrações.

### Corrigido

- Datas impossíveis da API ficam para revisão em vez de serem convertidas silenciosamente para outro dia.

## [1.3.0] - 2026-10-03

### Adicionado

- Importação e revisão de eventos do Zenless Zone Zero pela StarRailAssistant, incluindo os eventos atuais e próximos na sincronização semanal.
- Filtro por Refresh Type na lista de tarefas, combinável com o filtro por jogo e preservado ao atualizar a lista.
- Migração das funções de eventos para aceitar ZZZ, com testes de normalização, sincronização, rotas e integração SQL.
- URL opcional de imagem no cadastro e na edição de tarefas manuais, com placeholder para tarefas sem capa e imagens indisponíveis.
- Intervalos Daily (1 dia), Weekly (7 dias), Monthly (30 dias) e Custom, com quantidade de dias editável e preservação dos ciclos existentes na migração.
- URL opcional de imagem no cadastro e na edição de jogos, com ícone padrão para imagens indisponíveis.
- Filtro Hide completed na lista de tarefas, combinável com jogo e intervalo, para ocultar e voltar a mostrar atividades concluídas.

### Melhorado

- Dicas nos botões da lista esclarecem a diferença entre excluir uma tarefa manual e ignorar um evento importado para impedir sua reimportação.
- Lista de jogos usa o mesmo tamanho e espaçamento dos botões de tarefas, incluindo Save. Ignorar usa um ícone de bloqueio nas tarefas e na revisão de eventos; Delete mantém a lixeira.
- Formulário de tarefas organizado em coluna, com campos de dias e horas lado a lado e ajuda para a URL da imagem.
- Formulário de jogos segue a mesma organização visual das tarefas. Falhas ao salvar mantêm os dados preenchidos e mostram o erro.

### Corrigido

- Botões da lista de tarefas têm o mesmo tamanho e espaçamento consistente. Edit e Delete/Ignorar ocupam duas colunas fixas, independentemente dos filtros; a ação opcional de restaurar o prazo da API fica centralizada abaixo, com as mesmas dimensões.
- Capas e descrições de tarefas alinhadas à esquerda, mantendo a posição da imagem consistente para títulos curtos e longos.
- Renovação de tarefas usa a quantidade de dias salva e avança até o próximo ciclo futuro quando vários ciclos ficaram vencidos.
- Edição de tarefa preserva a conclusão; edição de jogo preserva stamina, tarefas pendentes, cor e ícones internos.

## [1.2.0] - 2026-10-02

### Adicionado

- Importação de eventos atuais e próximos do Honkai Star Rail pela StarRailAssistant, incluindo as edições de Memory of Chaos, Pure Fiction e Apocalyptic Shadow.
- Página de revisão separada com seleção de jogo e contagem de candidatos para Genshin e HSR.
- Início dos eventos salvo nas tarefas aprovadas e indicação dos eventos que ainda vão começar.
- Placeholder para capas ausentes ou indisponíveis nos eventos importados.
- Limpeza automática de tarefas importadas do HSR que venceram, ao abrir o app, carregar a lista e sincronizar. Tarefas manuais permanecem para remoção pelo usuário.
- Ícones próprios para NTE e Arknights: Endfield, com Endfield incluído nas definições iniciais de jogos.
- Importação automática dos eventos de Genshin e HSR com prazo final utilizável, mantendo a revisão para prazos ausentes ou inconsistentes.
- Filtro por jogo na lista de atividades, com contagem dos resultados.
- Proteção das datas corrigidas manualmente e ação para voltar a usar o prazo da API.

### Melhorado

- Recarregar ou abrir diretamente a página de revisão restaura a rota no servidor local e no GitHub Pages.
- Aprovação usa o jogo do candidato e impede vincular tarefas de outro jogo.
- Sincronização semanal consulta Genshin e HSR, preservando aprovações e eventos ignorados; a falha de um jogo não impede a tentativa do outro.
- Datas válidas preenchem o prazo de revisão; horários sem regra de conversão conhecida usam o instante da Ásia como alternativa.
- População inicial de tarefas limitada às atividades semanais; eventos fixos deixam de ser criados pelo seed. Tarefas já salvas permanecem no banco.
- Eventos importados podem ser ignorados diretamente na lista, sem reaparecer na próxima sincronização. Atualizações da fonte preservam conclusão, vínculos e capas existentes quando a nova capa está ausente.

## [1.1.0] - 2026-10-01

### Adicionado

- Piloto de eventos do Genshin Impact usando a API em inglês da StarRailAssistant.
- Sincronização semanal pelo GitHub Actions, com execução manual e carga inicial de candidatos para revisão.
- Revisão de eventos para aprovar o prazo, criar ou vincular uma tarefa existente e ignorar atividades.
- Prazo sugerido com conversão para América nos horários validados, alternativa com a data recebida da fonte e ajuste manual.
- Contagem de dias e horas até o fim e capa do evento no formulário de aprovação.
- Capas salvas nas tarefas aprovadas e exibidas como miniaturas na lista de atividades.

### Melhorado

- Sincronização preserva eventos ignorados e reabre a revisão quando o prazo de um evento aprovado muda, sem alterar sua tarefa automaticamente.
- Eventos que deixam de aparecer na fonte saem da fila de revisão, preservando as tarefas existentes.
- Edição de nome ou prazo mantém a capa da tarefa; imagens indisponíveis são ocultadas na lista.
- Migrações do banco versionadas e backup dos dados existentes antes da implantação do piloto.

## [1.0.1] - 2026-09-18

### Melhorado

- Tabelas com rolagem horizontal e formulários adaptados para telas pequenas.
- Editor responsivo de tarefas pendentes com continuidade automática de bullet points.

## [1.0.0] - 2026-09-12

### Adicionado

- Gerenciamento de jogos, stamina e tarefas recorrentes.
- Persistência dos dados no Supabase, com sincronização entre navegador e celular.
- Cálculo da data em que a stamina atingirá o limite máximo.
- Tipos de recorrência para tarefas: diário, semanal, quinzenal, mensal e personalizado.
- Formulários para criar e editar jogos e tarefas.
- Validação de entradas e layout responsivo.
- Tela de processamento ao salvar a stamina de um jogo.

### Corrigido

- Carregamento inicial aguardando a inicialização do banco de dados.
- Overlay de processamento aparecendo indevidamente durante o carregamento inicial.
- Uso de base path dinâmico para funcionar em diferentes repositórios do GitHub Pages.

## Como publicar uma nova versão

1. Escolha o próximo número usando as regras de SemVer.
2. Adicione uma seção no topo deste arquivo com a data e as alterações.
3. Atualize a versão em `package.json` e `package-lock.json`, quando aplicável.
4. Atualize o texto da versão exibido em `index.html`.
5. Crie um commit descrevendo a alteração e publique a nova versão.

Exemplo: uma nova correção no loading deve gerar a versão `1.0.1`; uma nova funcionalidade compatível deve gerar `1.1.0`.
