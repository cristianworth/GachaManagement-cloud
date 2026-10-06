# Parte 4: edições e exclusão de eventos vencidos

Entregue na versão 1.7.0, com commit, push e versão autorizados por Cristian em 06/10/2026 junto do roadmap atualizado. Em 05/10/2026, Cristian reafirmou que os dados do Supabase live são descartáveis e autorizou reconstruir a aplicação do zero. Não foi necessário transportar o histórico desse banco.

## Comportamento

- Os cinco jogos usam nome normalizado + período de origem para identificar uma edição. GI/HSR/ZZZ passam a usar o contrato já existente em WuWa/NTE. Um período sobreposto ou a mesma âncora reutiliza a chave persistida; períodos comprovadamente separados criam edições independentes. Datas incompletas sem associação segura e mais de uma correspondência abortam antes de qualquer escrita, inclusive a limpeza.
- Correções da mesma edição conservam conclusão, ignorados, capas, prazos manuais e recorrência. Uma nova edição não herda essas decisões. Mudança de nome não é associada silenciosamente a outro nome; o provedor não fornece ID independente.
- `cleanup_expired_imported_events(p_source, p_now)` remove estados pessoais importados cujo prazo efetivo é menor ou igual ao relógio do banco e cuja recorrência é Event (`refresh_type = 0`). Fonte e sigla precisam corresponder. GI, HSR, ZZZ, WuWa e NTE estão incluídos; a fonte legada GI também é reconhecida. Tarefas manuais sem vínculo, weeklies, recorrência personalizada e prazos pessoais futuros/indefinidos ficam fora.
- Jogos ocultos não interrompem a política de vencidos. A limpeza pode excluir o estado do CRAN e conservar o prazo futuro do Demo. Uma tarefa pessoal vinculada na revisão segue seu próprio prazo; a seleção não cria uma segunda cópia compartilhada para esse perfil.
- Não há arquivo de tarefas vencidas: o estado e as definições sem usuários ativos são apagados. Ficam o identificador/período do candidato e uma decisão `expired` sem tarefa vinculada, necessários para não recriar a mesma edição. Isso não é uma garantia de anonimização dos metadados do catálogo.
- Uma definição compartilhada só é apagada quando seu prazo também venceu e não há estado pessoal ativo protegido, incluindo aliases da revisão. Candidatos encerrados globalmente ficam `ignored`. Repetir sincronização/seleção não reabre estados encerrados; a próxima edição continua elegível.
- O sincronizador faz a limpeza da fonte antes de atualizar o calendário, após validar todas as identidades, e novamente após importar. Assim uma correção tardia não estende uma tarefa que já deveria ter sido excluída. O retorno conta estados pessoais removidos; a função antiga HSR conserva a contagem de definições compartilhadas removidas.
- O importador global cria definições com `owner_profile_id = null`, sem progresso implícito no CRAN. Somente a seleção de um jogo materializa os eventos elegíveis no perfil. O boot e a lista usam o mesmo contrato de limpeza dos cinco jogos.
- A lista de tarefas executa a limpeza dos cinco jogos antes da leitura. Ausência da API apenas inativa candidatos: não exclui tarefas ainda protegidas. Horários, fontes conferidas, catálogos semanais e workflow diário às 07h30 de Brasília não foram alterados.

## Testar sem tocar no live

```powershell
npm test
npm run test:db
node --test tests/eventEditionsExpiry.test.mjs
npm run preview:profiles -- --events
```

Na prévia, abra `http://127.0.0.1:5501`. Se a prévia anterior ainda estiver rodando, pare-a com `Ctrl+C` antes de iniciar esta. `--events` usa apenas cenários sintéticos, identificados como `[TESTE]`, em PostgreSQL descartável; não consulta APIs nem usa o Supabase real.

1. Escolha **CRAN** e abra Tasks: devem aparecer somente as cinco edições seguintes, abertas. As cinco anteriores tinham prazo de 2025 e foram excluídas ao abrir a lista.
2. Troque para **Demo**: aparecem as dez tarefas. As cinco anteriores estão concluídas, com prazo manual de fevereiro de 2099; as seguintes começam abertas.
3. Troque para **Convidado**: as dez tarefas aparecem. As anteriores têm recorrência semanal, que permanece protegida e segue a renovação normal da aplicação.
4. Volte ao CRAN, oculte um jogo e selecione-o novamente sem oferecer weeklies. Sua edição encerrada não deve retornar. As tarefas seguintes permanecem.

Os testes SQL/REST cobrem instalação nova e upgrade, fronteira exata do vencimento, repetição, proteção por perfil nos cinco jogos, aliases pessoais, limpeza antes de uma correção tardia, nova edição independente, ambiguidade sem escrita, rollback da limpeza e reinstalação repetível/atômica. Os testes executam como `anon`. Isso não comprova concorrência entre duas conexões Postgres reais.

