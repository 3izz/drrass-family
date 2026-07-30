/**
 * home.js — populates the homepage's data-driven sections (stats, branch
 * cards, gallery preview, news preview) from the JSON data files.
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  async function renderStats() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const members = data.members;
    const generations = Math.max(...members.map((m) => m.generation || 1));
    const branchCount = new Set(members.map((m) => m.branchId).filter((b) => b && b !== 'root')).size;
    const alive = members.filter((m) => m.alive).length;

    const values = [members.length, generations, branchCount, alive];
    document.querySelectorAll('#stats-strip [data-counter]').forEach((el, i) => {
      el.setAttribute('data-counter', values[i] ?? 0);
    });
  }

  async function renderBranches() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const members = data.members;
    const root = members.find((m) => m.isFounder);
    const branchMap = new Map();
    members.forEach((m) => {
      if (!m.branchId || m.branchId === 'root') return;
      if (!branchMap.has(m.branchId)) branchMap.set(m.branchId, { branch: m.branch, count: 0 });
      branchMap.get(m.branchId).count += 1;
    });

    const grid = document.getElementById('branches-grid');
    if (!grid) return;
    const L = lang();
    let i = 0;
    grid.innerHTML = [...branchMap.entries()].map(([branchId, info]) => {
      i++;
      const name = info.branch ? info.branch[L] : branchId;
      return `
        <div class="card branch-card reveal reveal-delay-${Math.min(i, 4)}">
          <span class="branch-card__num">0${i}</span>
          <h3 class="heading-sm">${name}</h3>
          <p class="text-muted" style="margin-block-start:0.5rem;">
            ${info.count} ${L === 'ar' ? 'فردًا موثّقًا في هذا الفرع' : 'documented members in this branch'}
          </p>
          <a href="tree.html?branch=${branchId}" class="btn btn--outline btn--sm" style="margin-block-start:1.25rem;">
            ${L === 'ar' ? 'تصفّح الفرع' : 'Browse Branch'}
          </a>
        </div>`;
    }).join('');
  }

  async function renderGalleryPreview() {
    const data = await DataLoader.loadJSON('assets/data/gallery.json');
    if (!data) return;
    const grid = document.getElementById('home-gallery-grid');
    if (!grid) return;
    const L = lang();
    const items = data.items.slice(0, 8);
    grid.innerHTML = items.map((item) => `
      <div class="gallery-item reveal">
        <img class="lazy-img" data-name="${item.title[L]}" data-placeholder-kind="photo" alt="${item.title[L]}">
        <div class="gallery-item__overlay"><span>${item.title[L]}</span></div>
      </div>
    `).join('');
    grid.querySelectorAll('img.lazy-img').forEach((img) => FamilyAvatar.lazyMount(img));
  }

  async function renderNewsPreview() {
    const data = await DataLoader.loadJSON('assets/data/news.json');
    if (!data) return;
    const grid = document.getElementById('home-news-grid');
    if (!grid) return;
    const L = lang();
    const items = data.slice(0, 3);
    grid.innerHTML = items.map((n) => `
      <article class="card news-card reveal">
        <div class="news-card__img"><img class="lazy-img" data-name="${n.title[L]}" data-placeholder-kind="paper" alt="${n.title[L]}"></div>
        <div class="news-card__body">
          <span class="tag">${n.category[L]}</span>
          <div class="news-card__date ltr-nums">${n.date}</div>
          <h3 class="news-card__title">${n.title[L]}</h3>
          <p class="news-card__excerpt">${n.excerpt[L]}</p>
        </div>
      </article>
    `).join('');
    grid.querySelectorAll('img.lazy-img').forEach((img) => FamilyAvatar.lazyMount(img));
  }

  function mountHeroImage() {
    const img = document.querySelector('.intro-split__media img');
    if (img) FamilyAvatar.lazyMount(img);
  }

  async function renderAll() {
    mountHeroImage();
    await Promise.all([renderStats(), renderBranches(), renderGalleryPreview(), renderNewsPreview()]);
    // Re-trigger reveal observer for newly injected nodes
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add('is-visible');
    });
  }

  renderAll();
  document.addEventListener('langchange', renderAll);
})();
