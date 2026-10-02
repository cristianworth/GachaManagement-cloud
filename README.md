# 🎮 Gacha Management

As melhorias planejadas e suas estimativas de complexidade estão em [TODO.md](TODO.md).

O **Gacha Management** é uma aplicação projetada para ajudar jogadores de **gacha games** a gerenciar sua **resina/stamina** e acompanhar **tarefas recorrentes** nos jogos. Ele oferece ferramentas para rastrear a regeneração da stamina, organizar atividades programadas e facilitar o planejamento dentro dos jogos.

Versão atual: **1.2.0**. Consulte o [CHANGELOG](CHANGELOG.md) para ver as alterações de cada versão e as regras de versionamento utilizadas.

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
  - **Quinzenal**
  - **Mensal**
  - **Eventos personalizados**
- Permite visualizar todas as tarefas em um **calendário simples**, evitando que você esqueça **eventos importantes**.

### Eventos do Genshin e HSR

Uma rotina semanal consulta o calendário em inglês da [StarRailAssistant](https://starrailassistant.top/reference/public-api/) e registra candidatos de Genshin e HSR no Supabase. Na lista de tarefas, **Revisar eventos** abre uma página para selecionar o jogo antes de revisar. A importação inclui os eventos atuais e próximos, sem filtro automático para login ou seletores: você pode ignorá-los. Confira o prazo, aprove para criar uma tarefa, vincule a uma tarefa de evento existente do mesmo jogo ou ignore. A aprovação grava a tarefa e o vínculo juntos. Uma nova data da fonte reabre a revisão; eventos ignorados continuam ignorados. Candidatos ausentes na fonte saem da fila.

Cada edição dos modos do HSR usa o nome completo fornecido pela API como identidade, com início, fim e capa próprios. Edições vencidas aprovadas são removidas automaticamente da lista ao abrir o aplicativo, carregar a lista de tarefas ou executar a sincronização. **Somente tarefas vinculadas a candidatos importados do HSR são removidas**; as tarefas manuais, incluindo os ciclos antigos, ficam para você excluir após testar. Edições futuras aprovadas indicam quando começam. A limpeza utiliza o prazo salvo na tarefa, inclusive ajustes manuais.

O calendário não informa o fuso junto às datas. As datas de Genshin e HSR são interpretadas como horário do servidor Ásia. Para HSR, a conversão é uma sugestão pela regra de reset do servidor, não uma garantia informada pela API. Se o fim recebido é 03:59:59 nesse servidor, a tela propõe o prazo do servidor América (+13 horas no instante UTC). Para outros horários, o instante do servidor Ásia preenche o prazo inicial; o usuário pode ajustá-lo. Se houver data final válida mesmo sem início, ela também preenche o prazo. Um fim ausente ou inválido ainda exige preenchimento manual. A revisão exibe a capa fornecida pela API e o tempo restante para o prazo escolhido. A cobertura pode variar entre idiomas, pois eles usam fontes diferentes; confira periodicamente se o endpoint `en-US` inclui os eventos relevantes.

Para habilitar o piloto em um banco já existente, primeiro confira o backup de `games` e `tasks` e então execute [`db/migrations/2026-09-29-genshin-events.sql`](db/migrations/2026-09-29-genshin-events.sql) no SQL Editor do Supabase. Se essa migração já foi aplicada antes da inclusão das capas, execute também [`db/migrations/2026-09-30-event-cover.sql`](db/migrations/2026-09-30-event-cover.sql). A migração inicial adiciona `event_candidates` e a função de aprovação sem alterar as tabelas e policies existentes; a segunda apenas adiciona `cover_url`. Execute `node scripts/previewStarRailAssistantGenshin.js` para comparar a fonte com candidatos e tarefas sem gravar nada, `node scripts/syncGenshinEvents.js --dry-run` para inspecionar os candidatos e `node scripts/syncGenshinEvents.js` para sincronizá-los. Na primeira execução, a rotina reaproveita candidatos correspondentes da fonte anterior, preservando tarefas aprovadas, e desativa os que não aparecem na StarRailAssistant. A sincronização semanal está em [`.github/workflows/sync-genshin-events.yml`](.github/workflows/sync-genshin-events.yml) e passa a rodar às segundas-feiras, 12:00 UTC, quando o workflow estiver na branch padrão do repositório. Também pode ser acionada manualmente pelo GitHub Actions. O workflow consulta agora os dois jogos via `node scripts/syncEvents.js`. A rotina usa a URL e a chave **pública** já configuradas no aplicativo; `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` podem sobrescrevê-las no ambiente.

![Gacha Schedule](img/demo/gacha-schedule-demo-02.png)

As capas dos eventos aprovados ficam salvas como URL em `tasks.cover_url` e aparecem como miniaturas ao lado do nome na lista de tarefas. Para bancos existentes, execute [`db/migrations/2026-10-01-task-cover.sql`](db/migrations/2026-10-01-task-cover.sql) depois das migrações do piloto: ela atualiza a função de aprovação e preenche capas dos eventos já aprovados, preservando imagens existentes. Editar o prazo ou o nome mantém a capa. Eventos importados sem imagem e links indisponíveis exibem um placeholder; a edição manual de imagens fica para uma etapa posterior.

Para habilitar HSR e a revisão por jogo em um banco existente, execute [`db/migrations/2026-10-02-hsr-events.sql`](db/migrations/2026-10-02-hsr-events.sql) depois das três migrações anteriores. Ela associa os candidatos existentes ao Genshin, adiciona início às tarefas e atualiza a aprovação e a limpeza. Para um banco novo, `db/schema.sql` já contém a estrutura atual.

```bash
# Inspecionar HSR sem gravar
node scripts/syncEvents.js --game=hsr --dry-run
# Carga inicial e sincronização de ambos os jogos
node scripts/syncEvents.js
# Sincronizar somente HSR
node scripts/syncEvents.js --game=hsr
# Testes da importação, prazos e proteção dos dados
node --test tests/*.test.mjs
npm test -- --runInBand
```

A API não oferece um ID estável nem identifica o servidor. O nome completo é a chave de cada edição; uma mudança de nome na fonte pode gerar outro candidato e exigir ignorar o antigo. Prazos fora do padrão validado usam a Ásia e continuam ajustáveis. A aprovação permanece manual, inclusive em sincronizações semanais.

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
O projeto usa **Jest** para testes automatizados. Para rodar os testes:

```bash
npm test
```

Certifique-se de que o Babel está configurado corretamente para suportar **ES Modules** ao rodar os testes. Caso precise configurar, adicione o seguinte no `jest.config.js`:

```js
export default {
  transform: {
    "^.+\\.js$": "babel-jest"
  },
  testEnvironment: "node",
};
```
