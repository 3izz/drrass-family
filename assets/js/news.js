/**
 * news.js — category filter + card grid + read-more modal for the News page.
 */
(function () {
  'use strict';

  let newsData = [];
  let activeCategory = 'all';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  function categories() {
    const seen = new Map();
    newsData.forEach((n) => { if (!seen.has(n.category.ar)) seen.set(n.category.ar, n.category); });
    return [...seen.values()];
  }

  function renderFilters() {
    const L = lang();
    const bar = document.getElementById('news-filters');
    const cats = categories();
    bar.innerHTML = `<button class="filter-chip ${activeCategory === 'all' ? 'is-active' : ''}" data-cat="all">${L === 'ar' ? 'الكل' : 'All'}</button>` +
      cats.map((c) => `<button class="filter-chip ${activeCategory === c.ar ? 'is-active' : ''}" data-cat="${c.ar}">${c[L]}</button>`).join('');
    bar.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => { activeCategory = btn.dataset.cat; renderFilters(); renderGrid(); });
    });
  }

  function renderGrid() {
    const L = lang();
    const grid = document.getElementById('news-grid');
    const items = activeCategory === 'all' ? newsData : newsData.filter((n) => n.category.ar === activeCategory);
    grid.innerHTML = items.map((n, i) => `
      <article class="card news-card reveal reveal-delay-${Math.min(i % 3, 2)}" data-id="${n.id}">
        <div class="news-card__img"><img class="lazy-img" data-name="${n.title[L]}" data-placeholder-kind="paper" alt="${n.title[L]}"></div>
        <div class="news-card__body">
          <span class="tag">${n.category[L]}</span>
          <div class="news-card__date ltr-nums">${n.date}</div>
          <h3 class="news-card__title">${n.title[L]}</h3>
          <p class="news-card__excerpt">${n.excerpt[L]}</p>
          <button class="btn btn--outline btn--sm read-more-btn" style="margin-block-start:1rem;" data-id="${n.id}">${L === 'ar' ? 'اقرأ المزيد' : 'Read More'}</button>
        </div>
      </article>
    `).join('');

    grid.querySelectorAll('img.lazy-img').forEach((img) => FamilyAvatar.lazyMount(img));
    grid.querySelectorAll('.read-more-btn').forEach((btn) => {
      btn.addEventListener('click', () => openArticle(btn.dataset.id));
    });
    document.querySelectorAll('.reveal').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200) el.classList.add('is-visible');
    });
  }

  const modal = document.getElementById('news-modal');
  const modalContent = document.getElementById('news-modal-content');
  function openArticle(id) {
    const L = lang();
    const n = newsData.find((x) => x.id === id);
    modalContent.innerHTML = `
      <span class="tag">${n.category[L]}</span>
      <div class="news-card__date ltr-nums" style="margin-block-start:0.5rem;">${n.date}</div>
      <h2 class="heading-sm" style="margin-block-start:0.5rem;">${n.title[L]}</h2>
      <p class="member-profile__bio" style="margin-block-start:1rem;">${n.body[L]}</p>
    `;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  async function init() {
    newsData = await DataLoader.loadJSON('assets/data/news.json') || [];
    renderFilters();
    renderGrid();
  }

  init();
  document.addEventListener('langchange', () => { renderFilters(); renderGrid(); });
})();
