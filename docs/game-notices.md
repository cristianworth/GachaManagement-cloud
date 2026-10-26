# Central de notificações e agenda dos jogos

Entrega 1.17.0 de 25/10/2026. Games conserva jogo, resina, estado diário e To-do; os avisos ficam no sino. A agenda é compartilhada, em uma tela própria. A central continua disponível nas outras telas após selecionar um perfil.

## Agenda e preferências

Na engrenagem **Configurações**, abra **Agenda dos jogos**. Adicionar, editar ou excluir altera a informação para todos os perfis. Cada registro tem jogo do catálogo compartilhado, tipo, título/personagens, versão opcional, início, término, fonte, imagem e observação opcional de horários. Filtros por jogo e tipo combinam-se com **Mostrar encerrados**. Datas digitadas/exibidas em Brasília (UTC−3) e persistidas em UTC, independentes do fuso do computador. Término deve ser posterior ao início.

No **Edit** do jogo, **Notificações deste perfil** contém somente dois checkboxes: manutenções/atualizações e próximos banners. Essas escolhas silenciam ou reativam os lembretes daquele perfil, sem editar o calendário. Gravações da agenda usam **Salvar para todos os perfis**; exclusão pede confirmação com o mesmo alcance. Falhas conservam os campos e a lista anterior. Atualizar a leitura da agenda preserva o formulário aberto.

## Marcos e leitura

| Situação | Central |
| --- | --- |
| Mais de 48h antes | Sem aviso ativo. |
| Entre 48h e 24h antes | Uma entrada não lida, no marco de 48h. |
| De 24h até o início | A mesma entrada passa ao marco de 24h e volta a ficar não lida. |
| Início da manutenção até retorno previsto | A mesma entrada muda para em andamento e volta a ficar não lida, com destaque âmbar. |
| Início do banner ou fim previsto da manutenção | A entrada sai dos avisos ativos; cadastro continua disponível na Agenda dos jogos. |

Ler o marco atual não faz o contador reaparecer a cada minuto ou recarga. Se o site só for aberto faltando três horas, aparece uma entrada no marco atual, sem acumular os lembretes anteriores. Alteração real em horário, retorno ou personagens torna a entrada atual não lida; salvar os mesmos dados mantém a leitura. Um novo acontecimento com novas datas tem uma nova assinatura.

O painel só abre ao clicar no sino. Abrir/fechar a central não marca tudo como lido. Clicar em uma mensagem expande os detalhes e salva a leitura daquele marco. **Marcar todas como lidas** agrupa as marcações por jogo; falha em um jogo mantém suas mensagens não lidas e preserva os sucessos dos outros, permitindo repetir somente o que falta. Falha de gravação nunca limpa o contador como se tivesse salvado.

Desktop usa painel lateral; celular usa painel inferior com rolagem própria. Fechar/Escape retorna o foco ao sino. As cores e a estrutura Sangonomiya são preservadas.

## Tempo, sincronização e limites

O relógio da central deriva os marcos a cada minuto visível e ao voltar à aba. Nenhuma notificação nasce de um contador de ticks nem escreve automaticamente no banco. Em Games, os dados vêm da leitura já existente, sem outra consulta periódica concorrente. Nas outras telas, a central consulta os jogos selecionados a cada seis minutos; abrir o painel pede uma leitura nova. Falha mantém a lista anterior e permite tentar novamente reabrindo a central.

Datas/conteúdo pertencem ao catálogo compartilhado. Preferências e leitura pertencem ao perfil e permanecem após ocultar/reselecionar um jogo. Só jogos selecionados entram na central; a agenda mostra o catálogo compartilhado inteiro. Migração e carga inicial de 16 registros dos cinco jogos aplicadas ao Supabase `GachaManagement` em 25/10/2026, sem reset. [Calendário formatado, fontes e limitações](game-agenda-calendar.md).

Fora do recorte: integração automática de fontes, notificações com site fechado e detecção real da disponibilidade dos servidores. Manutenção é uma previsão manual; eventual prorrogação precisa ser editada. Inícios depois da atualização usam o retorno previsto, com essa observação no registro. Dados inválidos na leitura são ignorados individualmente. Não preencher próximas manutenções por recorrência presumida.

## Persistência

Agenda compartilhada na tabela `game_agenda`, com RLS e acesso público intencional dos perfis fictícios. Contratos `list_game_agenda`, `game_agenda_catalogue`, `save_game_agenda` e `delete_game_agenda`, com `SECURITY INVOKER`. Schema novo e migração incremental `20261025223206_shared_game_agenda.sql` mantêm o mesmo contrato. `list_profile_games` inclui a agenda de cada jogo com seu recibo pessoal, sem consultas adicionais por jogo.

- `game_notice_preferences`: habilitação de cada tipo em `profile_games.overrides`.
- `agenda_notice_read_<id>`: assinatura do conteúdo e marco lido de cada registro, gravados parcialmente.
- Os antigos `game_notices` e recibos não alimentam a nova central. Não promover agendas pessoais automaticamente: podem conter testes fictícios.

