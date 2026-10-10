# Gacha Management: contexto para próximas sessões

Leia [docs/project-conventions.md](docs/project-conventions.md) antes de alterar integrações, testes ou banco. O pedido atual de Cristian prevalece sobre este contexto.

## Público, criticidade e tamanho das mudanças

- Gacha Management é um projeto pessoal para o uso de Cristian, sem objetivo empresarial, comercial ou de lucro. Cristian é o único usuário frequente; outras pessoas podem experimentar o sistema ocasionalmente.
- Expressões como “quando o usuário fizer X” são linguagem habitual de desenvolvimento. Não pressupor, a partir delas, uma base de clientes, requisitos empresariais, alta disponibilidade ou escala de múltiplos usuários simultâneos.
- Os dados têm baixa criticidade para Cristian. Reformulações do banco, recriação e perda de dados podem ser aceitáveis quando fazem parte do fluxo combinado. Não priorizar conversores, compatibilidade histórica extensa ou planos complexos de preservação apenas por hipótese de dados críticos.
- Ao escolher entre migração e reinstalação, considerar primeiro a solução mais simples para o estado real do projeto e o pedido atual. Explicar uma perda de dados relevante de forma breve quando a escolha depender dela; respeitar autorizações e restrições já dadas. Este contexto não autoriza por si só executar um reset ou modificar o Supabase.
- Em bugs e melhorias, preferir o menor ajuste coerente e preservar a estrutura padrão existente. Não adicionar framework, camadas, dependências ou reorganizações amplas sem uma necessidade concreta alinhada com Cristian.
- Manter as garantias necessárias ao comportamento combinado, como atuar no perfil selecionado, calcular calendários corretamente e não deixar uma operação pela metade. Propor proteções adicionais somente quando houver um risco concreto proporcional ao uso pessoal.

## Colaboração e convenções

- Perguntas sobre um problema, alternativas ou “qual seria a melhor forma?” pedem primeiro uma resposta e um diálogo. Não trate uma consulta como autorização para implementar a solução sugerida.
- Quando houver dúvidas pendentes que afetem o comportamento, a interface ou o escopo, responda às perguntas, explique os trade-offs e alinhe a decisão com Cristian antes de alterar o código. Leituras necessárias para fundamentar a resposta são permitidas; não implemente enquanto o fluxo ainda estiver em discussão. Depois do alinhamento e do pedido de implementação, prossiga sem pedir confirmação para cada detalhe rotineiro.
- Em pedidos mistos, respeite o escopo de cada autorização: autorizar o commit de uma entrega validada não autoriza implementar uma alternativa ainda em discussão para outro problema.
- Projeto pessoal em JavaScript/HTML/CSS, sem framework. Preserve contratos e estados já existentes.
- Use Game8 como referência para confirmar datas finais e horários do servidor América. Diferencie a edição atual de páginas antigas; não invente horário a partir de uma tabela que só informa datas.
- Preferência de Cristian: importações de API, lotes e qualquer outro carregamento devem ser automáticos, sem solicitar datas ou prazos na interface. Datas confirmadas por ele dentro do jogo são evidência válida: registrar uma referência absoluta e sua procedência uma vez, calcular os próximos ciclos e não pedir a mesma informação novamente. Se faltar uma regra, esclarecer durante o desenvolvimento; não transferir a configuração do calendário para cada importação/perfil. Edição manual de uma tarefa existente continua disponível.
- Os testes usam fixtures congeladas, relógio fixo, PostgreSQL descartável e DOM real com cliente simulado. `npm test` não consulta APIs nem o banco real.
- Preferência de Cristian: validação local em duas etapas. Etapa 1: testes focados nas alterações; etapa 2: suíte completa apenas em versões MAJOR/MINOR (por exemplo, 1.9.0) ou quando ele pedir explicitamente. Versões PATCH (por exemplo, 1.9.1) usam a etapa 1, sem exigir a etapa 2. Detalhes em [docs/project-conventions.md](docs/project-conventions.md).
- Antes do fechamento **Workflow**, incluir um parágrafo **Para testar** com passos práticos da interface e o resultado esperado. Cristian prefere instruções como recarregar a prévia, selecionar o jogo, executar a ação, salvar e conferir a persistência; adaptar ao ajuste entregue e não repetir testes que ele já validou como se estivessem pendentes.
- Antes de sincronizar uma integração nova, valide horários/identidade, teste schema e migrações e aplique a migração no destino. WuWa/NTE estão ativos; novas edições sem base de horário conferida ficam em revisão.
- Antes de commit/merge, leia o changelog e consulte Cristian sobre a versão, salvo autorização já dada para a mesma entrega. Mantenha manifests, README e versão exibida consistentes.
