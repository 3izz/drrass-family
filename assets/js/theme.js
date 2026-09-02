/**
 * theme.js — light/dark theme toggle. Mirrors i18n.js's pattern: persists
 * the choice in localStorage and stamps data-theme on <html>, so every
 * page picks up the same theme without a shared layout/include system.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'drrass:theme';

  function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.setAttribute('aria-pressed', theme === 'light');
    });
  }

  function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  function toggleTheme() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  }

  function init() {
    applyTheme(getTheme());
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', toggleTheme);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.Theme = { getTheme, setTheme, toggleTheme };
})(window);
