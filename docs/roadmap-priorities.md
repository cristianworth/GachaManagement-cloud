# Roadmap — prioridades por tier

Atualizado em 06/10/2026 conforme o pedido de Cristian. Esta lista contém somente trabalho pendente; a ordem recomenda a próxima entrega e não autoriza implementar todos os itens. Detalhamento em [TODO.md](../TODO.md).

Saíram da tier list: sincronização diária às 07h30 de Brasília, criação inicial das weeklies, perfis CRAN/Demo/Convidado, seleção dos jogos por perfil, identidade por edição em GI/HSR/ZZZ e exclusão dos importados vencidos nos cinco jogos. Histórico em [CHANGELOG.md](../CHANGELOG.md); limites e verificações manuais restantes da etapa 4 em [event-editions-expiry.md](event-editions-expiry.md). A estimativa atual de resina e seu botão foram entregues em 1.8.0; cenários no TODO 1.

S = próxima entrega prioritária; A = alto retorno; B = depende de uma base anterior ou de necessidade concreta; C = acabamento ou melhoria a adiar. A ordem dentro de cada tier indica preferência. Complexidade é relativa ao projeto, sem estimativa de prazo.

| Tier | Ordem | Melhoria | Por que esta posição | Complexidade / dependências |
| --- | --- | --- | --- | --- |
| **S** | 1 | **Favorite tasks: estrela e favoritas no topo** | Permite dar atenção às atividades escolhidas, com resultado visível e escopo pequeno. Aproveita o estado separado por perfil já entregue. | Baixa/média. TODO 13; persistência por perfil, ordenação e ação acessível na lista. |
| **A** | 1 | Testes de navegador no CI e publicação condicionada aos testes | Os testes atuais protegem lógica, SQL e DOM. Poucos fluxos em navegador real podem proteger carregamento, filtros, botões, formulários e CSS renderizado. | Média. Conferir a configuração do Pages; complementar o CI existente. |
| **A** | 2 | Ajustes pontuais de interface no celular | Priorizar tabelas, áreas de toque, filtros e formulários nas telas usadas diariamente. Dividir em recortes pequenos. | Média por recorte. TODO 5. |
| **B** | 1 | Catálogo completo da API e variantes regionais | A seleção por perfil já existe. Falta ampliar os jogos disponíveis, com metadados e horários verificados para cada integração. | Alta. Parte restante do TODO 10; não repetir a implementação da seleção. |
| **B** | 2 | Alerta de resina alvo com contagem regressiva — entrega separada | Uma meta por jogo e perfil, previsão e estado de alvo atingido dentro do site. Só o levantamento foi feito; não integra o botão de estimativa. | Média. TODO 6; [plano inicial](resin-alerts-plan.md), após validar TODO 1. |
| **B** | 3 | Avisos de manutenção e próximos banners | Acrescenta informação útil, mas exige manutenção de datas. Começar com cadastro manual, distinguindo horários globais e do servidor. | Média. TODO 7 e 7.1. |
| **B** | 4 | Fallback entre calendários inglês e chinês | Pode ampliar a cobertura, mas o provedor não oferece ID por atividade. Exige associação confiável por edição entre idiomas; datas iguais ou posição na lista não bastam. | Alta. Parte restante do TODO 8; aproveitar a identidade já entregue. |
| **C** | 1 | Favicon e consistência dos ícones | Acabamento localizado depois das melhorias de uso. Manter texto acessível e clareza das ações. | Baixa/média. TODO 4. |
| **C** | 2 | Indicador de evento recém-adicionado | Ajuda a identificar novidades. Usar a primeira importação da edição, sem renovar o indicador a cada sincronização. | Baixa/média. TODO 11. |
| **C** | 3 | Paginação no Supabase | Adotar quando o volume ou a rolagem justificarem. Envolve consultas, contagem e navegação, além dos filtros atuais. | Média. TODO 12; respeitar a ordenação de favoritas quando implementada. |

## Próxima entrega: Favorite tasks

Recurso **planejado**, ainda sem implementação nesta atualização:

- Marcar/desmarcar uma atividade com uma estrela na lista de Tasks. A estrela preenchida identifica uma favorita; o botão deve comunicar a ação e o estado também para teclado e leitor de tela.
- Salvar a preferência por perfil. Favoritar no CRAN não altera Demo ou Convidado; recarregar e ocultar/reselecionar um jogo conservam a escolha.
- Ordenar primeiro as favoritas e depois as demais. Dentro de cada grupo, manter a ordenação por prazo e um desempate estável. Desfavoritar devolve a tarefa à posição normal.
- Respeitar os filtros e a visibilidade de tarefas concluídas. Uma favorita fora do filtro não deve aparecer só por estar marcada.
- Conservar a estrela em correções da mesma edição, sincronizações e resets de recorrência. Uma edição nova começa sem herdar a estrela da anterior; favoritar não muda conclusão, prazo ou recorrência.
- Validar persistência, isolamento dos perfis, ordenação, filtros e recuperação após falha de gravação. Detalhes no TODO 13.

## Limites e sequência

Perfis continuam públicos, sem autenticação ou convite; login e RLS por usuário exigem escopo próprio. Catálogo e capas são compartilhados, com progresso e decisões pessoais separados. As novas preferências devem seguir essa separação.

Cristian antecipou o recorte de resina em 06/10/2026. Sequência recomendada: **Favorite tasks**. O alerta de resina mantém entrega e autorização próprias, com o levantamento separado; testes de navegador podem acompanhar mudanças de interface. Ajustes no celular podem acompanhar cada recorte. Expansão do catálogo e fallback entre idiomas devem ter validação própria de horários e associação de edições. Paginação pode subir de prioridade se o volume crescer.

Preservar JavaScript/HTML/CSS sem framework e seguir [project-conventions.md](project-conventions.md).
