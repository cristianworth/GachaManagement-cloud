# 🎮 Gacha Management

O **Gacha Management** é uma aplicação projetada para ajudar jogadores de **gacha games** a gerenciar sua **resina/stamina** e acompanhar **tarefas recorrentes** nos jogos. Ele oferece ferramentas para rastrear a regeneração da stamina, organizar atividades programadas e facilitar o planejamento dentro dos jogos.

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

![Gacha Schedule](img/demo/gacha-schedule-demo-02.png)

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
