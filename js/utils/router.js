// js/utils/router.js
import NavigationService from '../services/navigation.service.js';
import { EVENT_GAMES } from '../events/eventGames.js';
import { stopSilentRefresh } from '../ui/silentRefresh.js';
import { getAppBasePath } from './appPaths.js';

class Router {
  // Deriva o base path do repositório servido no GitHub Pages (primeiro
  // segmento da URL). Fora do github.io (local/host próprio) usa raiz.
  static BASE_PATH = getAppBasePath(window.location);
  static routes = {
    '/': 'games',
    '/games/create': 'createGame',
    '/tasks': 'taskList',
    '/tasks/create': 'createTask',
    '/events': 'eventGames',
    '/agenda': 'gameAgenda',
    '/profile/games': 'profileGames',
    ...Object.fromEntries(EVENT_GAMES.map(game => [`/events/${game.key}`, 'eventReview']))
  };

  static async init() {
    // Restore a route redirected by static hosting when a page is opened directly.
    const redirectedPath = window.location.hash.slice(1);
    if (this.routes[redirectedPath]) {
      history.replaceState({}, '', `${this.BASE_PATH}${redirectedPath}`);
    }
    NavigationService.init();
    window.addEventListener('popstate', () => this.route());
    await this.route();
  }

  static navigateTo(path, options = {}) {
    const fullPath = `${this.BASE_PATH}${path}`;
    history.pushState({}, '', fullPath);
    return this.route(options);
  }

  static async route(options = {}) {
    const notifications = document.getElementById('notificationsPanel');
    if (notifications?.open) notifications.close();
    stopSilentRefresh();
    const gameUI = await import('../ui/gameUI.js');
    gameUI.stopStaminaEstimateTimer();
    const eventReview = await import('../ui/eventReviewUI.js');
    eventReview.stopEventReviewTimer();
    const path = this.getCurrentPath();
    const view = this.routes[path] || 'games';
    
    document.querySelectorAll('[data-page]').forEach(el => {
      el.style.display = el.dataset.page === view ? 'block' : 'none';
    });

    // Load data when navigating to specific views
    switch(view) {
      case 'gameAgenda':
        await import('../ui/gameAgenda.js').then(module => module.displayGameAgenda());
        break;
      case 'profileGames':
        await import('../ui/profileUI.js').then(module => module.displayProfileGames());
        break;
      case 'createTask':
        await import('../ui/dropdownHandler.js').then(module => module.populateGameDropDown());
        break;
      case 'games':
        await gameUI.displayAllGames(options);
        break;
      case 'taskList':
        await import('../ui/taskUI.js').then(module => module.displayAllTasks(options));
        await eventReview.displayEventReviewCount();
        break;
      case 'eventGames':
        await eventReview.displayEventGames();
        break;
      case 'eventReview':
        await eventReview.displayEventCandidates(path.split('/').at(-1));
        break;
    }
  }
  
  static getCurrentPath() {
    const path = window.location.pathname;
    return path.startsWith(this.BASE_PATH) 
      ? path.slice(this.BASE_PATH.length) || '/'
      : path;
  }
}

export default Router;
