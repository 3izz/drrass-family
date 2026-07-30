/**
 * gallery.js — category filtering + lazy-loaded grid + lightbox for the
 * photo gallery, driven entirely by gallery.json.
 */
(function () {
  'use strict';

  let galleryData = null;
  let activeCategory = 'all';
  let currentIndex = 0;
  let filteredItems = [];

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  function applyFilter() {
    filteredItems = activeCategory === 'all'
      ? galleryData.items
      : galleryData.items.filter((it) => it.category === activeCategory);
  }

  function renderFilters() {
    const L = lang();
    const bar = document.getElementById('gallery-filters');
    const cats = [{ id: 'all', ar: 'الكل', en: 'All' }, ...galleryData.categories];
    bar.innerHTML = cats.map((c) => `
      <button class="filter-chip ${c.id === activeCategory ? 'is-active' : ''}" data-cat="${c.id}">${c.id === 'all' ? (L === 'ar' ? c.ar : c.en) : c[L]}</button>
    `).join('');
    bar.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        renderFilters();
        applyFilter();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    const L = lang();
    const grid = document.getElementById('gallery-grid');
    grid.innerHTML = filteredItems.map((item, i) => `
      <div class="gallery-item reveal" data-index="${i}">
        ${item.image
          ? `<img class="lazy-img is-loaded" src="${item.image}" alt="${item.title[L]}" loading="lazy">`
          : `<img class="lazy-img" data-name="${item.title[L]}" data-placeholder-kind="photo" alt="${item.title[L]}" loading="lazy">`}
        <div class="gallery-item__overlay"><span>${item.title[L]} · <span class="ltr-nums">${item.year}</span></span></div>
      </div>
    `).join('');

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target.querySelector('img');
          if (img.dataset.name) FamilyAvatar.lazyMount(img);
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '100px' });
    grid.querySelectorAll('.gallery-item').forEach((el) => io.observe(el));

    grid.querySelectorAll('.gallery-item').forEach((el) => {
      el.addEventListener('click', () => openLightbox(parseInt(el.dataset.index, 10)));
    });
  }

  // ---- Lightbox ----
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');

  function openLightbox(index) {
    currentIndex = index;
    showLightboxItem();
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function showLightboxItem() {
    const L = lang();
    const item = filteredItems[currentIndex];
    lightboxImg.src = item.image || FamilyAvatar.makeContentPlaceholder(item.title[L], { size: 600, kind: 'photo' });
    lightboxImg.alt = item.title[L];
    lightboxCaption.textContent = `${item.title[L]} — ${item.caption[L]} (${item.year})`;
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-lightbox-close]').forEach((btn) => btn.addEventListener('click', closeLightbox));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.getElementById('lightbox-prev').addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + filteredItems.length) % filteredItems.length;
    showLightboxItem();
  });
  document.getElementById('lightbox-next').addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % filteredItems.length;
    showLightboxItem();
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'ArrowRight') document.getElementById('lightbox-next').click();
    if (e.key === 'ArrowLeft') document.getElementById('lightbox-prev').click();
  });

  async function init() {
    galleryData = await DataLoader.loadJSON('assets/data/gallery.json');
    if (!galleryData) return;
    applyFilter();
    renderFilters();
    renderGrid();
  }

  init();
  document.addEventListener('langchange', () => {
    if (!galleryData) return;
    renderFilters();
    renderGrid();
  });
})();
