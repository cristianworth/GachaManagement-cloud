import { fetchProfiles, fetchGameCatalogue, saveSelectedGames } from '../database/profileDB.js';
import { getSelectedProfileId, selectProfile, clearProfile } from '../services/profileSession.js';
import { populateInitialTasks } from '../database/taskDB.js';
import Router from '../utils/router.js';
import { withLoading } from './loadingState.js';
import { setFeedback } from './feedback.js';

export async function initializeProfiles() {
    const profiles = await fetchProfiles();
    const selected = profiles.find(profile => profile.id === getSelectedProfileId());
    const bar = document.getElementById('profileBar');
    bar.hidden = !selected;
    document.getElementById('activeProfileName').textContent = selected?.name ?? '';
    document.getElementById('switchProfileBtn').onclick = () => { clearProfile(); window.location.reload(); };
    document.getElementById('selectGamesBtn').onclick = () => Router.navigateTo('/profile/games');
    if (selected) {
        document.getElementById('profileEntry').hidden = true;
        return true;
    }
    document.querySelectorAll('[data-page]').forEach(page => { page.style.display = 'none'; });
    const entry = document.getElementById('profileEntry');
    entry.hidden = false;
    const choices = document.getElementById('profileChoices');
    choices.replaceChildren();
    for (const profile of profiles) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = profile.name;
        button.className = 'button-neutral';
        button.onclick = () => { selectProfile(profile.id); window.location.reload(); };
        choices.append(button);
    }
    return false;
}

export async function displayProfileGames() {
    return withLoading('Carregando jogos disponíveis...', loadProfileGameChoices);
}

async function loadProfileGameChoices() {
    const list = document.getElementById('profileGameChoices');
    list.replaceChildren();
    const save = document.getElementById('saveProfileGamesBtn');
    save.disabled = true;
    setFeedback('profileGamesStatus');
    document.getElementById('cancelProfileGamesBtn').onclick = () => Router.navigateTo('/');
    try {
        const games = await fetchGameCatalogue();
        for (const game of games) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = String(game.id);
            input.checked = game.enabled;
            label.append(input, document.createTextNode(game.description));
            list.append(label);
        }
        save.disabled = false;
        save.onclick = async () => {
            if (save.disabled) return;
            save.disabled = true;
            try {
                await withLoading('Salvando jogos do perfil...', async () => {
                    const ids = [...list.querySelectorAll('input:checked')].map(input => Number(input.value));
                    const createWeeklies = document.getElementById('includeProfileWeeklies').checked;
                    await saveSelectedGames(ids, { createWeeklies });
                    if (createWeeklies) await populateInitialTasks({ explicit: true });
                    await Router.navigateTo('/', { successMessage: 'Jogos do perfil atualizados.' });
                });
            } catch (error) {
                console.error('Failed to save profile games:', error);
                setFeedback('profileGamesStatus', 'Não foi possível concluir a seleção. Recarregue para conferir os jogos salvos e tente novamente.', 'error');
            } finally { save.disabled = false; }
        };
    } catch (error) {
        console.error('Failed to load catalogue:', error);
        setFeedback('profileGamesStatus', 'Não foi possível carregar o catálogo. Reabra a seleção para tentar novamente.', 'error');
    }
}
