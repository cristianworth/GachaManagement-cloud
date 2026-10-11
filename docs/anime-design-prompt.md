# Prompt de execução: tema anime do Gacha Management

> Plano vigente em 2026-10-10: Cristian autorizou a implementação real, em etapas fáceis ou médias, com até dois agents normalmente e um terceiro em casos especiais. Siga `docs/sangonomiya-design-plan.md`: ele substitui este briefing inicial, inclusive as restrições antigas de manter o frontend principal inalterado e de não destacar uma franquia. A etapa 1 real incorpora Sangonomiya no aplicativo; o ambiente descartável reutiliza esses arquivos para testes. O restante deste documento registra o pedido inicial da prévia.

Use a skill `frontend-design` para executar este trabalho na branch `codex/anime-design`.

O desenvolvimento será feito no Codex, conforme confirmado por Cristian. Invoque `$frontend-design` e leia `.agents/skills/frontend-design/SKILL.md` por inteiro. A cópia original em `.claude/skills/frontend-design` permanece disponível, mas não é necessário instalar ou executar Claude Code. A skill orienta seu processo de design; as instruções do usuário e as convenções do projeto prevalecem.

## Estado da preparação

- Branch ativa: `codex/anime-design`, criada a partir de `main`.
- A skill está instalada no escopo do projeto e já aparece no catálogo de skills do Codex.
- O conteúdo de `SKILL.md` foi comparado por SHA-256 com a cópia original; ambas são idênticas. `LICENSE.txt` acompanha a instalação.
- Nenhum arquivo da aplicação foi alterado nesta preparação. A versão permanece `1.12.1`.
- As cinco escolhas de direção abaixo foram respondidas por Cristian. Ele solicitou em seguida um full build com full preview antes de aplicar o tema ao frontend principal.
- A execução atual é uma versão completa de avaliação em `design-preview/`, usando os módulos reais e o servidor de PostgreSQL descartável. A aprovação visual precede a aplicação do tema ao frontend principal.

## Decisões confirmadas por Cristian

1. Liberdade de layout: explorar um layout novo, preservando todas as funções e as telas separadas.
2. Identidade: tema anime geral, sem destacar um jogo específico.
3. Primeira entrega: todas as telas, formulários e diálogos de uma vez.
4. Dispositivo prioritário: computador principalmente. O celular continua precisando funcionar bem.
5. Atmosfera: anime suave, com céu, flores, lavanda e painéis claros.

Estas respostas substituem as propostas anteriores de paisagem de Genshin, azul profundo, dourado e implementação de Games primeiro. Não trate as prévias anteriores como o design aprovado. O objetivo é ter personalidade anime, reduzir o branco puro e reorganizar a apresentação sem alterar o comportamento do produto.

## Sequência de trabalho acordada

1. Preparação da branch e da skill — concluída.
2. Respostas de Cristian e definição do escopo — concluídas.
3. Plano visual compacto segundo a skill, fundamentado nas telas reais — preparar no início da execução.
4. Full build e full preview de todas as telas, formulários e diálogos na branch, usando a interface real e dados descartáveis; manter o frontend principal inalterado.
5. Revisão visual por Cristian, ajustes e validação proporcional.
6. Versão e fechamento somente quando solicitados.

## Contexto e objetivo

Gacha Management é um projeto pessoal de Cristian, feito em JavaScript com módulos ES, HTML e CSS, sem framework. Ele usa o aplicativo para acompanhar stamina, anotações e tarefas de jogos gacha. Quer uma identidade anime suave própria, com céu, flores, lavanda e painéis claros. O aplicativo deve representar seus vários jogos, sem parecer dedicado a uma franquia específica.

A entrega deve criar uma proposta visual completa de avaliação a partir do aplicativo existente, deixando-a disponível para revisão nesta branch sem aplicar o tema ao frontend principal. Leia `AGENTS.md` e `docs/project-conventions.md` antes de começar. Preserve a estrutura técnica e as funções existentes.

## Correção essencial das prévias anteriores

Uma primeira prévia foi rejeitada porque inventou botões de "Gastar resina", adicionou barras de stamina e juntou Games e Tasks em uma única tela. Isso mudou o produto e não representa o pedido. Uma segunda prévia preservou a estrutura real; sua aparência ainda não foi aprovada como definitiva.

Não reutilize o layout inventado da primeira prévia. O ponto de partida obrigatório é o código atual, não um dashboard genérico nem uma landing page. Cristian agora autorizou um layout novo: reorganizar a apresentação é permitido, inventar funções ou juntar páginas distintas não é. Mapeie cada controle e informação existente para a nova apresentação antes de modificar o HTML.

## Fluxo atual a preservar