## Reinstalar o Supabase live do zero

```powershell
npm run db:reset:build
```

O comando **gera** `.local-deliveries/profiles/reset-live.sql`; não conecta nem modifica o live. Execute o arquivo inteiro no SQL Editor do projeto usado pela aplicação. Ele remove as tabelas/funções da aplicação, instala o schema atual e semeia os cinco jogos numa única transação. Não remove os schemas `auth`/`storage` nem extensões. Os três perfis começam sem jogos selecionados, tarefas ou decisões; a seleção inicial e os lotes voltam a ser escolhas explícitas.

Não rode todas as migrações depois desse reset: o schema já inclui os contratos atuais. A migração incremental `2026-10-05-event-editions-expiry.sql` é mantida para coerência do projeto e testes, mas o destino descartável usa a reinstalação completa. A geração não preserva um backup dos dados; isso foi dispensado por Cristian.

Depois da execução, conferir no SQL Editor:

```sql
select id, name from public.profiles order by sort_order;
select abbreviation from public.games order by abbreviation;
select count(*) from public.profile_games; -- 0, antes da seleção
select count(*) from public.profile_tasks; -- 0, antes da importação/seleção
select public.cleanup_expired_imported_events(); -- 0, numa instalação vazia
```

Abra a aplicação local conectada ao Supabase, escolha os jogos em CRAN/Demo/Convidado e só então valide as RPCs via PostgREST. Faça primeiro a consulta sem escrita e depois a sincronização:

```powershell
node scripts/syncEvents.js --dry-run
node scripts/syncEvents.js
node scripts/syncEvents.js
```

O segundo comando escreve no banco configurado; o terceiro deve conservar identidades, progresso e decisões. Novas edições WuWa/NTE sem base de horário conferida continuam em revisão. Confirme duas abas/conexões e as mesmas tarefas nos perfis selecionados. Login, convites, RLS autenticada e fallback chinês continuam fora desta etapa.

## Estado da validação

Em 05/10/2026, o SQL de reinstalação foi executado pelo painel aberto por Cristian no projeto **GachaManagement**, referência `zzcxhtblbmiakuvdakic`, conferida contra a configuração local. O banco começou com três perfis e cinco jogos, sem estado pessoal. A conferência posterior identificou que o importador antigo criava progresso no CRAN antes da seleção: o novo teste primeiro falhou (`5 != 0`), passou após inserir as definições compartilhadas sem proprietário, e a função corrigida foi aplicada no destino. Os registros antecipados sem seleção/decisão foram removidos.

Validação final:

- `npm test`: **334 testes passaram** (50 Jest + 284 Node).
- `npm run test:db`: **103 testes passaram**, incluídos no conjunto acima.
- `git diff --check`: passou. Schema e migração incremental têm o mesmo contrato final.
- Prévia real em navegador: CRAN com 5 edições seguintes, Demo com 10 tarefas e prazos manuais protegidos, Convidado com 10 tarefas e recorrência renovada. O teste DOM agora também importa o ponto de entrada real, para detectar exports ausentes no boot.
- PostgREST: leitura dos três perfis, catálogo com cinco jogos, listas pessoais vazias e relacionamentos `event_candidates`/`weekly_batch_items` responderam. Importação real pelas RPCs também funcionou.
- `node scripts/syncEvents.js --dry-run`: passou para os cinco jogos, sem escrita. Sincronização inicial: GI 8, HSR 14, ZZZ 9, WuWa 10, NTE 9. Total de **50 candidatos e 50 definições compartilhadas**. Repetições criaram zero registros novos; a última conferência SQL mostrou `3 / 5 / 50 / 50 / 0 / 0` para perfis/jogos/definições/candidatos/tarefas pessoais/seleções.

**Preparação do live antes da publicação:** durante a reinstalação, o workflow remoto ainda executava a versão 1.6.0. As 31 chaves dos eventos atuais GI/HSR/ZZZ foram mantidas no formato aceito por esse workflow, após conferir que não havia nomes repetidos. O código da parte 4 reutiliza essas chaves somente com associação segura pelo período; a próxima edição ganha outra identidade. A sincronização nova foi repetida após essa adaptação, sem criar candidatos/tarefas. O push desta entrega disponibiliza o sincronizador novo ao Actions sem alterar o horário diário às 07h30 de Brasília.

Pendente: validação de Cristian na aplicação local conectada ao live e teste de duas abas/conexões reais com gravações pessoais. Não foram feitos testes destrutivos de eventos artificiais no live; fronteiras, prazos manuais, aliases e falhas foram exercitados no PostgreSQL descartável. A autorização de commit/push em 06/10/2026 não significa que essas verificações manuais tenham sido realizadas.
