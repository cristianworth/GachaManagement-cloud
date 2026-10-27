# Central de notificações e agenda dos jogos

Entrega 1.18.0 de 27/10/2026 sobre a base 1.17.0. Games conserva jogo, resina, estado diário e To-do; avisos ficam no sino, também disponível nas outras telas após selecionar um perfil.

## Agenda publicada

**Configurações → Agenda dos jogos** mostra as fases dos banners do servidor América, com personagens, imagens originais, fontes e datas em Brasília (UTC−3). Filtro por jogo e Mostrar encerrados. A tela é somente consulta: não há cadastro, edição ou exclusão. Manutenção não participa do calendário nem dos avisos.

A fonte única são os cinco JSONs em js/data/banners/. Cada objeto representa uma versão/fase e reúne seus personagens. Pearl aparece nas duas fases de HSR 4.6 com o selo Versão inteira. O catálogo preserva os períodos revisados em 25/10; fases futuras sem período confirmado não são inventadas. [Formato, IDs, atualização e publicação](banner-catalogue.md).

Use a skill local [update-banners](../.agents/skills/update-banners/SKILL.md) com o jogo para pesquisar e atualizar os arquivos. Os dados chegam ao site após commit/push e publicação do GitHub Pages; a skill não escreve no banco. A antiga agenda SQL permanece instalada, mas não é consumida pela aplicação. Histórico da carga anterior e suas fontes em [game-agenda-calendar.md](game-agenda-calendar.md).

## Preferências e marcos

No Edit do jogo, **Notificações deste perfil → Fases de banners terminando** controla somente os lembretes daquele perfil. Somente jogos selecionados entram na central; a Agenda permite consultar todos os jogos dos arquivos.

| Situação | Central |
| --- | --- |
| Fase futura ou mais de 48h para terminar | Sem aviso ativo. |
| Entre 48h e 24h para terminar | Um aviso por fase no marco de 48h. |
| De 24h até o término | O mesmo aviso avança para 24h e volta a ficar não lido. |
| Término da fase | Sai dos avisos ativos; continua em Mostrar encerrados na Agenda. |

Ler o marco atual não faz o contador reaparecer a cada minuto ou recarga. Abrir a central não marca tudo como lido. Clicar numa mensagem expande os detalhes e salva sua leitura. Marcar todas como lidas reúne os recibos por jogo: falha em um jogo conserva suas mensagens não lidas e preserva os sucessos dos outros.

Uma fase tem um ID estável como gi-7.1-phase-2. O recibo pessoal contém assinatura e marco. Corrigir personagens ou datas renova o aviso; imagem, fonte e observação não renovam. Recibos numéricos da agenda SQL anterior não são associados por aproximação às novas fases; ficam sem uso. As leituras das novas fases permanecem por perfil e entre dispositivos.

Desktop usa painel lateral; celular usa painel inferior com rolagem própria. Fechar/Escape retorna o foco ao sino. Tema e estrutura existentes preservados.

## Leitura e persistência

O relógio recalcula os marcos a cada minuto visível e ao voltar à aba, sem gravar dados pelo timer. Games fornece seus jogos/perfis pela leitura já existente. Nas outras telas, a central usa o intervalo de seis minutos; abrir a central pede nova leitura.

Os JSONs compartilham a regra de base path do roteador, compatível com subdiretório no GitHub Pages, com requisições sem cache HTTP e cache em memória de até seis minutos. Recarregar a página ou clicar Atualizar agenda força uma leitura publicada. Falha de rede/JSON inválido conserva o catálogo anterior e mostra como tentar novamente; nenhum catálogo parcial substitui o anterior. A leitura de stamina em Games continua independente de uma falha dos arquivos.

Preferências e recibos continuam em overrides pessoais, pela RPC parcial existente save_profile_game. list_profile_games já retorna esses campos. A união entre arquivos e recibos é feita pela sigla e pelo ID da fase. Nenhum schema, migração ou dado real do Supabase foi alterado neste recorte.

Trocar de perfil durante uma leitura/gravação não aplica respostas antigas à nova tela. A leitura iniciada antes de marcar uma mensagem não desfaz a confirmação local mais recente. Tasks e suas importações continuam independentes.

## Para testar

1. Abra http://127.0.0.1:5510/agenda, selecione GI e confira um bloco da segunda fase com Skirk e Escoffier. Não deve haver botões de editar/excluir nem formulário.
2. Selecione HSR e marque Mostrar encerrados: Pearl aparece na primeira e segunda fase. As imagens permanecem separadas, sem montagem.
3. Em Games, abra Edit de um jogo e confira a preferência única de aviso de término. Trocar de perfil conserva essa preferência individualmente e o calendário continua igual.
4. Os testes usam arquivos congelados e relógio fixo para conferir 48h/24h/término, leitura, falhas, troca de perfil e retorno à aba. Nenhuma API externa ou banco real é consultado.

Validação de dados: npm run validate:banners, também no CI. O validador confere o formato; a skill precisa conferir as fontes. Fora do recorte: coleta automática de fontes e notificações com site fechado.
