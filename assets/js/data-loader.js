/**
 * data-loader.js — small fetch/cache helper so every page reads its
 * content from /assets/data/*.json instead of hardcoding markup.
 */
(function (global) {
  'use strict';

  const cache = new Map();

  async function loadJSON(path) {
    if (cache.has(path)) return cache.get(path);
    const promise = fetch(path, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load ' + path);
        return res.json();
      })
      .catch((err) => {
        console.error('[data-loader]', err.message);
        return null;
      });
    cache.set(path, promise);
    return promise;
  }

  global.DataLoader = { loadJSON };
})(window);
