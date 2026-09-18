# Changelog

Todas as alterações relevantes do Gacha Management são registradas neste arquivo.

O projeto segue o versionamento semântico (SemVer), no formato `MAJOR.MINOR.PATCH`:

- `MAJOR`: mudança incompatível com o comportamento ou os dados existentes.
- `MINOR`: nova funcionalidade compatível com a versão anterior.
- `PATCH`: correção de bug ou melhoria pequena, sem nova funcionalidade relevante.

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
