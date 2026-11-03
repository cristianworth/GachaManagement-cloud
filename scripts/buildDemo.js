import { cp, mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative, sep, toNamespacedPath } from 'node:path';
import { DEMO_CATALOGUE_DIRECTORY } from './captureDemoCatalogue.js';
import { validateDemoCatalogue } from '../demo/catalogue.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const DEMO_BASE_PATH = '/GachaManagement-cloud/demo';
const outputRoot = resolve(projectRoot, '.local-deliveries/public-demo');

export async function buildDemo({ basePath = DEMO_BASE_PATH, name = 'build', catalogueDirectory = DEMO_CATALOGUE_DIRECTORY } = {}) {
    let catalogue;
    try { catalogue = validateDemoCatalogue(JSON.parse(await readFile(join(catalogueDirectory,'catalogue.json'),'utf8'))); }
    catch { throw new Error('Prepare o catálogo da demo com npm run demo:capture antes de gerar o artefato.'); }
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(basePath) || basePath.endsWith('/')) throw new Error('Invalid demo base path.');
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid build name.');
    const destination = resolve(outputRoot, name);
    // Remove only this generated artifact; never copy the repository or configuration wholesale.
    if (!destination.startsWith(outputRoot + sep)) throw new Error('Invalid build destination.');
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    const write = async (path, value) => {
        await mkdir(resolve(destination, path, '..'), { recursive: true });
        await writeFile(resolve(destination, path), value);
    };
    for (const folder of ['js', 'css', 'img', 'demo']) {
        await cp(resolve(projectRoot, folder), resolve(destination, folder), { recursive: true,
            filter: source => !['js/config/supabase.config.js', 'js/database/supabaseClient.js', 'js/services/bannerAgenda.js', 'js/data/banners']
                // Node 20 on Windows passes namespaced paths to fs.cp filters.
                .includes(relative(toNamespacedPath(projectRoot), toNamespacedPath(source)).split(sep).join('/')) });
    }
    await write('js/config/supabase.config.js', 'export const isSupabaseConfigured = () => true;\n');
    await write('js/database/supabaseClient.js', "export { getClient, Tables } from '../../demo/client.js';\n");
    await write('js/services/bannerAgenda.js', "import { readDemoAgenda } from '../../demo/client.js';\nexport const fetchBannerAgenda = () => readDemoAgenda();\n");
    await write('js/utils/appPaths.js', `export const getAppBasePath = () => ${JSON.stringify(basePath)};\n`);
    const profiles = await readFile(resolve(projectRoot, 'js/services/profileSession.js'), 'utf8');
    await write('js/services/profileSession.js', profiles.replace("'gacha-profile'", `'gacha-demo-profile-v1:${basePath}'`)
        .replace('let selected = null;', "let selected = 'cran';")
        .replace('if (PROFILE_IDS.includes(id)) selected = id;', "if (id === 'choose') selected = null;\n        else if (PROFILE_IDS.includes(id)) selected = id;")
        .replace('window.localStorage.removeItem(STORAGE_KEY);', "window.localStorage.setItem(STORAGE_KEY, 'choose');"));
    await write('scripts/seedDesignPreview.js', await readFile(resolve(projectRoot, 'scripts/seedDesignPreview.js')));
    const schema = (await readFile(resolve(projectRoot, 'db/schema.sql'), 'utf8'))
        .replace(/("cover_url":\s*)"https:[^"]*"/g, '$1""');
    await write('demo/schema.sql', schema);
    await write('demo/catalogue.sql', await readFile(resolve(projectRoot, 'db/seed.sql')));
    await write('demo/catalogue.json',JSON.stringify(catalogue,null,2)+'\n');
    for (const cover of new Set(catalogue.games.flatMap(game=>game.events.map(event=>event.cover_url)).filter(path=>path.startsWith('img/demo-events/')))) {
        await write(cover,await readFile(join(catalogueDirectory,'images',cover.split('/').at(-1))));
    }
    const vendor = resolve(projectRoot, 'node_modules/@electric-sql/pglite');
    for (const file of await readdir(join(vendor, 'dist'))) {
        if (/\.(js|wasm|data)$/.test(file)) await write(`demo/vendor/pglite/${file}`, await readFile(join(vendor, 'dist', file)));
    }
    await write('demo/vendor/pglite/worker/index.js', await readFile(join(vendor, 'dist/worker/index.js')));
    await write('demo/vendor/pglite/LICENSE', await readFile(join(vendor, 'LICENSE')));
    let html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
    html = html.replace(/<title>.*?<\/title>/, '<title>Gacha Management — Demonstração</title>')
        .replace(/<script>[\s\S]*?<\/script>/, `<base href="${basePath}/">`)
        .replace(/\s*<script src="https:\/\/cdn.jsdelivr.net\/npm\/@supabase\/supabase-js@2"><\/script>/, '')
        .replace('src="js/index.js"', 'src="demo/bootstrap.js"')
        .replace('Calendário compartilhado dos banners, atualizado junto da publicação do site. Horários de Brasília (UTC−3), servidor América.',
            'Os exemplos começam na sua primeira visita e mudam ao restaurar. Horários exibidos em Brasília (UTC−3).')
        .replace('</head>', `<link rel="stylesheet" href="demo/demo.css">
    <meta name="robots" content="noindex">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'">
</head>`)
        .replace('<body>', `<body>
    <section id="demoStartup" role="status"><h1>Gacha Management</h1><p>Preparando sua demonstração… Na primeira visita, isso pode levar alguns segundos.</p></section>
    <dialog id="demoDialog" aria-labelledby="demoTitle">
        <h2 id="demoTitle">Um espaço para experimentar</h2>
        <p>Altere a stamina, organize tarefas e favoritas ou escreva anotações. Suas alterações ficam só neste navegador, mesmo ao recarregar.</p>
        <p>Tasks recebe eventos e capas da API, com a data da coleta indicada na lista. Seu progresso é demonstrativo. O calendário de banners e seus avisos continuam fictícios, sem relação com banners atuais dos jogos. Não há sincronização com contas ou outros dispositivos.</p>
        <p>Você pode restaurar os exemplos a qualquer momento. Limpar os dados do navegador também apaga sua demo.</p>
        <p id="demoRestoreStatus" role="status"></p>
        <div class="demo-dialog-actions"><button type="button" id="demoRestore" class="button-neutral">Restaurar exemplos</button><button type="button" id="demoClose" autofocus>Continuar explorando</button></div>
    </dialog>`)
        .replace('CRAN, Demo e Convidado têm progresso e jogos separados. Estes perfis são públicos e ainda não possuem login ou senha.',
            'Estes perfis de exemplo pertencem só à sua demo neste navegador. Você pode alternar entre eles para experimentar progressos separados.');
    await write('index.html', html);
    await write('404.html', `<!doctype html><html lang="pt-br"><meta charset="utf-8"><title>Abrindo demonstração</title>
<script>const base = ${JSON.stringify(basePath)}; const path = location.pathname.slice(base.length) || '/';
location.replace(base + '/' + location.search + '#' + path);</script><p>Abrindo demonstração…</p></html>`);
    await write('README.txt', 'Gacha Management — isolated static demo.\nServe these files at ' + basePath + '/ over HTTP(S).\nNo Node server, Supabase configuration or remote event API is used at runtime.\nPGlite 0.5.8: Apache-2.0; see demo/vendor/pglite/LICENSE.\n');
    const files = [];
    async function list(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) await list(path);
            else files.push({ path: relative(destination, path).split(sep).join('/'), bytes: (await stat(path)).size });
        }
    }
    await list(destination);
    await write('build-manifest.json', JSON.stringify({ basePath, files }, null, 2));
    return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await buildDemo());
