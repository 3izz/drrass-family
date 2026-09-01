/**
 * avatar.js — generates deterministic placeholder portraits as inline SVG
 * data URIs. Used everywhere a member/photo has no real image file yet,
 * so the site never depends on external image hosting.
 */
(function (global) {
  'use strict';

  /* Monochrome placeholders: soft warm-grey grounds, ink glyphs. The site
     identity is white / near-black, so avatars stay quiet and never add
     colour noise to a tree of hundreds of near-identical names. */
  const PALETTE = [
    ['#f1f0ec', '#e6e4dd'],
    ['#eeede8', '#e1dfd7'],
    ['#f3f2ee', '#e8e6df'],
    ['#ecebe6', '#dedcd3'],
    ['#f0efe9', '#e4e2da'],
  ];
  const INK = '#1a1a17';

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

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#g${seed})"/>
        <text x="100" y="118" font-family="Cairo, Poppins, sans-serif" font-size="60" font-weight="700"
          fill="${INK}" text-anchor="middle" opacity="0.82">${initials}</text>
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
        <g transform="translate(74,74)" stroke="${INK}" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
      </svg>
    `.trim();

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  /** Fills an <img> lazily once it enters the viewport (data-src pattern). */
  function lazyMount(img) {
    if (!img || img.dataset.avatarBound) return;
    img.dataset.avatarBound = '1';
    img.classList.add('lazy-img');
    // Respect a real image that the markup already provides — only generate
    // a placeholder when there is no usable src.
    const cur = img.getAttribute('src');
    if (!cur || cur.indexOf('data:') === 0) {
      const name = img.dataset.name || img.alt || 'Family';
      const kind = img.dataset.placeholderKind;
      img.src = kind ? makeContentPlaceholder(name, { kind }) : makeAvatar(name);
    }
    if (img.complete) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    requestAnimationFrame(() => img.classList.add('is-loaded'));
  }

  global.FamilyAvatar = { makeAvatar, makeContentPlaceholder, initialsOf, lazyMount };
})(window);
