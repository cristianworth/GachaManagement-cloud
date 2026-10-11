import Router from '../utils/router.js';
import { getSelectedProfileId } from '../services/profileSession.js';

export function initializeAppShell() {

    // Organize existing controls without replacing their handlers or page contracts.
    const layout = document.createElement('div');
    layout.className = 'app-layout';
    layout.innerHTML = `
        <aside class="app-sidebar">
            <a class="app-brand" href="/" aria-label="Gacha Management, Games">
                <span class="app-brand-mark" aria-hidden="true">❀</span>
                <span class="app-brand-name">Gacha<br>Management<small></small></span>
            </a>
            <nav class="app-nav" aria-label="Navegação principal">
                <a href="/" data-app-route="/"><span class="app-nav-symbol" aria-hidden="true">◇</span>Games</a>
                <a href="/tasks" data-app-route="/tasks"><span class="app-nav-symbol" aria-hidden="true">☷</span>Tasks</a>
                <a href="/events" data-app-route="/events"><span class="app-nav-symbol" aria-hidden="true">✧</span>Eventos</a>
                <a href="/profile/games" data-app-route="/profile/games"><span class="app-nav-symbol" aria-hidden="true">⊞</span>Jogos do perfil</a>
            </nav>
            <p class="app-sidebar-note">Seu progresso permanece separado por perfil.</p>
        </aside>
        <div class="app-main">
            <header class="app-topbar"></header>
            <main class="app-content"></main>
        </div>`;
    const content = layout.querySelector('.app-content');
    const version = document.querySelector('.version-badge');
    const projectLink = version.closest('a');
    layout.querySelector('.app-brand-name small').append(version);
    projectLink.textContent = 'Código do projeto';
    projectLink.className = 'app-project-link';
    layout.querySelector('.app-sidebar-note').append(document.createElement('br'), projectLink);
    content.append(document.getElementById('profileEntry'));
    document.querySelectorAll('[data-page]').forEach(page => content.append(page));
    layout.querySelector('.app-topbar').append(document.getElementById('profileBar'));
    document.body.append(layout);

    const descriptions = {
        games: 'Stamina, previsão de recarga e suas anotações por jogo.',
        taskList: 'Organize atividades, acompanhe prazos e mantenha seus favoritos por perto.',
        createGame: 'Cadastre ou ajuste os dados do jogo no perfil selecionado.',
        createTask: 'Defina a atividade, o prazo e o intervalo de repetição.',
        eventGames: 'Escolha um jogo para conferir os eventos encontrados.',
        eventReview: 'Confira o prazo e o vínculo antes de adicionar ao seu perfil.'
    };
    for (const page of content.querySelectorAll('[data-page]')) {
        const section = page.querySelector('section');
        const heading = section.querySelector('h1');
        if (page.dataset.page === 'games') heading.innerHTML = 'Games';
        if (descriptions[page.dataset.page]) {
            const description = document.createElement('p');
            description.className = 'app-page-description';
            description.textContent = descriptions[page.dataset.page];
            heading.after(description);
        }
        const directButtons = [...section.children].filter(child => child.tagName === 'BUTTON' && !child.id.endsWith('Retry'));
        while (directButtons.length) {
            const first = directButtons.shift();
            if (first.parentElement !== section) continue;
            const group = [first];
            let next = first.nextElementSibling;
            while (next?.tagName === 'BUTTON' && !next.id.endsWith('Retry')) {
                group.push(next);
                next = next.nextElementSibling;
            }
            const actions = document.createElement('div');
            actions.className = 'app-actions';
            first.before(actions);
            group.forEach(button => actions.append(button));
        }
        if (['games', 'taskList'].includes(page.dataset.page)) {
            const pageHeader = document.createElement('div');
            pageHeader.className = 'app-daily-header';
            const title = document.createElement('div');
            title.className = 'app-daily-title';
            heading.before(pageHeader);
            title.append(heading, section.querySelector('.app-page-description'));
            pageHeader.append(title, section.querySelector('.app-actions'));
        }
        if (page.dataset.page === 'taskList') {
            const filters = section.querySelector('.task-filters');
            for (const id of ['taskGameFilter', 'taskRefreshTypeFilter']) {
                const select = document.getElementById(id);
                const label = filters.querySelector(`label[for="${id}"]`);
                const field = document.createElement('div');
                field.className = 'app-filter-field';
                label.before(field);
                field.append(label, select);
            }
            const batch = document.createElement('div');
            batch.className = 'app-batch-tools';
            const batchActions = document.getElementById('loadTaskBatchBtn').closest('.app-actions');
            batchActions.before(batch);
            batch.append(batchActions, document.getElementById('taskBatchHint'));
        }
    }
    const nav = layout.querySelector('.app-nav');
    function updateNavigation() {
        const path = Router.getCurrentPath();
        for (const link of nav.querySelectorAll('a')) {
            const route = link.dataset.appRoute;
            const active = route === '/' ? path === '/' || path.startsWith('/games/')
                : route === '/tasks' ? path.startsWith('/tasks')
                : route === '/events' ? path.startsWith('/events') : path === route;
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        nav.hidden = !getSelectedProfileId();
    }
    layout.querySelectorAll('.app-nav a, .app-brand').forEach(link => {
        const route = link.dataset.appRoute ?? '/';
        link.href = `${Router.BASE_PATH}${route}`;
        link.addEventListener('click', event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (getSelectedProfileId()) Router.navigateTo(route);
        });
    });
    // Observe page visibility rather than replacing or patching the existing router.
    const observer = new MutationObserver(updateNavigation);
    content.querySelectorAll('[data-page]').forEach(page => observer.observe(page, {attributes:true, attributeFilter:['style']}));
    window.addEventListener('popstate', updateNavigation);
    updateNavigation();

}
