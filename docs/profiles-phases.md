# Perfis: entregas menores para revisão

Cristian pediu reduzir o tamanho da alteração antes de continuar. O trabalho foi separado em quatro partes dependentes. **As partes 1–2 foram commitadas em `5e718fc`; a parte 3 foi validada localmente por Cristian e compõe a versão 1.6.0**. Em 05/10/2026, Cristian autorizou commit, push e atualização da versão. A parte 4 ainda não foi entregue; sua preparação não integra esta versão.

## Partes

| Parte | Escopo | Como revisar |
| --- | --- | --- |
| 1 — modelo SQL | Tabelas, chaves, RLS, migração do estado principal para CRAN e reset | Schema, migração e `profileModel.test.mjs` |
| 2 — contratos SQL | RPCs para leituras/gravações, seleção, eventos e lotes por perfil; proteção da limpeza antiga do HSR | Migração de contratos e `profiles.test.mjs` |
| 3 — interface | Entrada/troca de perfil e seleção de jogos; Games, Tasks e revisão usando os contratos | Frontend e teste DOM com SQL real |
| 4 — eventos | Nova identidade por edição em GI/HSR/ZZZ; exclusão permanente dos importados vencidos nos cinco jogos | Reconciliação, migração e testes específicos |

Cada parte terá sua revisão e validação antes de avançar. Não aplicar as partes 1–2 isoladamente no Supabase publicado: a interface anterior ainda grava nos campos antigos de progresso. **A primeira implantação utilizável exige as partes 1–3 juntas, incluindo a proteção do HSR acrescentada à parte 2**. Não usar os patches antigos como prova dessa proteção. Separar commits/revisões não exige publicar cada commit. Recomenda-se esperar a parte 4 para implantar também a política final de vencidos.

A proteção intermediária impede apagar a definição compartilhada do HSR enquanto existir estado pessoal não removido com prazo futuro/indefinido ou recorrência, inclusive para jogos ocultos e tarefas pessoais vinculadas. Os registros de outros perfis vencidos permanecem enquanto algum perfil estiver protegido. Ela conserva o contrato antigo de limpeza do HSR; **a exclusão individual por perfil e nos cinco jogos só entra na parte 4**.

## Decisões mantidas

- Três perfis fixos: **CRAN**, **Demo** e **Convidado**, conforme a confirmação de Cristian.
- Perfil não é autenticação: qualquer visitante poderá escolher qualquer um deles. Login, vínculo com usuário autenticado e RLS por usuário serão uma entrega própria.
- Catálogo/capa da mesma atividade compartilhados; resina, anotações, conclusão, prazo, recorrência e decisões separados.
- Games, Tasks, dropdowns e revisão deverão respeitar os jogos selecionados no perfil (parte 3).
- Weeklies mantêm HSR com Echo of War + Simulated Universe semanal; WuWa com Weekly Boss + Fantasies; ZZZ com Hollow Zero + Notorious Hunt. Criação/adiamento serão registrados por perfil e jogo.
- Cristian escolheu **exclusão permanente dos importados vencidos em GI, HSR, ZZZ, WuWa e NTE**, na parte 4. A identidade nova de GI/HSR/ZZZ e essa política de limpeza têm escopos diferentes: WuWa/NTE já possuem identidade por edição, mas também precisam da limpeza. Não implementar arquivo de tarefas; conservar somente marcas mínimas de identidade para impedir recriação. Tarefas manuais/recorrentes e prazos pessoais futuros continuam protegidos.
- Foi autorizado reconstruir a base, mas isso não foi necessário. Nenhuma alteração foi aplicada no Supabase real.
- Commit, push e versão 1.6.0 das partes 1–3 foram autorizados após a validação local de Cristian. A parte 4 terá validação própria antes de commit; não há autorização automática para entregar todas as melhorias do roadmap.

## Parte 1: o que muda

`games` e `tasks` permanecem como base de catálogo/definição. São acrescentadas referências de proprietário para jogos/tarefas privados e chave compartilhada para presets.

Novas tabelas:

- `profiles`: os três identificadores fixos, somente leitura para `anon`.
- `profile_games`: seleção e propriedades pessoais de cada jogo.
- `profile_tasks`: nome, prazo, conclusão, recorrência, proteção de prazo e remoção por perfil.
- `profile_event_decisions`: aprovação/ignorar e vínculo pessoal do evento.
- `profile_weekly_batches`: criação/adiamento de lotes por perfil e sigla.

A migração associa o estado atual ao CRAN, separa progresso do catálogo e conserva os estados dos lotes antigos. Demo e Convidado começam sem seleção/progresso. `reset_application_data()` também limpa as tabelas pessoais e conserva as identidades fixas. Os testes verificam chaves, restrições, RLS, dados independentes e reset em instalação nova e upgrade como `anon`.

**Na parte 1 isolada não entram:** RPCs de acesso por perfil, tela de escolha, filtros por seleção, nova reconciliação ou limpeza de eventos. Os contratos estão agora no diff como parte 2; a interface e a nova política de eventos continuam preservadas apenas como preparação local.

## Parte 2: o que muda

`2026-10-05-profile-contracts.sql` acrescenta funções públicas para ler/gravar jogos e tarefas por perfil, selecionar jogos, concluir/remover tarefas, revisar/ignorar eventos, restaurar prazo da API e criar lotes semanais. Os triggers ligam o importador existente aos estados pessoais sem resetar conclusão nem sobrescrever prazo manual. A API continua atualizando o catálogo compartilhado.

- Jogos integrados/capas de atividades pertencem ao catálogo; jogos personalizados e tarefas manuais têm proprietário.
- Escritas exigem perfil válido e jogo selecionado; tentar editar tarefa de outro perfil ou selecionar jogo personalizado de outro proprietário é rejeitado.
- Ocultar/reselecionar jogo conserva progresso, decisões e remoções. A remoção de tarefa usa uma marca pessoal para não recriar automaticamente.
- Lotes `created`/`skipped` pertencem a cada perfil e sigla; repetir a criação não restaura excluídos. A seleção sem weeklies registra o adiamento.
- `cleanup_expired_hsr_events()` passa a respeitar os estados pessoais antes de excluir uma tarefa compartilhada, com a mesma ordem de locks das gravações de eventos (candidato, tarefa, estado).

Os perfis continuam públicos: essas validações organizam dados por perfil e **não autenticam quem está usando CRAN/Demo/Convidado**. Login/convite e restrições por usuário não estão incluídos.

O Jest passa a descobrir somente testes em `tests/`. `.gitignore` não limita sua descoberta; as cópias incompletas de preparação em `.local-deliveries` não podem participar de `npm test`.

## Parte 3: interface e validação visual

- A entrada oferece CRAN, Demo e Convidado. A barra mostra o perfil ativo, a troca e a seleção de jogos. Trocar recarrega a página para limpar o estado visual anterior.
- Games, Tasks, criação/edição e revisão usam as RPCs por perfil. Cada página lê a preferência salva uma vez; uma alteração de perfil em outra aba não troca seu ator. Uma gravação pendente conserva o ator capturado antes de aguardar o banco.
- Selecionar jogos permite oferecer o lote inicial das weeklies. Desmarcar a oferta registra o adiamento; a criação explícita continua disponível na lista de tarefas.
- Ocultar jogo conserva seu progresso e atividades. A mensagem de lista vazia orienta usar Selecionar jogos. Dropdowns são reconstruídos sem duplicação nem jogos fora da seleção.
- Carregamento do catálogo e gravação usam o indicador existente; falhas conservam as escolhas e permitem nova tentativa. Se a seleção foi salva e a criação de weeklies falhou depois, a mensagem pede conferir os jogos salvos; repetir não recria lotes anteriores.

### Prévia visual sem Supabase

```powershell
npm run preview:profiles
```

