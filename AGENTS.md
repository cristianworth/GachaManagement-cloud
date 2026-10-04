# Gacha Management: contexto para próximas sessões

Leia [docs/project-conventions.md](docs/project-conventions.md) antes de alterar integrações, testes ou banco. O pedido atual de Cristian prevalece sobre este contexto.

- Projeto pessoal em JavaScript/HTML/CSS, sem framework. Preserve contratos e estados já existentes.
- Use Game8 como referência para confirmar datas finais e horários do servidor América. Diferencie a edição atual de páginas antigas; não invente horário a partir de uma tabela que só informa datas.
- Os testes usam fixtures congeladas, relógio fixo, PostgreSQL descartável e DOM real com cliente simulado. `npm test` não consulta APIs nem o banco real.
- Antes de sincronizar uma integração nova, valide horários/identidade, teste schema e migrações e aplique a migração no destino. WuWa/NTE estão ativos; novas edições sem base de horário conferida ficam em revisão.
- Antes de commit/merge, leia o changelog e consulte Cristian sobre a versão, salvo autorização já dada para a mesma entrega. Mantenha manifests, README e versão exibida consistentes.
