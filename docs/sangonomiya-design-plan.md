# Sangonomiya design: staged delivery

## Confirmed scope

Cristian selected Sangonomiya from the visual comparison on 2026-10-10 and authorized changes to layout and colors using `frontend-design`. He subsequently approved applying the design to the real application, in `codex/anime-design`, with staged delivery. Preserve all existing functions and separate pages. Desktop is the priority; mobile must remain usable. No framework, live database changes, commit, merge, deployment or version bump is included.

Cristian confirmed a new Sangonomiya-inspired background matching the generated comparison. The new illustration is `design-preview/sangonomiya.png`; it is not Yagaminoue's fanart.

## Design plan

- Color: deep water text `#243B57`, lagoon action `#407A9E`, sky wash `#DCECF6`, mist paper `#F4F7FC`, coral accent `#D89EBE`, lavender line `#D7D4EA`. These are starting tokens to verify against the selected background, not fixed values.
- Type: retain Georgia for the brand and compact headings, and Trebuchet MS/Segoe UI for editable controls and data. Keep numbers readable and avoid an incidental font dependency.
- Layout: left-aligned daily workspace with compact navigation, profile controls above the page, and a restrained width that leaves scenery visible on wider desktops. Keep Games and Tasks separate. Group each game's identity and forecast, notes, and save/edit actions without dropping controls or their DOM contracts.
- Identity: water, coral and mist from Sangonomiya carry the atmosphere. Keep surfaces quiet and readable; translucent navigation may reveal the scene, while forms and lists need stronger opacity. Avoid adding ornamental dashboards, slogans, or animated petals.

```text
navigation | profile controls                         | scenery
           | page heading + existing actions         |
           | game + forecast | notes | save / edit    |
           | remaining rows                          |
```

Review: the previous generic sky-and-flowers direction is superseded by Sangonomiya. Move primary accents from purple to lagoon blue, reserve coral for sparse accents, and expose more scenery through workspace framing rather than making every data surface transparent. Validate density so scenery does not require excessive scrolling.

## Delivery stages

All stages are easy or medium complexity. Reuse the approved visual foundation and earlier preview refinements; later stages finish and validate each flow rather than rebuilding it.

| Stage | Complexity | Work and reviewable result | Delegation |
| --- | --- | --- | --- |
| 1. Real application foundation | Medium | Load local background/theme and app shell through the real entry point; preserve routes, profiles, controls and repository link. Make the isolated test build reuse these files. Screenshot and focused contract tests. | Root implements; agent 1 independently reviews migration and hosting/profile contracts. |
| 2. Games | Medium | Finish density, notes, stamina/Save, forecasts and actions; validate draft preservation and reload. Games screenshot and focused checks. | Agent 1 may own the Games styles/markup for this stage; root integrates and inspects the UI. Agent 2 can audit save/draft coverage without editing theme files. |
| 3. Tasks | Medium | Finish filters, favorites, completion, dates and row actions; verify empty results and contained scrolling. Tasks screenshot and interaction evidence. | One implementation agent owns Tasks styles for this stage; another independently reviews filters and state coverage. |
| 4. Profiles | Easy | Review entry, switching and game selection; preserve hidden navigation and per-profile behavior. Screenshots of entry/selection. | Agent 1 can implement profile styles while root reviews profile contracts; no simultaneous edits to shared theme. |
| 5. Game form | Easy | Refine grouping, labels, validation and feedback, including icon/color inputs. Create/edit screenshot and check. | Agent 1 can handle the bounded form; agent 2 reviews labels/focus after completion. |
| 6. Task form | Medium | Refine date toggles, preset/custom intervals and save feedback. Screenshots for relevant form states. | Implementation agent owns the form section; review agent checks hidden/disabled fields and date/recurrence contracts. |
| 7. Events | Medium | Refine game selection, candidate content and approve/ignore/manual deadline states. Review screenshot and checks. | Implementation agent works on event presentation; review agent audits preserved public contracts and available controls. |
| 8. Dialogs | Medium | Finish batch picker and nested confirmations; ensure scrolling, cancellation and focus remain usable. Dialog gallery and interaction checks. | One agent owns dialog presentation; another reviews modal focus and confirmation states. |
| 9. Review and delivery | Medium | Responsive, contrast, keyboard and targeted regression checks; build/ZIP and practical testing instructions. | Agent 1 audits functionality, agent 2 reviews visuals/accessibility; root resolves findings and packages. |

