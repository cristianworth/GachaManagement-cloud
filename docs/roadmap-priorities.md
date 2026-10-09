# Roadmap — prioridades por tier

Atualizado em 08/10/2026 conforme o pedido de Cristian. Esta lista contém somente trabalho pendente; a ordem recomenda a próxima entrega e não autoriza implementar todos os itens. Detalhamento em [TODO.md](../TODO.md).

Saíram da tier list: sincronização diária às 07h30 de Brasília, criação inicial das weeklies, perfis CRAN/Demo/Convidado, seleção dos jogos por perfil, identidade por edição em GI/HSR/ZZZ e exclusão dos importados vencidos nos cinco jogos. Histórico em [CHANGELOG.md](../CHANGELOG.md); limites e verificações manuais restantes da etapa 4 em [event-editions-expiry.md](event-editions-expiry.md). A estimativa atual de resina e seu botão foram entregues em 1.8.0; cenários no TODO 1. Favorite tasks foi entregue em 1.9.0; a migração no Supabase live continua pendente, conforme [favorite-tasks.md](favorite-tasks.md).

S = próxima entrega prioritária; A = alto retorno; B = depende de uma base anterior ou de necessidade concreta; C = acabamento ou melhoria a adiar. A ordem dentro de cada tier indica preferência. Complexidade é relativa ao projeto, sem estimativa de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / dependências |
| --- | --- | --- | --- | --- |
| **S** | 1 | Validar manutenção explícita do Lote | Seleção e oito endgames fechados na 1.11.0 (868408a); ajuste posterior implementa recriação do zero por seleção só no perfil atual, sem ações adicionais por item, e catálogo de 16 definições/capas com Weekly Boss GI/NTE. Fechamento 1.12.0 autorizado. Aguardar teste/revisão de Cristian. [Recorte](task-batch-maintenance.md). | Média. Contrato por definição deve distinguir adiamento de exclusão; [handoff](handoff-task-batch-personalization.md). |
| **A** | 1 | Testes de navegador no CI e publicação condicionada aos testes | Os testes atuais protegem lógica, SQL e DOM. Poucos fluxos em navegador real podem proteger carregamento, filtros, botões, formulários e CSS renderizado. | Média. Conferir a configuração do Pages; complementar o CI existente. |
| **A** | 2 | Ajustes pontuais de interface no celular | Priorizar tabelas, áreas de toque, filtros e formulários nas telas usadas diariamente. Dividir em recortes pequenos. | Média por recorte. TODO 5. |
| **B** | 1 | Catálogo completo da API e variantes regionais | A seleção por perfil já existe. Falta ampliar os jogos disponíveis, com metadados e horários verificados para cada integração. | Alta. Parte restante do TODO 10; não repetir a implementação da seleção. |
| **B** | 2 | Alerta de resina alvo com contagem regressiva — entrega separada | Uma meta por jogo e perfil, previsão e estado de alvo atingido dentro do site. Só o levantamento foi feito; não integra o botão de estimativa. | Média. TODO 6; [plano inicial](resin-alerts-plan.md), após validar TODO 1. |
| **B** | 3 | Avisos de manutenção e próximos banners | Acrescenta informação útil, mas exige manutenção de datas. Começar com cadastro manual, distinguindo horários globais e do servidor. | Média. TODO 7 e 7.1. |
| **B** | 4 | Fallback entre calendários inglês e chinês | Pode ampliar a cobertura, mas o provedor não oferece ID por atividade. Exige associação confiável por edição entre idiomas; datas iguais ou posição na lista não bastam. | Alta. Parte restante do TODO 8; aproveitar a identidade já entregue. |
| **B** | 5 | Automatizar calendário das próximas fases de Endstate Matrix | A fase 3.7 já está no lote. Próximas fases precisam de fonte regional/global verificada e reconciliação com decisões anteriores, sem pedir datas ao usuário. | Média/alta. Metadados de versão sem offset não bastam; [limites atuais](expanded-task-batch.md). |
| **C** | 1 | Favicon e consistência dos ícones | Acabamento localizado depois das melhorias de uso. Manter texto acessível e clareza das ações. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Ajuda a identificar novidades. Usar a primeira importação da edição, sem renovar o indicador a cada sincronização. | Baixa/média. TODO 11. |
| **C** | 3 | Paginação no Supabase | Adotar quando o volume ou a rolagem justificarem. Envolve consultas, contagem e navegação, além dos filtros atuais. | Média. TODO 12; respeitar a ordenação de favoritas quando implementada. |

## Limites e sequência

Os itens 1 e 2 (Lote único com 14 definições, incluindo os cinco novos modos) estão implementados e testados localmente. A unificação foi validada por Cristian; a expansão aguarda conferência visual e publicação. Saiu da lista de implementação pendente. O item 3 e as imagens estão em revisão local desde 09/10 ([recorte](task-batch-personalization.md)); segue futura a automação das próximas fases Endstate; a fase atual tem prazo aceito por Cristian, sem repetição inventada. Fechamento 1.10.0 autorizado com commit/push em 08/10/2026; migrações live pendentes. O [handoff](handoff-task-batch-personalization.md) orienta o modal e as imagens dos endgames. Inventário completo e limitações em [task-batch-plan.md](task-batch-plan.md).

Perfis continuam públicos, sem autenticação ou convite; login e RLS por usuário exigem escopo próprio. Catálogo e capas são compartilhados, com progresso e decisões pessoais separados. As novas preferências devem seguir essa separação.

Cristian antecipou o recorte de resina em 06/10/2026. Favorite tasks foi entregue em 1.9.0 e o botão único **Atualizar dados** em Games em 1.9.1. O alerta de resina mantém entrega e autorização próprias, com o levantamento separado; testes de navegador podem acompanhar mudanças de interface. Ajustes no celular podem acompanhar cada recorte. Expansão do catálogo e fallback entre idiomas devem ter validação própria de horários e associação de edições. Paginação pode subir de prioridade se o volume crescer.

Preservar JavaScript/HTML/CSS sem framework e seguir [project-conventions.md](project-conventions.md).
