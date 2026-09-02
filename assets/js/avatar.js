/**
 * avatar.js — generates deterministic placeholder portraits as inline SVG
 * data URIs. Used everywhere a member/photo has no real image file yet,
 * so the site never depends on external image hosting.
 */
(function (global) {
  'use strict';

  const PALETTE = [
    ['#1a4a35', '#2f7a58'],
    ['#16293b', '#1e3a52'],
    ['#8f6d24', '#c8a24d'],
    ['#0c2118', '#235f45'],
    ['#0f1f2e', '#16293b'],
  ];

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function initialsOf(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  /**
   * @param {string} name - full name used to seed color + initials
   * @param {object} [opts]
   * @param {number} [opts.size=200]
   * @param {string} [opts.gender] - 'male' | 'female' (affects ornament only)
   * @returns {string} data: URI (SVG)
   */
  function makeAvatar(name, opts) {
    opts = opts || {};
    const size = opts.size || 200;
    const seed = hashStr(name || 'family');
    const [c1, c2] = PALETTE[seed % PALETTE.length];
    const initials = initialsOf(name);
    const gold = '#c8a24d';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#g${seed})"/>
        <circle cx="100" cy="100" r="92" fill="none" stroke="${gold}" stroke-width="1.5" opacity="0.55"/>
        <text x="100" y="118" font-family="Cairo, Poppins, sans-serif" font-size="64" font-weight="700"
          fill="${gold}" text-anchor="middle" opacity="0.92">${initials}</text>
      </svg>
    `.trim();

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  const ICONS = {
    photo: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/>',
    artifact: '<path d="M6 3h12l-1 6H7z"/><path d="M7 9v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/>',
    paper: '<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6"/>',
    letter: '<path d="M3 5h18v14H3z"/><path d="M3 5l9 7 9-7"/>',
    event: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    default: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/>',
  };

  /**
   * Placeholder for non-person content (gallery photos, news, museum items,
   * documents) — an icon on a brand gradient, NOT name-initials (initials
   * only make sense for an actual person's name, not an event/photo title).
   */
  function makeContentPlaceholder(seed, opts) {
    opts = opts || {};
    const size = opts.size || 400;
    const kind = opts.kind || 'default';
    const hash = hashStr(seed || 'family');
    const [c1, c2] = PALETTE[hash % PALETTE.length];
    const gold = '#c8a24d';
    const icon = ICONS[kind] || ICONS.default;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="p${hash}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#p${hash})"/>
        <g transform="translate(74,74)" stroke="${gold}" stroke-width="1.6" fill="none" opacity="0.85" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
      </svg>
    `.trim();

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  /** Fills an <img> lazily once it enters the viewport (data-src pattern). */
  function lazyMount(img) {
    if (!img || img.dataset.avatarBound) return;
    img.dataset.avatarBound = '1';
    // Already has a real image file — never overwrite it with a placeholder.
    if (img.getAttribute('src')) {
      img.classList.add('lazy-img', 'is-loaded');
      return;
    }
    const name = img.dataset.name || img.alt || 'Family';
    const kind = img.dataset.placeholderKind;
    img.src = kind ? makeContentPlaceholder(name, { kind }) : makeAvatar(name);
    img.classList.add('lazy-img');
    requestAnimationFrame(() => img.classList.add('is-loaded'));
  }

  global.FamilyAvatar = { makeAvatar, makeContentPlaceholder, initialsOf, lazyMount };
})(window);
