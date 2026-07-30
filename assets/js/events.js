/**
 * events.js — renders events.json as a chronological timeline (most recent first).
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  function formatDate(iso, L) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(L === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function render() {
    const events = await DataLoader.loadJSON('assets/data/events.json');
    if (!events) return;
    const L = lang();
    const sorted = [...events].sort((a, b) => new Date(b.date) - new Date(a.date));
    const timeline = document.getElementById('events-timeline');
    timeline.innerHTML = sorted.map((e) => `
      <div class="timeline__item reveal">
        <span class="timeline__dot"></span>
        <div class="timeline__year ltr-nums">${formatDate(e.date, L)}</div>
        <h3 class="timeline__title">${e.title[L]} <span class="tag" style="margin-inline-start:0.5rem;">${e.category[L]}</span></h3>
        <p class="timeline__desc">📍 ${e.location[L]}</p>
        <p class="timeline__desc" style="margin-block-start:0.4rem;">${e.description[L]}</p>
      </div>
    `).join('');

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    timeline.querySelectorAll('.timeline__item').forEach((el) => io.observe(el));
  }

  render();
  document.addEventListener('langchange', render);
})();
