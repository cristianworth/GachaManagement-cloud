# Prioridades após sincronização diária e weeklies

Revisado com Cristian em 04/10/2026. Esta lista é uma recomendação de ordem, não autorização para implementar todos os itens. O detalhamento e os critérios existentes continuam em [TODO.md](../TODO.md).

**Fora desta tier list:** sincronização diária após os resets, publicada na versão 1.4.1, e criação inicial das weeklies, implementada na versão 1.5.0. A migração e a validação das weeklies no Supabase de destino permanecem etapas de implantação; roteiro em [weekly-batches.md](weekly-batches.md). O [handoff-daily-sync-weeklies.md](handoff-daily-sync-weeklies.md) conserva o contexto histórico. A ordem dos tiers abaixo permanece a recomendação revisada com Cristian em 04/10/2026.

S = próximo investimento prioritário após essa entrega; A = alto retorno; B = depende das bases anteriores ou de necessidade concreta; C = acabamento ou melhoria a adiar. A ordem dentro de cada tier também indica preferência. Complexidade é relativa ao projeto, não uma estimativa de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / dependências |
| --- | --- | --- | --- | --- |
| **S** | 1 | Três perfis fixos com seleção e progresso separados | Entregues em 1.6.0 e validados localmente por Cristian. Implantação no destino pendente; parte da seleção do tier B foi antecipada. | Média/alta. TODO 3; roteiro em [profiles-phases.md](profiles-phases.md). |
| **S** | 2 | Identidade por edição em GI/HSR/ZZZ e política de eventos vencidos | Completa a consistência já trabalhada em WuWa/NTE: corrigir a mesma edição preserva decisões; uma edição nova começa com estado próprio. Resolver identidade antes de generalizar limpeza. | Média/alta: migração e testes de reconciliação. TODO 8. |
| **A** | 1 | Resina estimada agora e botão para atualizar a estimativa | Melhora a consulta diária com dados já disponíveis; prepara alertas sem exigir outra integração. Uma atualização visual não deve sobrescrever o valor informado pelo usuário. | Média. TODO 1 e 1.1. |
| **A** | 2 | Testes de navegador no CI e publicação condicionada aos testes | Os testes atuais protegem lógica, SQL e DOM, mas não o CSS renderizado. Poucos fluxos em navegador real podem proteger carregamento, filtros, botões e formulários. Avaliar a configuração atual do Pages antes de definir o bloqueio da publicação. | Média. Complementa o CI existente; não substituir a suíte por testes lentos. |
| **A** | 3 | Ajustes pontuais de interface no celular | Priorizar tabelas, áreas de toque, filtros e formulários nas telas usadas diariamente. Evita uma reformulação visual ampla sem necessidade. | Média por recorte. TODO 5; carregamento e mensagens já melhorados em 1.4.1. |
| **B** | 1 | Catálogo e seleção dos jogos acompanhados por perfil | Reduz configuração manual e permite oferecer lotes de weeklies. Primeiro consolidar perfis e criação idempotente dos lotes. | Alta. TODO 10; depende de TODO 3 e 9. |
| **B** | 2 | Alerta de resina alvo com contagem regressiva | Reaproveita a estimativa de resina e entrega utilidade prática. Começar pelo alerta dentro do site. | Média. TODO 6; depende de TODO 1. |
| **B** | 3 | Avisos de manutenção e próximos banners | Acrescenta informação útil, mas demanda manutenção de datas. Começar com cadastro manual, distinguindo horários globais e do servidor. | Média. TODO 7 e 7.1. |
| **B** | 4 | Fallback entre calendários inglês e chinês | Pode ampliar cobertura, mas o provedor não oferece ID por atividade. Exige associação confiável por evento/edição; datas iguais ou posição na lista não bastam. | Alta. TODO 8; depende da estratégia de identidade. |
| **C** | 1 | Favicon e consistência dos ícones | Acabamento localizado depois das melhorias de uso. Manter texto acessível e clareza das ações. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Ajuda a identificar novidades, mas não resolve uma falha de funcionamento. Usar primeira importação, não `last_seen_at`. | Baixa/média. TODO 11. |
| **C** | 3 | Paginação no Supabase | Adotar quando volume ou rolagem justificarem. Os filtros existentes já reduzem a lista; paginação envolve consultas, contagem e navegação. | Média. TODO 12. |

## Decisões e limites

- Perfis fixos organizam dados; não são autenticação nem proteção de privacidade. Se privacidade se tornar requisito, planejar autenticação e RLS por usuário.
- Cristian confirmou que a mesma tarefa deve compartilhar a imagem entre perfis. O modelo e os contratos foram commitados em `5e718fc`; a interface foi validada localmente e integra a versão 1.6.0. A URL continua em `tasks.cover_url`, com progresso e decisões separados por perfil.
- Cristian escolheu exclusão permanente dos importados vencidos nos cinco jogos (GI/HSR/ZZZ/WuWa/NTE), preservando prazos pessoais futuros e recorrência. A parte 2 protege a limpeza antiga do HSR; a política completa e a identidade por edição de GI/HSR/ZZZ entram na parte 4.
- Não há evidência aqui de um defeito atual de identidade em GI/HSR/ZZZ. A prioridade é completar os contratos de edição e prevenir regressões, preservando vínculos e chaves existentes.
- Se o uso por uma segunda pessoa for adiado, resina estimada pode preceder os perfis como entrega menor. Se o volume crescer muito, paginação pode subir de tier.
- As mudanças desta lista devem preservar JavaScript/HTML/CSS sem framework e seguir [project-conventions.md](project-conventions.md).

## Sequência recomendada

Após concluir a entrega reservada: perfis separados → consistência das edições → resina estimada. Introduzir os testes de navegador junto de uma mudança de interface relevante; dividir o trabalho no celular em recortes pequenos. Não iniciar seleção de jogos e alertas antes das respectivas dependências.
