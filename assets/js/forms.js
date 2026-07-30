/**
 * forms.js — shared client-side behaviour for the Suggestions and Contact
 * forms: HTML5 validation, drag-and-drop file picker, a member-name
 * autocomplete sourced from family.json, and a simulated submit (no
 * backend exists in this static template — swap handleSubmit's body for
 * a real endpoint when one is available).
 */
(function () {
  'use strict';

  function wireForm(formId, successId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const success = document.getElementById(successId);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = (window.I18n && I18n.getLang() === 'en') ? 'Sending...' : 'جارٍ الإرسال...';

      setTimeout(() => {
        success.classList.add('is-visible');
        form.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        const fileList = document.getElementById('file-drop-list');
        if (fileList) fileList.textContent = '';
        window.showToast && showToast((window.I18n && I18n.getLang() === 'en') ? 'Thank you for your contribution!' : 'شكرًا لمساهمتك!');
      }, 700);
    });
  }

  function wireFileDrop() {
    const drop = document.getElementById('file-drop');
    const input = document.getElementById('sug-file');
    const list = document.getElementById('file-drop-list');
    if (!drop || !input) return;

    drop.addEventListener('click', () => input.click());
    ['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('is-dragover'); }));
    drop.addEventListener('drop', (e) => {
      input.files = e.dataTransfer.files;
      updateFileList();
    });
    input.addEventListener('change', updateFileList);

    function updateFileList() {
      const names = Array.from(input.files || []).map((f) => f.name);
      list.textContent = names.length ? names.join('، ') : '';
    }
  }

  async function wireMemberDatalist() {
    const datalist = document.getElementById('member-datalist');
    if (!datalist) return;
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const L = (window.I18n && I18n.getLang()) || 'ar';
    datalist.innerHTML = data.members.map((m) => `<option value="${m.name[L] || m.name.ar}">`).join('');
  }

  wireForm('suggestions-form', 'form-success');
  wireForm('contact-form', 'contact-success');
  wireFileDrop();
  wireMemberDatalist();
})();
