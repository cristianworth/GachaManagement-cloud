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

  // Garante que o banco esteja semeado/atualizado antes da primeira renderização
  // (evita a tela em branco no primeiro carregamento).
  await initializeDatabase();

  // Single initialization point
  Router.init();

  // Initialize application modules
  initializeGameForm();
  initializeTaskForm();
  populateGameDropDown();
  populateRefreshTypeDropDown();
  initializeNumberInputValidation();
});

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
