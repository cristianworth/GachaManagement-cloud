---
name: commit
description: Fechar uma entrega do Gacha Management com versão, changelog, roadmap, testes, commit e push quando Cristian solicitar esse fechamento.
---

# Fechamento do Gacha Management

Use esta skill somente neste repositório. Leia `AGENTS.md`, `docs/project-conventions.md`, `CHANGELOG.md`, `docs/roadmap-priorities.md` e o estado real do Git antes de fechar a entrega.

## Invocação e autorização

- Quando Cristian enviar `$commit`, selecionar esta skill no menu `/`, enviar `/commit` como pedido textual ou pedir explicitamente o mesmo fechamento, considere autorizados: escolher a versão, atualizar changelog e roadmap, validar, commitar e fazer push da entrega atual. Não peça novamente confirmação para essas ações no mesmo escopo.
- Perguntar sobre a skill, criá-la, editá-la ou citar esses comandos como exemplo não é invocá-la. Seleção automática da skill também não substitui um pedido humano de fechamento; sem esse pedido, limite-se à preparação e revisão.
- Respeite qualificadores do pedido, como somente commit local ou sem nova versão. O fechamento não autoriza implementar novas funcionalidades do roadmap nem alterar serviços ou banco reais.

## Identificar a entrega

Confira branch, remoto/upstream, alterações staged e unstaged, arquivos não rastreados e commits locais ainda não enviados. Relacione o diff com a implementação discutida; inclua somente seus arquivos. Preserve mudanças alheias e handoffs não relacionados, sem adicionar tudo indiscriminadamente.

Use a branch de destino já estabelecida por Cristian; na ausência de outra indicação, este projeto entrega em `main`. Não crie outra branch sem pedido. Se o checkout estiver destacado ou o destino continuar ambíguo depois de conferir as referências, esclareça o destino antes de publicar. Se não houver alterações nem commits da entrega para enviar, informe isso e não crie commit vazio ou versão artificial.

## Versão e documentação

Escolha o número pelo impacto real e pelas regras do changelog:

- PATCH: correção ou melhoria pequena sem funcionalidade relevante nova.
- MINOR: nova funcionalidade compatível.
- MAJOR: mudança incompatível no comportamento ou nos dados existentes.

Informe a escolha e o motivo sem transformar isso em uma nova aprovação. Não aumente a versão por commit: mantenha uma versão para a mesma entrega. Documentação e ferramentas internas sem mudança no produto podem conservar a versão e usar `Não publicado`; explique essa decisão.

Mantenha consistentes `package.json`, a versão raiz e de `packages[""]` em `package-lock.json`, a versão atual do `README.md` e o selo em `index.html`. Não substitua versões de dependências ou referências históricas. Quando fechar uma versão, organize as alterações de `Não publicado` na seção datada correspondente, preservando o histórico. Registre comportamento final, validações realmente realizadas e limitações relevantes.

Em `docs/roadmap-priorities.md`, remova das prioridades ativas somente o que foi entregue, ajuste a ordem quando necessário e registre a conclusão com referência ao changelog ou documento da entrega. Se houver entrega parcial, mantenha o restante pendente com descrição precisa. Atualize `TODO.md` quando representar a mesma tarefa. Preserve decisões e histórico; não invente novas prioridades nem tarefas concluídas. Se não houver item correspondente, não force alteração no roadmap.

## Validar e publicar

1. Execute os testes focados dos comportamentos alterados e efeitos colaterais plausíveis. Para documentação/skill apenas, valide a estrutura e as referências relevantes; não invente testes de aplicação para mudanças sem efeito executável.
2. Execute `npm test` no fechamento de MAJOR/MINOR ou quando Cristian pedir a suíte completa. PATCH usa testes focados. Não repita verificações aprovadas quando apenas documentação/numeração mudou; diferencie evidência anterior de execução nova.
3. Corrija falhas relacionadas à entrega antes de publicar. Se um bloqueio exigir escopo novo ou informação ausente, informe a evidência e o que falta; não declare a validação aprovada nem faça push ignorando um requisito que falhou.
4. Revise o diff final e `git diff --check`. Adicione os arquivos explicitamente, confira o staged e faça commit coeso com mensagem em inglês seguindo o histórico do projeto. Reutilize commits já feitos da mesma entrega quando só faltar o push.
5. Faça push para o destino verificado, sem force push ou reescrita de histórico. Se houver divergência, confira os commits antes de integrar; não descarte trabalho. Se o push falhar, preserve o commit local e reporte o erro sem declarar publicação concluída.
6. Se houver CI/deploy disparado, confira o resultado pelo commit enviado quando houver acesso. Separe push concluído, testes no CI e publicação do site; se não puder verificar algum deles, diga isso. Não crie tag ou GitHub Release sem pedido.

## Entrega

Informe versão escolhida ou preservada, hash/branch, resumo do diff, tarefas retiradas ou ajustadas, testes executados, status do push/CI/deploy e limitações. Termine na ordem preferida do projeto: **Para testar** com ações práticas quando aplicável, **Workflow** com andamento e pendências, **TL;DR** como último bloco. Não execute o próprio fechamento só porque esta skill está sendo criada ou revisada.