- `index.html` contém páginas separadas, selecionadas pelo roteador.
- A barra de perfil tem o perfil ativo, Trocar perfil e Selecionar jogos.
- Games tem Create New Game, View Tasks e Atualizar dados.
- A tabela atual de Games possui seis colunas: Icon, Game, To-do, Stamina, Max Stamina At e Actions. Essas informações e controles devem continuar disponíveis; a organização visual pode mudar conforme o novo layout autorizado.
- `js/ui/gameUI.js` monta as linhas em `createGameRow`: ícone, nome, textarea de anotações, input numérico de stamina com Save, estimativa de resina com prazo, Edit e Ocultar jogo.
- Save grava stamina e anotações juntas. A estimativa parte dos dados salvos. Preserve esse contrato.
- View Tasks navega para uma página separada; os formulários de jogos e tarefas e a revisão de eventos também continuam separados.
- Preserve os contratos de IDs e seletores usados pelo JavaScript, eventos, rotas, estados hidden/disabled, mensagens e comportamento dos perfis. Mudanças de estrutura visual devem conservar os contratos verificados, incluindo os usos de `closest('tr')` em Games enquanto esses handlers permanecerem assim. Preserve os textos existentes; não faça uma tradução incidental.

## Direção visual

Defina uma paleta de 4–6 cores segundo a skill: lavanda, céu suave, painéis claros com alguma tonalidade e texto escuro com contraste suficiente. Rosa floral e verde suave podem servir como detalhes proporcionais. Não use branco puro como preenchimento dominante nem reutilize a paleta escura das prévias anteriores por inércia. Escolha fontes com personalidade nos títulos e excelente leitura em campos, listas e números.

Concentre a identidade no cenário e no acabamento dos controles. O novo layout pode reorganizar cabeçalhos, navegação, ações e apresentação das listas, preservando o conteúdo e os fluxos reais. Mantenha tabelas e formulários legíveis e as ações visualmente coerentes. Evite grandes slogans, seções promocionais, excesso de brilho, animações contínuas ou novos controles funcionais. O aplicativo é uma ferramenta de uso diário, usado principalmente no computador.

O fundo deve sugerir céu e flores em uma atmosfera anime suave e geral, sem privilegiar Genshin ou outro jogo. Nenhuma imagem específica foi escolhida. É possível propor uma ilustração original coerente com o tema, usando a skill apropriada para gerar um bitmap se essa for a escolha; não apresente uma arte original como imagem oficial de um jogo. Uma solução diretamente em CSS também é válida quando produzir o efeito pretendido sem fingir ser uma imagem real. O tema deve funcionar sem uma imagem e sem depender de um link remoto frágil.

## Processo e limites

1. Leia a skill inteira e examine `index.html`, `css/styles.css`, `js/ui/gameUI.js` e os usos reais dos componentes relevantes. Identifique o que pode ser resolvido somente com estilos.
2. Faça o plano compacto solicitado pela skill: paleta, tipografia, layout e princípios. Para o layout novo, explique onde ficam as funções atuais, como a navegação mantém as telas separadas e como os contratos de DOM serão preservados. Revise o plano contra o contexto acima antes de implementar.
3. Implemente uma mudança visual coerente em todas as telas, formulários e diálogos, respeitando a simplicidade técnica do projeto. CSS e ajustes proporcionais de HTML são permitidos. Não introduza framework, novas dependências, abstrações amplas ou alterações no banco, integrações, cálculo de stamina, calendário e lógica de tarefas.
4. Confira os efeitos do CSS compartilhado nas telas de Games, Tasks, perfil, formulários, revisão de eventos e diálogos. Preserve foco visível, contraste, disabled e hidden; mantenha a rolagem da tabela contida no celular.
5. Valide a interface com dados fictícios ou cliente simulado. Não grave no Supabase real para testar o tema. Faça inspeção visual em desktop e celular se o ambiente permitir; declare a limitação se não permitir.
6. Execute testes focados proporcionais ao que foi alterado. Para mudanças no HTML ou nas interações de Games, considere `tests/gamePresentation.test.mjs`, `tests/gameStamina.test.mjs` e `tests/uiFeedback.test.mjs`. Não crie testes que apenas reproduzam valores de CSS. A suíte completa fica para o fechamento de uma versão MAJOR/MINOR ou pedido explícito.
7. Entregue arquivos alterados, verificações realizadas, pendências e passos práticos de interface em um parágrafo "Para testar". Diferencie validação automatizada de inspeção visual.

Não faça commit, push, merge ou atualização de versão nesta execução. Antes de um fechamento futuro, leia as regras de `CHANGELOG.md` e alinhe a versão com Cristian. Não modifique as skills para acomodar o projeto: este prompt contém o contexto específico.

## Critérios de aceite

- O layout pode ser novo, mas o Gacha Management conserva todas as funções, os fluxos e os controles existentes.
- O tema reduz o branco puro e transmite anime suave, com céu, flores, lavanda e painéis claros, sem prejudicar a leitura ou destacar uma franquia.
- Todas as telas, formulários e diálogos recebem tratamento consistente nesta primeira entrega; desktop é prioritário e mobile permanece utilizável.
- Games e Tasks continuam páginas distintas; nenhum botão de consumo ou barra de stamina é adicionado.
- Campos de anotações e stamina permanecem editáveis, e Save conserva a responsabilidade existente.
- A entrega fica isolada na branch solicitada, pronta para revisão, com eventuais limitações de imagem e validação explicitadas.
