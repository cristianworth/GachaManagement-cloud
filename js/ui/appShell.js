import Router from '../utils/router.js';
import { getSelectedProfileId } from '../services/profileSession.js';

export function initializeAppShell() {

    // Organize existing controls without replacing their handlers or page contracts.
    const layout = document.createElement('div');
    layout.className = 'app-layout';
    layout.innerHTML = `
        <aside class="app-sidebar">
            <a class="app-brand" href="/" aria-label="Gacha Management, Games">
                <img class="app-brand-mark" src="${Router.BASE_PATH}/img/brand-lotus.svg" width="28" height="28" alt="" aria-hidden="true">
                <span class="app-brand-name">Gacha<br>Management</span>
                <small class="app-brand-version"></small>
            </a>
            <nav class="app-nav" aria-label="Navegação principal">
                <a href="/" data-app-route="/"><svg class="app-nav-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10c2 0 3 1.5 3.5 3.5l1 5c.5 2.5-1.5 4-3.5 2.5l-3-2H9l-3 2c-2 1.5-4 0-3.5-2.5l1-5C4 8.5 5 7 7 7Z"/><path d="M6 11h4m-2-2v4m8-2h.01m2 2h.01"/></svg>Games</a>
                <a href="/tasks" data-app-route="/tasks"><svg class="app-nav-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 2 2 3-4m-5 9 2 2 3-4M12 6h9m-9 7h9M3 20h18"/></svg>Tasks</a>
            </nav>
            <p class="app-sidebar-note">Seu progresso permanece separado por perfil.</p>
            <details class="app-settings">
                <summary aria-label="Configurações"><svg class="app-nav-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-.5 2-2 .9-1.8-.7-2 3.5 1.5 1.3v2L3.7 13.3l2 3.5 1.8-.7 2 .9.5 2h4l.5-2 2-.9 1.8.7 2-3.5-1.5-1.3v-2l1.5-1.3-2-3.5-1.8.7-2-.9L14 3Z"/><circle cx="12" cy="11" r="3"/></svg><span>Configurações</span></summary>
                <nav class="app-settings-nav" aria-label="Configurações">
                    <a href="/events" data-app-route="/events">Eventos</a>
                    <a href="/agenda" data-app-route="/agenda">Agenda dos jogos</a>
                </nav>
            </details>
        </aside>
        <div class="app-main">
            <header class="app-topbar"></header>
            <main class="app-content"></main>
        </div>`;
    const content = layout.querySelector('.app-content');
    const version = document.querySelector('.version-badge');
    const projectLink = version.closest('a');
    layout.querySelector('.app-brand-version').append(version);
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
        eventReview: 'Confira o prazo e o vínculo antes de adicionar ao seu perfil.',
        gameAgenda: 'Primeira e segunda fase dos banners do servidor América.'
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
    const settings = layout.querySelector('.app-settings');
    let previousPath;
    function updateNavigation() {
        const path = Router.getCurrentPath();
        for (const link of layout.querySelectorAll('[data-app-route]')) {
            const route = link.dataset.appRoute;
            const active = route === '/' ? path === '/' || path.startsWith('/games/') || path === '/profile/games'
                : route === '/tasks' ? path.startsWith('/tasks')
                : route === '/events' ? path.startsWith('/events') : path === route;
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        nav.hidden = !getSelectedProfileId();
        settings.hidden = !getSelectedProfileId();
        settings.dataset.active = String(path === '/agenda' || path.startsWith('/events'));
        if (path !== previousPath || settings.hidden) settings.open = false;
        previousPath = path;
    }
    layout.querySelectorAll('[data-app-route], .app-brand').forEach(link => {
        const route = link.dataset.appRoute ?? '/';
        link.href = `${Router.BASE_PATH}${route}`;
        link.addEventListener('click', event => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (settings.open) {
                settings.open = false;
                if (settings.contains(link)) settings.querySelector('summary').focus();
            }
            if (getSelectedProfileId()) Router.navigateTo(route);
        });
    });
    document.addEventListener('pointerdown', event => {
        if (!settings.contains(event.target)) settings.open = false;
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && settings.open) {
            settings.open = false;
            settings.querySelector('summary').focus();
        }
    });
    // Observe page visibility rather than replacing or patching the existing router.
    const observer = new MutationObserver(updateNavigation);
    content.querySelectorAll('[data-page]').forEach(page => observer.observe(page, {attributes:true, attributeFilter:['style']}));
    window.addEventListener('popstate', updateNavigation);
    updateNavigation();

}
