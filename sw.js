/**
 * sw.js — decrypts the family site inside the visitor's browser.
 * Every page, script, stylesheet, data file and image is published only as
 * an AES-GCM encrypted blob under enc/. Once the lock page has stored the
 * password-derived key on this device, this worker answers each request for
 * an original path (tree.html, assets/data/family.json, …) by fetching the
 * matching blob and decrypting it. Without a valid key it lets requests
 * through untouched, so every page URL just shows the lock page again.
 */
'use strict';

const BUILD = '2026-10-11T17:04:34.491Z-0d0ce749'; // changes on every publish so browsers pick up the new file list

const TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4',
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => { if (event.data === 'reset') unlocked = null; });

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('drrass-lock', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

function rootUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function decrypt(key, buffer) {
  const bytes = new Uint8Array(buffer);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
}

// { key, files } once this device holds a key that opens the current file list
let unlocked = null;

async function unlock() {
  const key = await idb('readonly', (s) => s.get('key'));
  if (!key) return null;
  const res = await fetch(rootUrl('enc/manifest.bin'), { cache: 'no-cache' });
  if (!res.ok) return null;
  try {
    const manifest = JSON.parse(new TextDecoder().decode(await decrypt(key, await res.arrayBuffer())));
    return { key, files: manifest.files };
  } catch (err) {
    // the password was changed since this device unlocked — forget the old key
    await idb('readwrite', (s) => s.delete('key'));
    return null;
  }
}

async function current() {
  if (!unlocked) unlocked = unlock().catch(() => null);
  const state = await unlocked;
  if (!state) unlocked = null; // don't remember "locked"; the next request checks again
  return state;
}

function sitePath(url) {
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  let path = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  if (path === '' || path.endsWith('/')) path += 'index.html';
  return path;
}

async function serve(request, path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await current();
    const entry = state && state.files[path];
    if (!entry) break;
    const res = await fetch(rootUrl('enc/' + entry), { cache: attempt ? 'no-cache' : 'default' });
    if (res.ok) {
      const body = await decrypt(state.key, await res.arrayBuffer());
      const ext = path.split('.').pop().toLowerCase();
      return new Response(body, { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream' } });
    }
    unlocked = null; // file list is stale (the site was republished); reload it and retry once
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const path = sitePath(new URL(event.request.url));
  if (path === null || path.startsWith('enc/') || path === 'sw.js') return;
  event.respondWith(serve(event.request, path).catch(() => fetch(event.request)));
});
