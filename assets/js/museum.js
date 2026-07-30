/**
 * museum.js — masonry-style museum grid with category filter and a modal
 * for each item, sourced from museum.json.
 */
(function () {
  'use strict';

  let items = [];
  let activeType = 'all';

  const TYPE_LABELS = {
    photo: { ar: 'صور', en: 'Photos' },
    artifact: { ar: 'مقتنيات', en: 'Artifacts' },
    paper: { ar: 'أوراق', en: 'Papers' },
    letter: { ar: 'رسائل', en: 'Letters' },
    event: { ar: 'أحداث', en: 'Events' },
  };

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  function renderFilters() {
    const L = lang();
    const bar = document.getElementById('museum-filters');
    const types = [...new Set(items.map((i) => i.type))];
    bar.innerHTML = `<button class="filter-chip ${activeType === 'all' ? 'is-active' : ''}" data-type="all">${L === 'ar' ? 'الكل' : 'All'}</button>` +
      types.map((t) => `<button class="filter-chip ${activeType === t ? 'is-active' : ''}" data-type="${t}">${TYPE_LABELS[t][L]}</button>`).join('');
    bar.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => { activeType = btn.dataset.type; renderFilters(); renderGrid(); });
    });
  }

  function renderGrid() {
    const L = lang();
    const grid = document.getElementById('museum-grid');
    const list = activeType === 'all' ? items : items.filter((i) => i.type === activeType);
    grid.innerHTML = list.map((item, i) => `
      <div class="museum-item reveal reveal-delay-${Math.min(i % 4, 3)}" data-id="${item.id}" style="aspect-ratio:${i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/5'};">
        ${item.image
          ? `<img class="lazy-img is-loaded" src="${item.image}" alt="${item.title[L]}" style="width:100%;height:100%;object-fit:cover;">`
          : `<img class="lazy-img" data-name="${item.title[L]}" data-placeholder-kind="${item.type}" alt="${item.title[L]}" style="width:100%;height:100%;object-fit:cover;">`}
        <span class="tag museum-item__era ltr-nums">${item.era}</span>
        <div class="gallery-item__overlay"><span>${item.title[L]}</span></div>
      </div>
    `).join('');

    grid.querySelectorAll('img.lazy-img[data-name]').forEach((img) => FamilyAvatar.lazyMount(img));
    grid.querySelectorAll('.museum-item').forEach((el) => {
      el.classList.add('gallery-item'); // reuse hover-overlay styles
      el.addEventListener('click', () => openModal(list.find((i) => i.id === el.dataset.id)));
    });
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }

  const modal = document.getElementById('museum-modal');
  const modalContent = document.getElementById('museum-modal-content');
  function openModal(item) {
    const L = lang();
    modalContent.innerHTML = `
      <img src="${item.image || FamilyAvatar.makeContentPlaceholder(item.title[L], { size: 500, kind: item.type })}" alt="${item.title[L]}" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">
      <div style="padding:2rem;">
        <span class="tag ltr-nums">${item.era}</span>
        <h2 class="heading-sm" style="margin-block-start:0.75rem;">${item.title[L]}</h2>
        <p class="member-profile__bio" style="margin-block-start:1rem;">${item.description[L]}</p>
      </div>
    `;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  async function init() {
    items = await DataLoader.loadJSON('assets/data/museum.json') || [];
    renderFilters();
    renderGrid();
  }

  init();
  document.addEventListener('langchange', () => { renderFilters(); renderGrid(); });
})();
