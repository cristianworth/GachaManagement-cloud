import { initializeDemoDatabase, restoreDemoExamples, getDemoEventStatus } from './client.js';

const ready = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true })) : Promise.resolve();
await ready;
const startup = document.getElementById('demoStartup');
try {
    startup.querySelector('p').textContent = 'Abrindo seu espaço de demonstração…';
    await initializeDemoDatabase();
    const { initializeApplication } = await import('../js/index.js');
    await initializeApplication();
    initializeDemoControls();
    startup.remove();
} catch (error) {
    startup.querySelector('p').textContent = error.message;
    const retry = document.createElement('button'); retry.textContent = 'Tentar novamente';
    retry.onclick = () => window.location.reload(); startup.append(retry);
}

function initializeDemoControls() {
    const bar = document.createElement('div'); bar.className = 'demo-toolbar';
    bar.innerHTML = `<span><strong>Demonstração</strong> <span class="demo-toolbar-copy">Salvo só neste navegador.</span></span>
        <button type="button" class="button-neutral" id="demoAbout">Sobre a demo</button>`;
    const topbar = document.querySelector('.app-topbar');
    topbar.prepend(bar);
    document.querySelector('.app-sidebar-note').firstChild.textContent = 'Eventos da API. Seu progresso fica neste navegador.';
    const descriptions = {
        gameAgenda: 'Calendário fictício para experimentar. Não representa banners atuais dos jogos.',
        eventGames: 'Eventos da API que precisam de conferência de prazo. Suas escolhas ficam nesta demo.',
        eventReview: 'Confira os horários ainda não confirmados antes de adicionar o evento às suas tarefas.',
    };
    for (const [page, text] of Object.entries(descriptions)) {
        const description = document.querySelector(`[data-page="${page}"] .app-page-description`);
        if (description) description.textContent = text;
    }
    const catalogueStatus = document.createElement('p');
    catalogueStatus.className = 'demo-catalogue-status';
    catalogueStatus.setAttribute('role','status');
    document.querySelector('[data-page="taskList"] .app-daily-header').after(catalogueStatus);
    const updateCatalogueStatus = () => {
        const text = getDemoEventStatus();
        if (catalogueStatus.textContent !== text) catalogueStatus.textContent = text;
    };
    window.addEventListener('demo:catalogue',updateCatalogueStatus);
    updateCatalogueStatus();
    document.getElementById('notificationsPanel').querySelector('p').textContent =
        'Avisos fictícios para experimentar. Não representam o calendário atual dos jogos.';
    document.getElementById('taskBatchHint').textContent += ' Nesta demo, somente tarefas com capa própria e prazo ainda válido (ou sem prazo) aparecem na lista e nas favoritas.';
    for (const id of ['gameImageUrl', 'taskCoverUrl']) {
        document.getElementById(id).readOnly = true;
        document.getElementById(`${id}Hint`).textContent = 'As capas dos eventos são incluídas automaticamente. Imagens externas não são carregadas pela demo.';
    }
    document.getElementById('taskCoverUrlHint').textContent += ' Tarefas sem capa ou vencidas são salvas, mas não aparecem na demo.';
    const dialog = document.getElementById('demoDialog');
    const trigger = document.getElementById('demoAbout');
    const close = document.getElementById('demoClose');
    let restoring = false;
    trigger.onclick = () => dialog.showModal();
    close.onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (restoring) event.preventDefault(); });
    dialog.onclose = () => trigger.focus();
    const channel = new BroadcastChannel(`gacha-demo-restore:${document.baseURI}`);
    channel.onmessage = event => { if (event.data === 'restored') window.location.reload(); };
    const restore = document.getElementById('demoRestore');
    restore.onclick = async () => {
        if (restoring) return;
        const { showDialog } = await import('../js/ui/dialogs.js');
        const result = await showDialog({ titleText: 'Restaurar os exemplos?',
            text: 'Seu progresso será restaurado em todos os perfis deste navegador. Os eventos usam o último catálogo disponível.',
            showCancelButton: true, confirmButtonText: 'Restaurar exemplos', focusCancel: true });
        if (!result.isConfirmed) return;
        restoring = true;
        restore.disabled = true;
        close.disabled = true;
        const status = document.getElementById('demoRestoreStatus');
        status.textContent = 'Restaurando exemplos…';
        try {
            await restoreDemoExamples(message => { status.textContent = message; });
            channel.postMessage('restored');
            window.location.assign(new URL('./', document.baseURI));
        } catch {
            status.textContent = 'Restauração não confirmada. Recarregue para conferir os dados antes de tentar novamente.';
            restoring = false;
            restore.disabled = false;
            close.disabled = false;
        }
    };
}