Each stage has a concrete checkpoint and a short final report explaining changes, evidence and remaining work. Do not execute the entire plan in one unattended turn when Cristian requests one stage. Incorporate feedback without restarting completed stages. Tests use local disposable data even though the UI now belongs to the real application.

### Agent coordination

Cristian authorizes up to three agents; use no more than two child agents normally (root remains coordinator). A third child agent is reserved for an independent, useful task such as checking asset packaging while functionality and visual reviews are already running. It is not a target to fill.

Keep a single editor for `css/sangonomiya.css` and `js/ui/appShell.js` at any moment. Stages sharing those files run sequentially; reviewers remain read-only or own separate test/document files. Define each assignment's scope and deliverable before spawning. Root controls integration, final testing and stage closure. Do not give agents a second parallel theme implementation.

## Real application stage 1 checkpoint

Promoted the approved CSS to `css/sangonomiya.css`, the illustration to `img/sangonomiya.png`, and the shell to `js/ui/appShell.js`. `index.html` loads the theme and `js/index.js` initializes the shell before profiles and routing. Local fonts replace the unused Google Fonts request. Existing nodes and IDs are retained; the original version badge and repository link remain available.

The test build copies these real files and only replaces the database client/config with disposable equivalents. It no longer injects a preview-only shell or stylesheet. Earlier files in `design-preview/` are historical source material, not the active implementation.

Independent agent review caught the old `dataset.designRoute` name after promotion to `data-app-route`. Corrected to `dataset.appRoute` and added active-link assertions for Games, Tasks, Events and profile selection plus GitHub Pages link assertions.

Stage 1 completed: 41 focused tests passed after the correction, syntax and whitespace checks passed. Browser inspection showed exactly one app shell and only production theme files, correct Games/Tasks active navigation, profile entry hiding navigation and CRAN selection restoring it. Checked 1440px desktop and 390px mobile with no page overflow; browser error log was empty. Screenshot: `.local-deliveries/anime-design/screenshots/sangonomiya-real-stage1.jpg`. No live database operation or deployment was performed. Further flow-specific refinements and checks remain in stages 2–9.

## Stage 1 checkpoint

Generated the new background with the built-in image tool, placed the shrine and waterfalls toward the right edge, and applied the lagoon palette to primary controls and navigation. The desktop workspace now has outer margins, a translucent navigation surface and pale readable content panels. The build copies the new local asset. Original app modules and production frontend remain unchanged.

Verified the loaded Games page with five actual rows and no full-page horizontal overflow at the initial desktop viewport. The existing design build/DOM-contract test passed (one test); `git diff --check` passed. Full responsive, interaction and remaining-screen review belong to later stages. Screenshot: `.local-deliveries/anime-design/screenshots/sangonomiya-stage1.jpg`. The ZIP from the previous full delivery has not yet been regenerated.

### Background prompt

