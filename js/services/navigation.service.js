// js/services/navigation.service.js
import Router from '../utils/router.js';

class NavigationService {
  static init() {
    this._bindTaskNavigations();
    this._bindFormNavigations();
  }

  static _bindTaskNavigations() {
    this._bindNavigation('#reviewEventsBtn', '/events');
    this._bindNavigation('#backToTasksFromEventsBtn', '/tasks');
    this._bindNavigation('#backToEventGamesBtn', '/events');
    // this._bindNavigation('#createTaskBtn', '/tasks/create'); changed to --> js\ui\formHandler.js
  }

  static _bindFormNavigations() {
    this._bindNavigation('#backToGamesBtn', '/');
    this._bindNavigation('#backToTasksBtn', '/tasks');
  }

  static _bindNavigation(selector, path) {
    const element = document.querySelector(selector);
    if (element) {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        Router.navigateTo(path);
      });
    }
  }
}

export default NavigationService;