Abra `http://127.0.0.1:5501`. O servidor lê o HTML/JS/CSS atuais e executa os contratos SQL como `anon` em PostgreSQL descartável. Substitui apenas o cliente/configuração do Supabase por uma ponte local e remove fontes remotas. Não aplica migrações no destino, não consulta APIs e não usa credenciais reais. O banco contém o catálogo inicial; a prévia permite criar weeklies/tarefas manuais, mas não carrega eventos dos calendários remotos. Pare com `Ctrl+C`; os dados temporários somem, mas o navegador pode lembrar o perfil escolhido.

Cenários para Cristian testar:

1. Escolher CRAN, selecionar GI + ZZZ e salvar com a oferta de weeklies marcada. Games deve mostrar dois jogos; Tasks deve oferecer os mesmos jogos e duas weeklies do ZZZ.
2. Concluir uma weekly e salvar resina/anotações no CRAN. Trocar para Demo e selecionar apenas ZZZ. A weekly deve estar aberta e os dados pessoais devem começar separados.
3. Criar uma tarefa manual ou jogo personalizado no CRAN e conferir que ele não aparece no Demo. Editar a capa de uma weekly compartilhada deve refletir a mesma capa no outro perfil.
4. Ocultar ZZZ no CRAN e selecioná-lo novamente. Conclusão, tarefas e decisões devem voltar; lotes já registrados não devem recriar excluídos.
5. No Convidado, selecionar HSR sem a oferta de weeklies. Recarregar não deve criá-las. Em Tasks, selecionar HSR e usar a criação explícita deve criar o lote uma vez.
6. Abrir o formulário de tarefa repetidamente e conferir que o dropdown contém somente os jogos selecionados, sem duplicações.
7. Manter duas abas abertas: trocar o perfil na segunda não deve alterar o perfil exibido nem o destino de gravações da primeira.

O teste `profileUI.test.mjs` usa HTML/módulos reais e RPCs executadas em SQL. Também cobre aprovação de revisão pessoal, ignorar um candidato aprovado em outro perfil sem ter tarefa própria, rota direta de jogo não selecionado com candidato existente, falha de catálogo/seleção, bloqueio de envio duplicado e recuperação após falha de weeklies. No navegador local foram conferidos entrada, seleção, troca CRAN/Demo, conclusão independente e recarregamento direto de `/profile/games`. A seleção foi conferida em largura de 390 px, sem transbordamento horizontal. Isso não substitui validação do PostgREST ou concorrência entre conexões reais.

Validação da parte 3: `npm test` passou **316 testes** (50 Jest + 266 Node), incluindo os **5 testes DOM/SQL** de `node --test tests/profileUI.test.mjs`. `git diff --check` passou. Não houve nova alteração em schema, migrações, CLI de sincronização ou workflow diário nesta parte.

## Parte 4: o que falta implementar

1. **Identidade por edição em GI/HSR/ZZZ.** Distinguir períodos diferentes de atividades com o mesmo nome. Correção da mesma edição deve reutilizar sua identidade; uma edição nova deve começar sem conclusão, ignorados ou prazo manual herdados. Associação ambígua deve interromper a escrita. WuWa/NTE já têm identificação por edição.
2. **Exclusão permanente por perfil nos cinco jogos.** Remover importados vencidos conforme o prazo efetivo de cada perfil, preservando prazos pessoais futuros/indefinidos, recorrência e tarefas manuais. Hoje a proteção intermediária do HSR mantém a tarefa compartilhada inteira enquanto algum perfil estiver protegido; a parte 4 deve permitir remover o estado vencido de CRAN sem apagar o prazo futuro do Demo.
3. **Impedir recriação da edição removida.** Conservar somente a marca mínima de identidade/decisão necessária para uma nova sincronização não recriar o mesmo evento vencido. A próxima edição deve poder aparecer normalmente.
4. **Integrar e testar a nova política.** Alinhar reconciliação, importação, limpeza, schema/migração e testes de instalação nova/upgrade. Cobrir correção de datas, edição seguinte, ambiguidade, decisões independentes, prazo manual futuro, recorrência e repetição da sincronização em GI/HSR/ZZZ/WuWa/NTE.

