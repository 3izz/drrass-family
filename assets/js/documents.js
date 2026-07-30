/**
 * documents.js — renders the document archive list from documents.json.
 * No real PDF files are bundled with this template, so Preview/Download
 * open an explanatory modal instead of a broken link.
 */
(function () {
  'use strict';

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  const modal = document.getElementById('doc-modal');
  const modalContent = document.getElementById('doc-modal-content');

  function openDocModal(doc) {
    const L = lang();
    modalContent.innerHTML = `
      <h3 class="heading-sm">${doc.title[L]}</h3>
      <p class="text-muted" style="margin-block-start:0.75rem;">${doc.description[L]}</p>
      <p class="text-muted" style="margin-block-start:1rem;font-size:0.85rem;">
        ${L === 'ar' ? 'لم يتم رفع الملف الأصلي بعد لهذه المنصة.' : 'The original file has not been uploaded to this platform yet.'}
      </p>
      <a href="suggestions.html" class="btn btn--gold btn--sm" style="margin-block-start:1rem;">${L === 'ar' ? 'ساعدنا برفعه' : 'Help us add it'}</a>
    `;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  async function render() {
    const docs = await DataLoader.loadJSON('assets/data/documents.json');
    if (!docs) return;
    const L = lang();
    const list = document.getElementById('doc-list');
    list.innerHTML = docs.map((doc, i) => `
      <div class="doc-row reveal reveal-delay-${Math.min(i % 4, 3)}" data-index="${i}">
        <div class="doc-row__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/></svg>
        </div>
        <div class="doc-row__meta">
          <div class="doc-row__title">${doc.title[L]}</div>
          <div class="doc-row__sub">${doc.category[L]} · <span class="ltr-nums">${doc.year}</span> · ${doc.pages} ${L === 'ar' ? 'صفحة' : 'pages'}</div>
        </div>
        <div class="doc-row__actions">
          <button class="btn btn--outline btn--sm doc-preview-btn" data-index="${i}">${L === 'ar' ? 'معاينة' : 'Preview'}</button>
          <button class="btn btn--gold btn--sm doc-download-btn" data-index="${i}">${L === 'ar' ? 'تحميل' : 'Download'}</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.doc-preview-btn, .doc-download-btn').forEach((btn) => {
      btn.addEventListener('click', () => openDocModal(docs[parseInt(btn.dataset.index, 10)]));
    });

    document.querySelectorAll('.reveal').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) el.classList.add('is-visible');
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.2 });
    document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => io.observe(el));
  }

  render();
  document.addEventListener('langchange', render);
})();
