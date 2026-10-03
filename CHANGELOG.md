# Changelog

Todas as alterações relevantes do Gacha Management são registradas neste arquivo.

O projeto segue o versionamento semântico (SemVer), no formato `MAJOR.MINOR.PATCH`:

- `MAJOR`: mudança incompatível com o comportamento ou os dados existentes.
- `MINOR`: nova funcionalidade compatível com a versão anterior.
- `PATCH`: correção de bug ou melhoria pequena, sem nova funcionalidade relevante.

## [1.3.0] - 2026-10-03

### Adicionado

- Importação e revisão de eventos do Zenless Zone Zero pela StarRailAssistant, incluindo os eventos atuais e próximos na sincronização semanal.
- Filtro por Refresh Type na lista de tarefas, combinável com o filtro por jogo e preservado ao atualizar a lista.
- Migração das funções de eventos para aceitar ZZZ, com testes de normalização, sincronização, rotas e integração SQL.
- URL opcional de imagem no cadastro e na edição de tarefas manuais, com placeholder para tarefas sem capa e imagens indisponíveis.

### Melhorado

- Dicas nos botões da lista esclarecem a diferença entre excluir uma tarefa manual e ignorar um evento importado para impedir sua reimportação.
- Lista de jogos usa o mesmo tamanho e espaçamento dos botões de tarefas, incluindo Save. Ignorar usa um ícone de bloqueio nas tarefas e na revisão de eventos; Delete mantém a lixeira.
- Formulário de tarefas organizado em coluna, com campos de dias e horas lado a lado e ajuda para a URL da imagem.

### Corrigido

- Botões da lista de tarefas têm o mesmo tamanho e espaçamento consistente. Edit e Delete/Ignorar ocupam duas colunas fixas, independentemente dos filtros; a ação opcional de restaurar o prazo da API fica centralizada abaixo, com as mesmas dimensões.
- Capas e descrições de tarefas alinhadas à esquerda, mantendo a posição da imagem consistente para títulos curtos e longos.

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
