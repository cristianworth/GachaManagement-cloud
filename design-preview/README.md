# Sangonomiya — implementação e ambiente de avaliação

O tema está implementado no frontend real da branch `codex/anime-design`. As fontes ativas são `css/sangonomiya.css`, `js/ui/appShell.js` e `img/sangonomiya.png`, carregadas por `index.html` e `js/index.js`. Os arquivos antigos desta pasta são referências históricas.

## Abrir a aplicação com dados descartáveis

```powershell
node scripts/previewProfiles.js --design --port=5502
```

Abra http://127.0.0.1:5502. O comando gera o build e inicia PostgreSQL descartável com exemplos. Não precisa de configuração Supabase. Navegação e recarga preservam os dados enquanto o servidor estiver aberto; cada reinício repõe os exemplos. Eventos fictícios não representam o calendário dos jogos.

O build em `.local-deliveries/anime-design/build` e o ZIP `anime-design-build.zip` contêm o frontend completo e configuração isolada. Precisam do servidor acima para executar operações de banco: abrir o HTML diretamente ou publicar este pacote como site estático não fornece o backend. O frontend principal mantém sua integração normal com Supabase.

## Resultado

- Fundo original inspirado em Sangonomiya, com paisagem nas bordas e painéis legíveis.
- Ações em azul lagoa, coral nos detalhes, Georgia nos títulos e fontes locais nos controles.
- Games e Tasks continuam em páginas separadas, com os controles originais.
- Perfis, seleção de jogos, formulários, eventos, lotes e confirmações receberam o mesmo tema.
- Desktop com navegação lateral; celular com navegação superior e rolagem contida na tabela Tasks.

O plano e o registro das nove etapas estão em `docs/sangonomiya-design-plan.md`.

## Validação final

127 testes focados passaram: 40 de apresentação/stamina/feedback, 86 de formulários/perfis/eventos/lotes/diálogos e 1 de build/shell/DOM. Revisão independente por dois agents. No fechamento MINOR 1.13.0, a suíte completa passou 582 testes (69 Jest + 513 Node), sem falhas.

No navegador: Save e recarga de Games; preservação de rascunhos ao atualizar; filtros, favorito, conclusão e ocultar concluídas; criação de tarefa com intervalo de 3 dias; criação e edição de jogo; aprovação e descarte de candidatos; seleção de lote e cancelamento da confirmação aninhada, com foco devolvido ao botão de origem; entrada e troca de perfil.

Inspeção em 1440 × 1000 e 390 × 844: sem rolagem horizontal da página; Tasks rola dentro do painel, formulário e diálogo cabem na largura móvel. Capturas atuais têm prefixo `final-` em `.local-deliveries/anime-design/screenshots`. Console sem erros nos fluxos observados. Reiniciado o banco de avaliação ao concluir para repor exemplos.

**Para testar:** escolha CRAN, percorra Games, Tasks e Eventos. Em Games, altere To-do e stamina, salve e recarregue. Em Tasks, filtre por jogo, favorite e conclua uma tarefa; experimente Create New Task e Escolher itens. Confira Trocar perfil e Selecionar jogos.

Fechamento autorizado por Cristian: versão 1.13.0, changelog, commit e push na branch codex/anime-design. Merge e publicação ficam para o próximo passo. Os testes não validam as permissões do Supabase real nem todos os navegadores.
