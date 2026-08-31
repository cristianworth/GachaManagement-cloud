// js/utils/router.js
import NavigationService from '../services/navigation.service.js';

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
    '/tasks/create': 'createTask'
  };

  static init() {
    NavigationService.init();
    window.addEventListener('popstate', () => this.route());
    this.route();
  }

  static navigateTo(path) {
    const fullPath = `${this.BASE_PATH}${path}`;
    history.pushState({}, '', fullPath);
    this.route();
  }

  static route() {
    const path = this.getCurrentPath();
    const view = this.routes[path] || 'games';
    
    document.querySelectorAll('[data-page]').forEach(el => {
      el.style.display = el.dataset.page === view ? 'block' : 'none';
    });

    // Load data when navigating to specific views
    switch(view) {
      case 'games':
        import('../ui/gameUI.js').then(module => module.displayAllGames());
        break;
      case 'taskList':
        import('../ui/taskUI.js').then(module => module.displayAllTasks());
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