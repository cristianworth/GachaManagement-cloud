---
name: update-banners
description: Atualizar os JSONs de banners do Gacha Management para um jogo solicitado, pesquisando fontes e conferindo fases e horários da América. Use para atualizar o calendário publicado; não para importar eventos de Tasks.
---

# Atualizar banners

Use somente no Gacha Management. Receba o jogo por nome ou sigla: GI/Genshin, HSR/Star Rail, ZZZ, WuWa/Wuthering Waves ou NTE/Neverness to Everness. Se estiver claro no pedido, prossiga; se faltar o jogo, pergunte qual atualizar.

Leia o [contrato dos arquivos](../../../docs/banner-catalogue.md), o JSON atual em `js/data/banners/` e somente a referência do jogo:

- [GI](references/gi.md)
- [HSR](references/hsr.md)
- [ZZZ](references/zzz.md)
- [WuWa](references/wuwa.md)
- [NTE](references/nte.md)

Pesquise a fase vigente e as próximas fases já anunciadas. Prefira anúncios oficiais e confira datas finais/horários América no Game8 quando disponíveis. Verifique versão, edição e data da página: idioma inglês e data de publicação não definem servidor ou período do banner. Se a fonte só informa um dia, não invente a hora. Preserve a informação existente e relate o que falta confirmar quando houver conflito.

Atualize apenas o arquivo do jogo solicitado. Cada objeto representa uma versão/fase e reúne todos os personagens do mesmo período. Preserve o ID da mesma fase ao corrigir datas, nomes ou imagens; uma versão nova recebe IDs novos. Personagens que duram a versão inteira entram nas duas fases, com `whole_version: true`. Não crie uma fase ainda sem período confirmado nem deduza ciclos fixos de 20/40 dias. Mantenha as fases anteriores: Mostrar encerrados usa esse histórico.

Guarde instantes ISO com fuso explícito, fontes HTTPS e uma observação curta quando explicar a conversão ou uma limitação relevante. Reaproveite imagens originais quando disponíveis, sem criar montagens; uma imagem pode ficar ausente sem bloquear datas/personagens confirmados.

Execute na raiz do projeto `npm run validate:banners -- <sigla>`, usando a sigla canônica, e revise o diff para conferir que outros jogos permaneceram intactos. Para correções de uma fase existente, preserve a identidade; não apague e recrie o registro com outro ID. O validador confere estrutura e períodos, mas não confirma a veracidade da fonte.

Reporte versão/fases, personagens, períodos em Brasília, fontes e pendências. Arquivos só chegam aos usuários após a publicação do GitHub Pages. Esta skill altera os JSONs locais; commit/push seguem a autorização vigente. Não escreve no Supabase, altera preferências pessoais ou cria um serviço de coleta automática.
