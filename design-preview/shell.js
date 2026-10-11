import Router from '../js/utils/router.js';
import { getSelectedProfileId } from '../js/services/profileSession.js';

// The preview shell only organizes the real pages and invokes their public router.
const layout = document.createElement('div');
layout.className = 'design-layout';
layout.innerHTML = `
    <aside class="design-sidebar">
        <a class="design-brand" href="/" aria-label="Gacha Management, Games">
            <span class="design-brand-mark" aria-hidden="true">❀</span>
            <span class="design-brand-name">Gacha<br>Management<small>v1.12.1</small></span>
        </a>
        <nav class="design-nav" aria-label="Navegação principal">
            <a href="/" data-design-route="/"><span class="design-nav-symbol" aria-hidden="true">◇</span>Games</a>
            <a href="/tasks" data-design-route="/tasks"><span class="design-nav-symbol" aria-hidden="true">☷</span>Tasks</a>
            <a href="/events" data-design-route="/events"><span class="design-nav-symbol" aria-hidden="true">✧</span>Eventos</a>
            <a href="/profile/games" data-design-route="/profile/games"><span class="design-nav-symbol" aria-hidden="true">⊞</span>Jogos do perfil</a>
        </nav>
        <p class="design-sidebar-note">Seu progresso permanece separado por perfil.</p>
    </aside>
    <div class="design-main">
        <header class="design-topbar"><span class="design-preview-label">Prévia de design · dados locais de exemplo</span></header>
        <main class="design-content"></main>
    </div>`;
const content = layout.querySelector('.design-content');
layout.querySelector('.design-brand-name small').textContent = document.querySelector('.version-badge').textContent;
content.append(document.getElementById('profileEntry'));
document.querySelectorAll('[data-page]').forEach(page => content.append(page));
layout.querySelector('.design-topbar').append(document.getElementById('profileBar'));
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
        description.className = 'design-page-description';
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
        actions.className = 'design-actions';
        first.before(actions);
        group.forEach(button => actions.append(button));
    }
    if (['games', 'taskList'].includes(page.dataset.page)) {
        const pageHeader = document.createElement('div');
        pageHeader.className = 'design-daily-header';
        const title = document.createElement('div');
        title.className = 'design-daily-title';
        heading.before(pageHeader);
        title.append(heading, section.querySelector('.design-page-description'));
        pageHeader.append(title, section.querySelector('.design-actions'));
    }
    if (page.dataset.page === 'taskList') {
        const filters = section.querySelector('.task-filters');
        for (const id of ['taskGameFilter', 'taskRefreshTypeFilter']) {
            const select = document.getElementById(id);
            const label = filters.querySelector(`label[for="${id}"]`);
            const field = document.createElement('div');
            field.className = 'design-filter-field';
            label.before(field);
            field.append(label, select);
        }
        const batch = document.createElement('div');
        batch.className = 'design-batch-tools';
        const batchActions = document.getElementById('loadTaskBatchBtn').closest('.design-actions');
        batchActions.before(batch);
        batch.append(batchActions, document.getElementById('taskBatchHint'));
    }
}
const nav = layout.querySelector('.design-nav');
function updateNavigation() {
    const path = Router.getCurrentPath();
    for (const link of nav.querySelectorAll('a')) {
        const route = link.dataset.designRoute;
        const active = route === '/' ? path === '/' || path.startsWith('/games/')
            : route === '/tasks' ? path.startsWith('/tasks')
            : route === '/events' ? path.startsWith('/events') : path === route;
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
    nav.hidden = !getSelectedProfileId();
}
layout.querySelectorAll('.design-nav a, .design-brand').forEach(link => {
    link.addEventListener('click', event => {
        event.preventDefault();
        if (getSelectedProfileId()) Router.navigateTo(link.getAttribute('href'));
    });
});
// Observe page visibility rather than replacing or patching the existing router.
const observer = new MutationObserver(updateNavigation);
content.querySelectorAll('[data-page]').forEach(page => observer.observe(page, {attributes:true, attributeFilter:['style']}));
window.addEventListener('popstate', updateNavigation);
updateNavigation();