**Pendências de implantação das partes 1–3:** aplicar e verificar as migrações no Supabase de destino, validar as RPCs via PostgREST e testar duas conexões reais. Essas pendências não são login/convite: autenticação, convites e RLS por usuário pertencem a uma entrega futura separada. O catálogo completo da API e variantes regionais também continuam no tier B.

## Testar as partes 1–2

```powershell
npm test
npm run test:db
node --test tests/profileModel.test.mjs
node --test tests/profiles.test.mjs
node node_modules/jest/bin/jest.js --listTests --runInBand
```

Os comandos usam fixtures e PostgreSQL descartável. Não consultar APIs nem aplicar a migração no destino para esta revisão. Conferir se `db/schema.sql` inclui exatamente as migrações `2026-10-05-profile-model.sql` e `2026-10-05-profile-contracts.sql` e se a sequência está em `tests/helpers/testDatabase.mjs`. `--listTests` deve listar somente os nove arquivos Jest da pasta oficial `tests`.

A revisão da IA master identificou que a descoberta das cópias locais fazia o comando padrão falhar; os 291 testes oficiais passavam apenas quando a busca era restringida. Após corrigir `roots`, o comando padrão da parte 1 passou efetivamente os **291 testes**.

Na parte 2, `npm test` passou **311 testes** (50 Jest + 261 Node), `npm run test:db` passou **85 testes**, e `git diff --check` passou. Schema e as duas migrações de perfis foram conferidos como iguais. O novo teste de limpeza do HSR primeiro falhou em instalação nova e upgrade, reproduzindo a exclusão por cascata; passou depois da correção. Os 20 testes de contratos cobrem:

- seleção/resina independentes e rollback de seleção inválida;
- tarefas/jogos privados e rejeição de gravações/vínculos indevidos;
- conclusão, prazos manuais, sincronização e capas compartilhadas;
- ignorados/revisão por perfil e ocultação/reseleção;
- lotes independentes, exclusão sem recriação e reset;
- prazo manual futuro do Demo com jogo oculto, recorrência vencida, prazo indefinido e tarefa pessoal vinculada durante a limpeza do HSR;
- exclusão do importado HSR quando nenhum estado protegido resta e preservação de tarefas sem vínculo de importação.

PostgREST real e concorrência entre conexões continuam pendentes. A interface da parte 3 foi validada por Cristian na prévia local, com commit/push autorizados. O agente não aplicou migrações no Supabase real. Commit do código e atualização do banco de destino são operações separadas.

## Trabalho preservado localmente

Os patches ficam em `.local-deliveries/profiles/`, ignorados pelo Git. Não são entregues/publicados no commit da parte 1:

1. `01-model.patch`: referência da primeira parte, já no diff atual; não reaplicar.
2. `02-contracts.patch`: preparação já aplicada, depois corrigida para proteger o HSR; não reaplicar.
3. `03-interface.patch`: preparação aplicada à parte 3, depois corrigida e ampliada com prévia/testes; não reaplicar nem usar como versão final.
4. `04-editions-expiry.patch`: preparação da parte 4; **a versão guardada restringe incorretamente a limpeza a GI/HSR/ZZZ**. Antes de usá-la, corrigir para os cinco jogos e compatibilizar com a proteção antecipada do HSR.

Há também snapshots JSON e o snapshot original completo. A separação preservou o código; não refez a funcionalidade. Não executar novamente o script de particionamento, pois ele foi feito para o estado anterior à separação.

Para **somente conferir** o tamanho da próxima preparação, sem aplicá-la:

```powershell
git apply --stat .local-deliveries/profiles/04-editions-expiry.patch
```

Após a validação de Cristian, a IA deve atualizar a preparação da próxima parte, conferir `git apply --check` e executar seus testes. A conferência antiga da cadeia não vale após as correções atuais. Não executar novamente os scripts de particionamento/verificação, que pressupõem o estado anterior. Os patches são preparação para revisão, não confirmação de implantação. O CSS dos controles novos foi conferido na prévia local; PostgREST real e concorrência entre duas conexões continuam pendentes.
