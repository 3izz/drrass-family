/**
 * births.js — the real source data has no birth dates, so this page shows
 * the youngest documented generation (alive members with no recorded
 * children, from the deepest generations) rather than inventing dates.
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  async function render() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const L = lang();
    const byId = new Map(data.members.map((m) => [m.id, m]));

    const leaves = data.members.filter((m) => m.alive && (m.children || []).length === 0);
    leaves.sort((a, b) => (b.generation || 0) - (a.generation || 0));
    const picked = leaves.slice(0, 24);

    const grid = document.getElementById('births-grid');
    const empty = document.getElementById('births-empty');
    if (!picked.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    grid.innerHTML = picked.map((m, i) => {
      const father = (m.parents || []).map((pid) => byId.get(pid)).find(Boolean);
      const name = m.name[L] || m.name.ar;
      return `
        <div class="card birth-card reveal reveal-delay-${Math.min(i % 4, 3)}">
          <div class="birth-card__photo"><img class="lazy-img" data-name="${name}" alt="${name}"></div>
          <h3 class="heading-sm">${name}</h3>
          <p class="birth-card__ribbon">${L === 'ar' ? `الجيل ${m.generation}` : `Generation ${m.generation}`}</p>
          <p class="text-muted" style="margin-block-start:0.5rem;font-size:0.85rem;">
            ${father ? (L === 'ar' ? `نجل ${father.name[L] || father.name.ar}` : `Son of ${father.name[L] || father.name.ar}`) : (L === 'ar' ? 'الوالد غير معروف' : 'Parent unknown')}
          </p>
          <p class="text-muted" style="font-size:0.8rem;">${m.branch ? m.branch[L] : ''}</p>
        </div>`;
    }).join('');

    grid.querySelectorAll('img.lazy-img').forEach((img) => FamilyAvatar.lazyMount(img));
    grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }

  render();
  document.addEventListener('langchange', render);
})();
