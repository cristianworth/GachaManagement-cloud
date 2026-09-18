// js/index.js
import Router from './utils/router.js';
import { initializeDatabase } from './database/dbInit.js';
import { isSupabaseConfigured } from './config/supabase.config.js';
import { initializeGameForm, initializeTaskForm } from './ui/formHandler.js';
import { populateGameDropDown, populateRefreshTypeDropDown } from './ui/dropdownHandler.js';
import { initializeNumberInputValidation } from './ui/inputValidation.js';

document.addEventListener('DOMContentLoaded', async function () {
  if (!isSupabaseConfigured()) {
    showConfigWarning();
    return;
  }

  setLoadingState(true, 'Loading...');

  try {
    // Garante que o banco esteja semeado/atualizado antes da primeira renderização.
    await withTimeout(initializeDatabase());

    // Aguarda a primeira rota e seus dados antes de liberar a tela.
    await withTimeout(Router.init());

    initializeGameForm();
    initializeTaskForm();
    populateGameDropDown();
    populateRefreshTypeDropDown();
    initializeNumberInputValidation();
  } catch (error) {
    console.error('Falha ao carregar a aplicação:', error);
    showLoadingError();
  } finally {
    setLoadingState(false);
  }
});

function setLoadingState(isLoading, message) {
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingMessage = loadingOverlay.querySelector('.loading-message');

  if (message) {
    loadingMessage.textContent = message;
  }

  loadingOverlay.hidden = !isLoading;
}

function withTimeout(promise, timeout = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tempo limite de carregamento excedido.')), timeout);
    })
  ]);
}

function showLoadingError() {
  const message = document.createElement('div');
  message.style.cssText =
    'margin:20px;padding:16px;border:1px solid #d33;background:#fff0f0;border-radius:8px;font-family:Arial,sans-serif;';
  message.textContent = 'Não foi possível carregar os dados. Verifique sua conexão e tente recarregar a página.';
  document.body.prepend(message);
}

function showConfigWarning() {
  const message = document.createElement('div');
  message.style.cssText =
    'margin:20px;padding:16px;border:1px solid #f5c000;background:#fff8e1;border-radius:8px;font-family:Arial,sans-serif;';
  message.innerHTML =
    '<strong>Banco de dados não configurado.</strong><br>' +
    'Preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em ' +
    '<code>js/config/supabase.config.js</code> e execute <code>db/schema.sql</code> no Supabase. ' +
    'Veja o passo a passo no <code>README.md</code>.';
  document.body.prepend(message);
}
