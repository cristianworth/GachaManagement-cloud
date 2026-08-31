# 📌 Gacha Management - DEV Notes

## 🔧 Funcionalidades Implementadas
### 📝 Tarefas
- [X] Atualização do status de concluído (Is Done)
- [X] Criação de novas tarefas
- [X] Edição de tarefas

### 🎮 Jogos
- [X] Atualização da stamina (Editar Jogo)
- [X] Criação de um novo jogo

## 🛠️ Melhorias Planejadas (To-Do List)
- [ ] Criar um histórico de alterações em tarefas/jogos
- [X] Criar testes de unidade/integração para funcionalidades principais
- [ ] Melhorar a interface (CSS/UI/UX)
- [ ] Implementar funcionalidade de edição com redirecionamento para uma nova página de formulário
- [X] Reorganizar estrutura separando **Task** de **dbTask**
- [ ] Adicionar mensagens de confirmação ao concluir uma operação
- [ ] Reordenar as tarefas concluídas para o final da lista
- [ ] Criar um filtro por tipo de evento (Diário, Semanal, etc.) e jogo
- [X] Limpar os formulários após adicionar uma nova tarefa/jogo

## 🐛 Correções de Bug Pendentes
- [X] A primeira vez que a página é carregada fica em branco (agora `initializeDatabase()` é aguardado antes da primeira renderização em `js/index.js`)
- [ ] Corrigir chamadas duplicadas da função `displayAllGames()` ao carregar a página

## ☁️ Migração de Armazenamento (Local → Nuvem)
- Substituído o **IndexedDB (Dexie.js)**, que guardava os dados apenas no navegador
  atual, pelo **Supabase (Postgres na nuvem)**, sincronizando navegador e celular.
- A camada de dados manteve a **mesma API pública** (`gameDB.js` / `taskDB.js`), então
  a UI não precisou mudar. A conexão vive em `supabaseClient.js`, a configuração em
  `js/config/supabase.config.js`, e a conversão de schema em `js/database/mappers/`.
- Veja o passo a passo de configuração no `README.md` e o schema em `db/schema.sql`.

## 📌 Aprendizados Importantes
- Uso de **módulos JavaScript** (`import/export`)
- **Supabase** (Postgres na nuvem) e o padrão **Repository + Mapper** para isolar o schema do domínio
- Uso de **Event Listeners** ao invés de funções inline no HTML
- **Evitar `var`** (escopo de função), preferindo `const` e `let` (escopo de bloco)
- Diferenças entre **ES Modules** (`import/export`) e **CommonJS** (`require()`)