Leitura não regrava agenda, resina, notas ou estado diário. Saves gerais omitem agenda e recibos. No Edit, preferências entram no save somente se mudaram. Corrigir título, versão ou período renova a leitura; mudar imagem, fonte ou observação não renova o marco. Excluir retira o aviso na próxima leitura. Recibos pequenos já salvos permanecem no perfil.

A gravação captura o perfil antes de aguardar a rede. Troca de perfil durante leitura/gravação não aplica respostas antigas à nova tela. Uma leitura iniciada antes de marcar uma mensagem não pode desfazer a confirmação local mais recente.

## Para testar

1. Abra `http://127.0.0.1:5510/agenda`, escolha CRAN e confira banners, fontes e horários. A prévia tem os 16 registros iniciais e uma manutenção adicional `[TESTE]` do Genshin, somente no banco descartável.
2. Abra uma mensagem: seu contador diminui e o detalhe permanece consultável. Recarregue: a leitura deve continuar salva. Abrir e fechar a central não lê as outras mensagens.
3. Na Agenda dos jogos, edite um registro e salve; troque para Demo para conferir o mesmo calendário. No Edit do Genshin, abra Notificações deste perfil, desative manutenções e salve: o aviso some apenas desse perfil, preservando a agenda.
4. Cadastre uma data entre 24h e 48h à frente para ver o marco 48h; use uma data a menos de 24h para ver o marco 24h. Uma manutenção abrangendo agora aparece em andamento. Banner iniciado ou manutenção passada sai da central.
5. Em Tasks, abra o mesmo sino. Troque para Demo para confirmar o isolamento. Teste também Marcar todas, Escape e o painel no celular.

A prévia usa banco descartável; os dados somem ao parar o processo. Para outra prévia, use `node scripts/previewProfiles.js --design --port=5510` numa porta livre. A carga real está separada em `db/seeds/game-agenda-2026-10-25.sql`; não é uma sincronização automática.

## Validação

Etapas intermediárias em 25/10: **64 testes focados aprovados** (agenda, central, estado diário, apresentação, feedback e build) e execução separada de **47 testes de banco/perfis/carga inicial** aprovada. Há sobreposição: não somar as contagens. Incluem instalação nova/upgrade, CRUD compartilhado como `anon`, recibos/preferências pessoais, falha/retry, campos preservados, seed idempotente e conversões concretas de América/UTC+8. A versão ainda era 1.16.0 nessa etapa anterior ao fechamento.

**Fechamento 1.17.0:** a suíte completa foi executada após o polimento e passou com **657 testes** (69 Jest + 588 Node). O teste Jest do formulário de imagens recebeu o contexto de perfil e os controles de notificação atuais, sem alterar as proteções do código real. Regressões do retry/feedback passaram em 32 testes focados. Conferidos os filtros combinados, a seleção contextual de jogos e a engrenagem no desktop e no celular de 360px; os dez banners carregaram suas imagens. Os números acima registram as etapas anteriores, não uma soma adicional ao total final.

No polimento, Games/Tasks passaram a ser os dois acessos principais. Configurações reúne Eventos e Agenda no rodapé da lateral; no celular, a engrenagem fica no cabeçalho. Selecionar jogos existe apenas em Games. A atualização de resina e a leitura silenciosa continuam automáticas, sem botão Atualizar dados; Tentar novamente continua disponível em caso de erro. [Artes dos banners](game-agenda-images.md).

Captura final de desktop e logs locais do polimento em `.local-deliveries/agenda-polish/`; prévia em `http://127.0.0.1:5510/`. O fechamento solicitado foi somente local, sem push ou publicação do site.

Após o ajuste final dos detalhes de contagem regressiva e a inclusão dos cenários de cancelar/falhar/repetir exclusão compartilhada, os **23 testes** de agenda/avisos foram repetidos e passaram. `git diff --check` e links locais da documentação conferidos.

Histórico de 23/10: o editor anterior teve 33 testes focados aprovados e correção das regras que esticavam checkboxes como campos de texto. A correção permanece no formulário de preferências.

Navegador em 25/10: agenda compartilhada, gravação de registro fictício, contador/expansão, leitura no CRAN e mesmo aviso ainda não lido no Demo. Desktop 1280px e celular 390px por emulação, sem overflow horizontal observado; campos móveis de 16px. Sem aparelho físico. Evidências em `.local-deliveries/shared-agenda/`. Verificação de segurança do destino antes/depois sem achados novos; os dois avisos informativos de tabelas antigas `*_duplicate` já existiam.

PostgREST real também conferido com o acesso público configurado: `list_game_agenda` e `list_profile_games('cran')` responderam HTTP 200, com 16 registros compartilhados nos cinco jogos. Essa verificação foi somente leitura; testes automatizados continuam usando banco descartável e fontes congeladas.
