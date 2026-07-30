/**
 * origin.js — renders the Family Origin page's interactive map pins,
 * migration chips, and location cards from origin.json. Al-Walaja and the
 * 1918 Chile emigration are real, sourced entries (photos the family
 * shared, cross-checked against the tree); any location still marked
 * documented:false stays an open invitation via the Suggestions page.
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
        pin.dataset.label = loc.year ? `${loc.label[L]} · ${loc.year}` : loc.label[L];
        pin.tabIndex = 0;
        pin.setAttribute('role', 'button');
        pin.setAttribute('aria-label', loc.label[L]);
        pin.addEventListener('click', () => {
          const card = document.getElementById(`loc-card-${loc.id}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.animate([
              { boxShadow: '0 0 0 0 rgba(230,196,119,0)' },
              { boxShadow: '0 0 0 6px rgba(230,196,119,0.35)' },
              { boxShadow: '0 0 0 0 rgba(230,196,119,0)' },
            ], { duration: 1100, easing: 'ease-out' });
          }
        });
        pinContainer.appendChild(pin);
      });
    }

    const pathEl = document.getElementById('migration-path');
    if (pathEl) {
      const documented = data.locations.filter((l) => l.documented);
      pathEl.innerHTML = documented.map((loc, i) => {
        const arrow = i > 0 ? `<span class="arrow">${L === 'ar' ? '←' : '→'}</span>` : '';
        return `${arrow}<span class="tag ltr-nums">${loc.label[L]}${loc.year ? ` (${loc.year})` : ''}</span>`;
      }).join('');
    }

    const grid = document.getElementById('locations-grid');
    if (grid) {
      grid.innerHTML = data.locations.map((loc, i) => `
        <div class="card reveal reveal-delay-${Math.min(i + 1, 4)}" id="loc-card-${loc.id}">
          ${loc.image ? `<img src="${loc.image}" alt="${loc.label[L]}" style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--radius-sm);margin-block-end:1rem;">` : ''}
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <h3 class="heading-sm">${loc.label[L]}</h3>
            ${loc.year ? `<span class="tag ltr-nums">${loc.year}</span>` : ''}
          </div>
          <p class="text-muted" style="margin-block-start:0.5rem;">${loc.description[L]}</p>
          ${!loc.documented ? `<a href="suggestions.html" class="btn btn--outline btn--sm" style="margin-block-start:1rem;">${L === 'ar' ? 'أضف هذه المعلومة' : 'Add this information'}</a>` : ''}
        </div>`).join('');
      grid.querySelectorAll('img').forEach((img) => img.classList.add('is-loaded'));
      grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    }
  }

  render();
  document.addEventListener('langchange', render);
})();
