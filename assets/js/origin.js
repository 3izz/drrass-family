/**
 * origin.js — renders the Family Origin page's interactive map pins,
 * migration chips, and location cards from origin.json. The source data
 * is intentionally a template (documented: false) since the real
 * migration story hasn't been contributed yet; this still keeps the
 * feature fully interactive so it lights up the moment real data arrives.
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  async function render() {
    const data = await DataLoader.loadJSON('assets/data/origin.json');
    if (!data) return;
    const L = lang();

    const introEl = document.getElementById('origin-intro');
    if (introEl) introEl.textContent = data.intro[L];

    const pinContainer = document.getElementById('map-pins');
    if (pinContainer) {
      pinContainer.innerHTML = '';
      data.locations.forEach((loc) => {
        const pin = document.createElement('div');
        pin.className = 'map-pin';
        pin.style.left = loc.x + '%';
        pin.style.top = loc.y + '%';
        pin.dataset.label = loc.label[L];
        pin.tabIndex = 0;
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-label', loc.label[L]);
        pin.addEventListener('click', () => showToast(`${loc.label[L]}: ${loc.description[L]}`));
        pinContainer.appendChild(pin);
      });
    }

    const pathEl = document.getElementById('migration-path');
    if (pathEl) {
      pathEl.innerHTML = data.locations.map((loc, i) => {
        const arrow = i > 0 ? `<span class="arrow">${L === 'ar' ? '←' : '→'}</span>` : '';
        return `${arrow}<span class="tag">${loc.label[L]}</span>`;
      }).join('');
    }

    const grid = document.getElementById('locations-grid');
    if (grid) {
      grid.innerHTML = data.locations.map((loc, i) => `
        <div class="card reveal reveal-delay-${Math.min(i + 1, 4)}">
          <h3 class="heading-sm">${loc.label[L]}</h3>
          <p class="text-muted" style="margin-block-start:0.5rem;">${loc.description[L]}</p>
          ${!loc.documented ? `<a href="suggestions.html" class="btn btn--outline btn--sm" style="margin-block-start:1rem;">${L === 'ar' ? 'أضف هذه المعلومة' : 'Add this information'}</a>` : ''}
        </div>`).join('');
      grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
  }

  render();
  document.addEventListener('langchange', render);
})();
