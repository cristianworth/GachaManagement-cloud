# Atualizar dados — botão único em Games

Entrega da versão 1.9.1, com commit, push e escolha da numeração autorizados por Cristian em 07/10/2026. Não exige migração de banco. Alertas continuam somente planejados em [resin-alerts-plan.md](resin-alerts-plan.md).

## Comportamento

- Um botão **Atualizar dados** ao lado de Create New Game e View Tasks substitui os botões de estimativa de cada linha.
- Faz uma leitura pelo contrato existente `fetchAllGames` → `list_profile_games`, usando o perfil ativo da página. Atualiza seleção, configuração, resina e anotações salvas, inclusive mudanças feitas em outra aba/dispositivo. Não consulta contas dos jogos nem sincroniza calendários ou a lista de Tasks.
- Recalcula todas as estimativas com o mesmo horário, a partir das previsões salvas. Save continua sendo a ação que registra a quantidade real; Atualizar não grava dados.
- Cada campo é comparado com seu valor carregado. Campos sem edição recebem o novo valor salvo; campos alterados são restaurados como rascunho após a leitura, inclusive edições feitas durante a espera. Exemplo: WuWa salvo com 40 e campo local editado para 77 mostra estimativa de 40 e mantém 77 sem salvar.
- Falha na leitura mantém a lista, estimativas anteriores e rascunhos. **Tentar novamente** repete somente a leitura e mantém essa proteção. Enquanto consulta, o botão fica desabilitado e envios repetidos são ignorados.
- Jogos recém-selecionados aparecem; jogos removidos sem rascunho saem. Se um removido tiver alterações não salvas, a lista inteira é mantida com aviso para copiar o texto necessário antes de recarregar a página. Rascunhos permanecem somente na tela; recarregar/navegar pode descartá-los, conforme o comportamento anterior.
- Uma resposta iniciada em um perfil não substitui a lista se o perfil ativo tiver mudado durante a espera. Os perfis continuam públicos, sem autenticação.

## Testar localmente

```powershell
npm test
node --test tests/gameStamina.test.mjs tests/uiFeedback.test.mjs
npm run preview:profiles
```

Abra `http://127.0.0.1:5501/`. A prévia executa o frontend e SQL reais em banco descartável; encerre com Ctrl+C. Não consulta o Supabase live nem calendários remotos. Não é necessário reconstruir ou apagar o live.

1. Escolha um perfil, selecione WuWa e ZZZ e salve uma resina em cada jogo. Confira um único botão no topo; não há botões de atualização por linha.
2. Clique **Atualizar dados**: todas as estimativas são recalculadas. Em WuWa, salvo com 175, após seis minutos aparece 176/240; ao lotar, limita a 240/240. Jogo sem previsão continua indisponível. O texto “Calculada às…” foi removido a pedido de Cristian; a previsão de quando a resina ficará cheia continua visível.
3. Abra outra aba no mesmo endereço e perfil. Na primeira, edite a resina de WuWa para 77 e uma anotação de ZZZ sem salvar. Na segunda, salve WuWa com 40, ZZZ com 80 e anotações diferentes. Na primeira, clique Atualizar: WuWa mantém o campo 77 com estimativa de 40; ZZZ recebe 80 e conserva sua anotação local; as anotações de WuWa, sem edição local, recebem o texto da segunda aba.
4. Atualize novamente: os rascunhos continuam. Recarregue a página quando quiser descartá-los: os campos voltam aos valores salvos 40/80, comprovando que Atualizar não salvou os rascunhos.
5. Na segunda aba, remova um jogo pela seleção. A primeira o remove ao atualizar se não houver rascunho. Se houver rascunho nesse jogo, a primeira mantém a lista e apresenta o aviso de preservação.
6. Para simular falha, deixe a página aberta, encerre o servidor da prévia e clique Atualizar. Os dados permanecem com aviso de erro. Os testes automatizados cobrem a recuperação pela nova tentativa; reiniciar a prévia cria outro banco vazio, portanto não serve para conferir persistência entre reinícios.

## Evidências e limites

Em 07/10/2026, `npm test` passou **383 testes: 69 Jest + 314 Node**. O comando focado passou 31. Cobertura inclui uma leitura por clique, ausência de escrita, relógio fixo, valores remotos, preservação por campo, rascunhos vazios, falha/nova tentativa, duplo envio, mudança de seleção, troca de perfil e Save preservado.

Prévia em navegador com duas abas e SQL descartável confirmou WuWa 40, ZZZ 80, campo local 77 e anotação local preservada. Essa verificação não substitui o teste manual no Supabase/PostgREST real. A migração de favoritas da 1.9.0 continua uma pendência separada, descrita em [favorite-tasks.md](favorite-tasks.md).
