# Agenda compartilhada e fontes oficiais: levantamento

Análise de 24/10/2026 a pedido de Cristian. **Atualização de 25/10:** a agenda compartilhada manual foi autorizada e implementada, com migração e carga inicial aplicadas ao destino; contrato em [game-notices.md](game-notices.md). A pesquisa abaixo fundamenta uma integração futura, que continua fora desta entrega. [Texto da issue sobre o processo do paimon.moe](paimon-timeline-issue.md).

## Necessidade

Manutenção, versão e personagens anunciados são informações do jogo, compartilhadas entre os perfis. Preferências de receber lembretes e leitura das notificações são pessoais. Cristian aceita manter as datas manualmente e quer editar uma vez para todos, em um lugar separado. Os perfis não representam autenticação e não haverá um administrador fictício nesta proposta.

## O que o paimon.moe demonstra

A [timeline pública](https://github.com/MadeBaruna/paimon-moe/blob/main/src/routes/timeline/index.svelte) importa `eventsData` de um [arquivo de dados versionado](https://github.com/MadeBaruna/paimon-moe/blob/main/src/data/timeline.js), com nomes, datas e links para anúncios. O [detalhe do evento](https://github.com/MadeBaruna/paimon-moe/blob/main/src/routes/timeline/_detail.svelte) usa esse link como destino. Portanto, clicar e chegar à HoYoLAB não demonstra importação automática dos posts. A investigação não determinou todo o processo usado pelos mantenedores para preparar esse arquivo.

A timeline também considera o servidor ao converter horários. Essa separação deve ser preservada: idioma inglês não é uma garantia de horário América.

## Interfaces oficiais encontradas

O código do cliente comunitário [genshin.py](https://github.com/thesadru/genshin.py/blob/master/genshin/client/components/hoyolab.py) identifica interfaces de anúncios para Genshin Impact, Honkai: Star Rail e Zenless Zone Zero. As [rotas usadas pelo cliente](https://github.com/thesadru/genshin.py/blob/master/genshin/client/routes.py) apontam para domínios da HoYoverse. A biblioteca é uma referência de implementação não oficial; não foi instalada nem adicionada ao projeto.

| Jogo | Origem dos anúncios | Região consultada |
| --- | --- | --- |
| GI | `sg-hk4e-api.hoyoverse.com/common/hk4e_global/` | `os_usa` |
| HSR | `sg-hkrpg-api.hoyoverse.com/common/hkrpg_global/` | `prod_official_usa` |
| ZZZ | `sg-announcement-static.hoyoverse.com/common/nap_global/` | `prod_gf_us` |

Foram consultados `announcement/api/getAnnList` e `announcement/api/getAnnContent` nos três jogos, com região América e idioma `en-us`. As seis leituras responderam HTTP 200 e `retcode: 0`, sem login, cookies ou identificadores pessoais. Os conteúdos incluíram anúncios de atualização nos três jogos e anúncios de banners de GI com personagens identificados no texto/título. Não foi comprovada a cobertura completa de próximos banners de HSR/ZZZ ou a disponibilidade de uma edição ainda não anunciada.

Isso confirma acesso a conteúdo oficial nesta data, **não um contrato público documentado e estável para integrações de terceiros**. Também não confirma, por si só, que todos os horários retornados já estejam normalizados para a América.

### Limites para a automação

- Os artigos retornam HTML com informações no corpo, inclusive horários globais e locais. Datas de publicação/validade de um anúncio não devem ser tratadas como início/fim do evento.
- O campo chamado `banner` pode ser uma imagem de apresentação do anúncio, não uma lista estruturada de personagens de um banner de invocação.
- É preciso extrair e conferir edição, versão, personagens, início, término e fuso. Não usar uma recorrência fixa de 20/40 dias: o calendário pode ter exceções.
- O conteúdo pode mudar de formato. Datas ausentes, conflitantes ou ambíguas devem permanecer em revisão, sem inventar horários nem substituir uma correção manual validada.
- O acesso foi testado fora do navegador. CORS, estabilidade do serviço e uma normalização completa não foram validados. Uma importação futura pode aproveitar o fluxo de sincronização existente, sem consultar os anúncios a cada abertura da tela.
- HoYoLAB/HoYoverse cobre os três jogos dessa editora; WuWa e NTE precisam de fontes próprias. Substituir todo o calendário agregado atual exige conferir cobertura e preservar identidade das edições, favoritas, conclusões e exclusões.

## Recomendação de evolução

1. **Agenda compartilhada manual.** Uma tela própria, como “Agenda dos jogos”, com indicação clara de que as alterações valem para todos os perfis. Guardar jogo/região, versão quando conhecida, manutenção, banner/personagens, referência da informação e momento da revisão. Uma gravação publica os dados compartilhados; os perfis conservam somente suas preferências e leituras. O cadastro global fica separado da edição pessoal de resina e anotações. A forma de migrar a agenda local existente precisa ser alinhada antes dessa implementação.
2. **Piloto de fonte oficial em GI.** Produzir candidatos a partir dos anúncios, usando exemplos congelados e horários conferidos. Inicialmente, revisar antes de publicar na agenda compartilhada. Esse piloto avalia banners e manutenção; não substitui automaticamente a importação atual de Tasks.
3. **Ampliar depois da conferência.** HSR/ZZZ reutilizam o destino compartilhado, com tratamento específico de seus artigos. Publicação automática pode ser liberada para casos sem ambiguidade; correções manuais precisam ser preservadas. A troca da fonte de todos os eventos é outro recorte, condicionado à cobertura observada.

Essas etapas combinam as duas ideias de Cristian: manutenção manual simples para o uso atual e uma base que a fonte oficial poderá alimentar depois, sem repetir o cadastro em cada perfil. A etapa 1 foi autorizada e implementada em 25/10; agendas pessoais antigas não foram promovidas automaticamente, e uma carga revisada foi cadastrada. Etapas 2 e 3 continuam como propostas futuras, sem integração automática nesta entrega.