Use case: stylized-concept. Generate a single wide 16:9 panoramic original anime environment background for Gacha Management web app, inspired by Genshin Impact's Sangonomiya on Watatsumi Island, matching the bright daytime blue and pink mood of the second option in the previous UI comparison. BACKGROUND ONLY, absolutely no interface, lettering, watermark, margins or border. Beautiful hand-painted fantasy landscape: huge luminous blush pink coral shell framing an elegant small Japanese shrine on a floating terraced rocky island at the FAR RIGHT quarter; cascading waterfalls, turquoise lagoon, pale lavender mist and pink coral vegetation. Soft powder blue sky and layered white clouds over the upper half. Far left edge has distant lilac cliffs, a small curved bridge and sparse pale pink foliage. The CENTER 65 percent should be calm distant lagoon, low contrast haze and open sky because dense UI panels will overlay it; place main coral and waterfall landmarks at far right and foreground edge so they remain visible. Avoid central focal point. Restrained luminous colors blue #DCECF6, lagoon teal-blue, pale lavender, blush coral #D89EBE with deeper blues only at lower edges. Painterly refined anime scenery, dreamy but clear airy daytime, extensive atmospheric depth. Landscape 16:9, high detail at edges, intended as fullscreen desktop background. No characters, no logos, no promotional graphics. Create a new illustration, not a copy of an existing fanart.

## Encerramento das etapas 2–9 — 2026-10-10

Cristian autorizou executar todas as etapas no mesmo turno, interrompendo apenas diante de uma situação inesperada ou crítica que exigisse decisão. Root manteve a edição do tema; dois agents fizeram revisões independentes somente leitura. Não surgiu bloqueio crítico.

| Etapa | Resultado e evidência |
| --- | --- |
| 2. Games — média | Blocos compactos com notas, stamina/Save, previsão e ações. Rascunhos sobreviveram a Atualizar dados; Save e recarga preservaram notas e stamina. |
| 3. Tasks — média | Filtros, favoritos, conclusão e prazos mantidos. Filtro GI mostrou 2 atividades; concluir e ocultar concluídas mostrou 1. Tabela com rolagem interna no celular. |
| 4. Perfis — fácil | Entrada sem navegação/cabeçalho vazio, escolhas em azul lagoa, seleção destacada. Entrada e alternância CRAN/Demo inspecionadas; isolamento protegido pelos testes. |
| 5. Game form — fácil | Inputs, dicas e botão com hierarquia consistente. Criação e edição conferidas. O formulário real não oferece seletor de cor; nenhum controle foi inventado. |
| 6. Task form — média | Prazo e intervalo personalizado em grupos discretos; estados hidden/disabled preservados. Tarefa de 3 dias salva com prazo específico; formulário móvel sem overflow. |
| 7. Events — média | Escolha de jogo em grade, candidato e campos coerentes, avisos legíveis. Aprovação e Ignorar removeram os respectivos candidatos fictícios da revisão. Corrigida a especificidade CSS dos avisos encontrada pelo agent. |
| 8. Dialogs — média | Lote com rolagem e ações acessíveis no rodapé, confirmação aninhada mantida. Carregado Spiral Abyss; recriação cancelada; foco voltou a Escolher itens. |
| 9. Review — média | 127 testes focados aprovados, desktop 1440 × 1000 e celular 390 × 844 inspecionados, console sem erros observado. Build e ZIP atualizados; exemplos locais repostos. |

Capturas atuais: `.local-deliveries/anime-design/screenshots/final-*.jpg`. A aplicação principal usa `css/sangonomiya.css`, `js/ui/appShell.js` e `img/sangonomiya.png`; o build de avaliação reutiliza esses arquivos e troca somente o banco/configuração por equivalentes descartáveis. Não houve commit, merge, deploy, banco live ou incremento de versão. A suíte completa fica para o fechamento de uma versão MAJOR/MINOR conforme as convenções; testes focados não validam permissões reais do Supabase ou todos os navegadores.

Os checkpoints anteriores abaixo/acima registram a evolução do protótipo e não representam limitações pendentes da implementação final.

## Fechamento 1.13.0

Cristian autorizou changelog, numeração, commit e push. Escolhida versão MINOR 1.13.0 pela nova navegação e reformulação visual compatível. Manifests, README e badge atualizados. Etapa 2 de validação: npm test passou 582 testes (69 Jest + 513 Node), sem falhas. Merge na main e publicação não fazem parte deste fechamento.
