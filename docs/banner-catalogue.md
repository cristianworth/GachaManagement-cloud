# Banners publicados em JSON

Decisão de Cristian em 27/10/2026: arquivos por jogo no repositório são a fonte única do calendário. A skill atualiza os arquivos; commit/push e publicação do GitHub Pages distribuem os dados. A Agenda é somente consulta. Preferências e recibos continuam no banco por perfil.

## Arquivos e formato

`js/data/banners/gi.json`, `hsr.json`, `zzz.json`, `wuwa.json` e `nte.json` contêm listas de fases. Cada objeto tem:

| Campo | Contrato |
| --- | --- |
| `id` | `<sigla minúscula>-<versão>-phase-1` ou `phase-2`; estável para a mesma fase. |
| `version`, `phase` | Versão textual e fase numérica 1 ou 2. |
| `starts_at`, `ends_at` | ISO completo com `Z` ou offset explícito; término posterior ao início. |
| `characters` | Lista com `name`, `image_url` opcional e `whole_version` opcional. |
| `sources` | Uma ou mais fontes HTTPS que sustentam a informação. |
| `timing_note` | Observação opcional sobre conversão/limitação confirmada. |

Um objeto reúne todos os personagens da fase. Personagens que duram a versão inteira, como Pearl em 4.6, entram nas duas listas com `whole_version: true`; não há uma terceira fase. Fases desconhecidas não recebem datas presumidas. O catálogo inicial preserva os períodos e imagens revisados em 25/10; a primeira fase de HSR registra explicitamente o limite até o início da segunda fase. Esta mudança de fonte não fez uma pesquisa nova das próximas versões.

## Atualizar e publicar

Use `$update-banners GI` (ou nome/sigla do jogo). A [skill](../.agents/skills/update-banners/SKILL.md) contém o fluxo comum e referências por jogo. Atualize a mesma fase no mesmo ID; mantenha fases encerradas para consulta e acrescente as novas fases confirmadas.

Execute `npm run validate:banners` para todos ou `npm run validate:banners -- GI` para um jogo. O mesmo validador roda no CI. Ele confere IDs, duplicação, personagens, links e períodos com fuso, incluindo datas impossíveis e sobreposição das duas fases. Não consulta fontes externas nem comprova a informação editorial.

Publicar requer commit/push e conclusão do GitHub Pages. Só editar o JSON local não altera o site publicado. O loader compartilha a regra de base path do roteador para respeitar o caminho do repositório no Pages, usa `cache: no-store` na rede e cache em memória de até seis minutos. Recarregar a página ou Atualizar agenda/abrir a central força uma nova leitura conforme a ação. Arquivos são carregados em conjunto; falha de rede ou validação não substitui o catálogo anterior por um catálogo parcial.

## Notificações e banco

Marcos de 48h e 24h antes do término de uma fase já iniciada. Um aviso por fase, desaparecendo no término. Preferência `game_notice_preferences.banner` continua por perfil. Recibo `banner_phase_read_<id>` contém assinatura e marco e usa a atualização parcial já existente de `save_profile_game`. `list_profile_games` já retorna os overrides, sem migração nova.

Editar apenas imagem/fonte/observação mantém leitura; corrigir personagens ou período renova o aviso. IDs não mudam nessas correções. Os recibos numéricos da agenda SQL antiga permanecem sem uso: o novo catálogo inicia a leitura pelas identidades das fases. Não são reaproveitados por nome ou por uma correspondência incerta.

As tabelas/RPCs antigas da agenda continuam instaladas, mas o aplicativo não as usa para ler ou editar calendários. Não houve exclusão ou escrita no banco real neste recorte. Games conserva seu fluxo de stamina mesmo se os arquivos falharem; a central apresenta a falha e mantém os avisos anteriores. Tasks e sua importação de eventos não mudam.

## Validação da implementação

Em 27/10: **100 testes Node e 16 testes Jest focados aprovados**, com conferência adicional após o ajuste do caminho compartilhado com o roteador. Cobertura de arquivos reais, cache e falha sem catálogo parcial, fusos/datas impossíveis, fases/IDs, notificações por perfil, recibos SQL em instalação nova/upgrade, rascunhos e Save. Validador dos cinco jogos aprovado; metadados YAML e referências da skill conferidos com o parser disponível no projeto. O validador Python da skill não executou por ausência de PyYAML no runtime; não foi adicionada dependência à aplicação.

Prévia com banco descartável conferida em desktop e celular de 360px: cinco fases ativas carregadas dos arquivos, imagens originais disponíveis, Pearl nas duas fases e sem overflow horizontal observado. Caminho com subdiretório do GitHub Pages coberto por teste do loader. Sem aparelho físico.

Fechamento **1.18.0**, em 27/10: suíte completa executada após a etapa focada, com **670 testes aprovados (69 Jest + 601 Node)**. Versões e documentação alinhadas; publicação acompanhada separadamente do resultado local.
