/**
 * deaths.js — memorial grid sourced from family.json's real `alive: false`
 * flag (derived from the source export's isAbsent marker). No death dates
 * exist in the source, so none are invented here.
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  async function render() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const L = lang();
    const byId = new Map(data.members.map((m) => [m.id, m]));
    const deceased = data.members.filter((m) => m.alive === false);

    const grid = document.getElementById('deaths-grid');
    grid.innerHTML = deceased.map((m, i) => {
      const father = (m.parents || []).map((pid) => byId.get(pid)).find(Boolean);
      const name = m.name[L] || m.name.ar;
      const years = (m.birthYear || m.deathYear) ? `${m.birthYear || '?'} – ${m.deathYear || '?'}` : (L === 'ar' ? 'تاريخ غير موثّق' : 'Dates not documented');
      return `
        <div class="card memorial-card reveal reveal-delay-${Math.min(i % 4, 3)}">
          <div class="memorial-card__photo"><img class="lazy-img" data-name="${name}" alt="${name}"></div>
          <h3 class="heading-sm">${name}</h3>
          <p class="memorial-card__years ltr-nums">${years}</p>
          <p class="text-muted" style="margin-block-start:0.5rem;font-size:0.85rem;">
            ${father ? (L === 'ar' ? `نجل ${father.name[L] || father.name.ar}` : `Son of ${father.name[L] || father.name.ar}`) : ''}
          </p>
          <p class="text-gold" style="font-size:0.8rem;margin-block-start:0.4rem;">${L === 'ar' ? 'رحمه الله' : 'May he rest in peace'}</p>
        </div>`;
    }).join('');

    grid.querySelectorAll('img.lazy-img').forEach((img) => FamilyAvatar.lazyMount(img));
    grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
  }

  render();
  document.addEventListener('langchange', render);
})();
