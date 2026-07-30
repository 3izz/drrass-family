/**
 * about.js — builds the generational timeline on the About page directly
 * from family.json. We describe generations by depth/count rather than
 * invented calendar years, since the source data has no real dates.
 */
(function () {
  'use strict';

  const LABELS_AR = ['الجذر الأول', 'الجيل الثاني', 'الجيل الثالث', 'الجيل الرابع', 'الجيل الخامس', 'الجيل السادس', 'الجيل السابع', 'الجيل الثامن', 'الجيل التاسع', 'الجيل العاشر'];
  const LABELS_EN = ['The Founding Root', '2nd Generation', '3rd Generation', '4th Generation', '5th Generation', '6th Generation', '7th Generation', '8th Generation', '9th Generation', '10th Generation'];

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  async function render() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const byGen = {};
    data.members.forEach((m) => {
      const g = m.generation || 1;
      byGen[g] = (byGen[g] || 0) + 1;
    });
    const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b);
    const L = lang();
    const timeline = document.getElementById('about-timeline');
    if (!timeline) return;

    timeline.innerHTML = gens.map((g) => {
      const label = L === 'ar' ? (LABELS_AR[g - 1] || `الجيل ${g}`) : (LABELS_EN[g - 1] || `Generation ${g}`);
      const count = byGen[g];
      const desc = L === 'ar'
        ? `يضم هذا الجيل ${count} فردًا موثّقًا في شجرة العائلة.`
        : `This generation includes ${count} documented members in the family tree.`;
      return `
        <div class="timeline__item reveal">
          <span class="timeline__dot"></span>
          <div class="timeline__year ltr-nums">G${g}</div>
          <h3 class="timeline__title">${label}</h3>
          <p class="timeline__desc">${desc}</p>
        </div>`;
    }).join('');

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
      }, { threshold: 0.2 });
      timeline.querySelectorAll('.timeline__item').forEach((el) => io.observe(el));
    } else {
      timeline.querySelectorAll('.timeline__item').forEach((el) => el.classList.add('is-visible'));
    }

    const heroImg = document.querySelector('.intro-split__media img');
    if (heroImg) FamilyAvatar.lazyMount(heroImg);
  }

  render();
  document.addEventListener('langchange', render);
})();
