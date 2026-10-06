# Alertas de resina — levantamento inicial

Pedido de Cristian em 06/10/2026: implementar primeiro a estimativa atual e seu botão de atualização visual; **somente planejar os alertas**. Este documento não autoriza implementar ou publicar o alerta. Item independente B-2 do [roadmap](roadmap-priorities.md), detalhado no TODO 6.

## Base disponível

- Games já usa dados pessoais dos jogos selecionados via `list_profile_games`; `save_profile_game` salva a resina e a previsão de quando ficará cheia. A configuração pode variar por perfil.
- `dateMaxStamina` é o instante previsto para atingir `capStamina`. Apesar do nome legado, `staminaPerMinute` guarda **minutos por unidade**, pois o cálculo atual multiplica a quantidade restante por esse valor.
- `estimateCurrentStamina(game, now)` calcula unidades inteiras entre zero e o limite. `maxStaminaAt` vazio identifica um jogo sem previsão salva, mesmo quando o banco fornece uma data padrão. O botão atual usa os dados carregados e não grava nem busca novamente.
- `profile_games.overrides` já guarda propriedades pessoais em JSON. Uma meta simples pode aproveitar essa estrutura sem criar uma tabela apenas para um número.

## Proposta para uma próxima entrega

1. **Uma meta por jogo e perfil.** Na linha do jogo, oferecer definir/remover a quantidade alvo. Aceitar somente inteiro positivo até o limite configurado e exigir uma previsão válida. Remover a meta desativa o alerta sem alterar a resina.
2. **Persistência pequena e explícita.** Recomendo uma chave `stamina_alert_target` em `profile_games.overrides`, acessada por uma RPC dedicada que valide perfil, seleção e limite do jogo. `list_profile_games` já combina os overrides na leitura; o mapper deverá expor a meta. A nova RPC terá schema e migração incremental, sem escrever na definição compartilhada.
3. **Previsão da meta.** Calcular `targetAt = fullAt - (cap - target) × minutesPerUnit × 60.000`. Exemplo: limite 240, seis minutos por unidade e previsão de lotar às 18h; a meta de 180 será atingida às 12h. Usar instantes absolutos no cálculo e o fuso do navegador apenas na apresentação.
4. **Contagem dentro do site.** Exibir horário previsto e tempo restante. Usar um único timer para a tela Games; recalcular pelo relógio atual, sem depender de contar ticks. Ao atingir a meta, mostrar **Alvo atingido**, sem contagem negativa. Não sobrescrever a resina registrada.
5. **Acompanhar mudanças.** Salvar outra resina recalcula a previsão da mesma meta. Recarregar conserva a meta; retornar à aba recalcula o tempo. Sair de Games libera o timer. Ocultar jogo conserva a configuração, mas não exibe seu alerta; trocar perfil carrega suas próprias metas.
6. **Configuração inválida.** Se o limite for reduzido abaixo da meta, a taxa ficar inválida ou faltar previsão, suspender a contagem e pedir revisão da configuração. Não inventar horário ou apagar a meta silenciosamente.

O MVP mostra o estado no próprio site enquanto ele está aberto. Notificações com o site fechado, push, som, vários alertas por jogo e integração com a conta do jogo exigem outra decisão de escopo. Este levantamento não cria timers, notificações, RPCs ou campos de alerta.

## Validação planejada

- Relógio fixo: alvo abaixo/igual/acima da estimativa, igualdade exata no instante da meta, limite máximo, minutos fracionários e mudança de dia/fuso.
- SQL em banco descartável: isolamento CRAN/Demo/Convidado, perfil/jogo inválido, meta fora do limite e persistência após ocultar/reselecionar.
- DOM real: configurar/remover, salvar nova resina, retornar à tela, evitar timers duplicados e preservar campos ainda não salvos.
- Falhas: gravação rejeitada mantém a configuração anterior; jogo sem previsão não exibe uma contagem falsa.

**Complexidade: média.** A estimativa resolve a conta; o alerta acrescenta configuração persistida, ciclo de vida do timer e feedback visual. Recomendo uma entrega própria após Cristian validar a estimativa atual.
