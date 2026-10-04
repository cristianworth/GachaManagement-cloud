// js/utils/router.js
import NavigationService from '../services/navigation.service.js';
import { EVENT_GAMES } from '../events/eventGames.js';

class Router {
  // Deriva o base path do repositório servido no GitHub Pages (primeiro
  // segmento da URL). Fora do github.io (local/host próprio) usa raiz.
  static BASE_PATH = (() => {
    if (!window.location.hostname.includes('github.io')) return '';
    const repo = window.location.pathname.split('/')[1];
    return repo ? `/${repo}` : '';
  })();
  static routes = {
    '/': 'games',
    '/games/create': 'createGame',
    '/tasks': 'taskList',
    '/tasks/create': 'createTask',
    '/events': 'eventGames',
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
    const eventReview = await import('../ui/eventReviewUI.js');
    eventReview.stopEventReviewTimer();
    const path = this.getCurrentPath();
    const view = this.routes[path] || 'games';
    
    document.querySelectorAll('[data-page]').forEach(el => {
      el.style.display = el.dataset.page === view ? 'block' : 'none';
    });

    // Load data when navigating to specific views
    switch(view) {
      case 'games':
        await import('../ui/gameUI.js').then(module => module.displayAllGames(options));
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
