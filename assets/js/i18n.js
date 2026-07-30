/**
 * i18n.js — bilingual (AR/EN) text + direction switching.
 * Elements opt in with data-i18n="key" (textContent) or
 * data-i18n-attr="placeholder:key1;title:key2" for attributes.
 * Language choice persists in localStorage.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'drrass:lang';

  const DICT = {
    // Brand / nav
    'brand.name': { ar: 'الدّراس', en: 'Al-Drrass' },
    'brand.tagline': { ar: 'من جذورٍ راسخة', en: 'Rooted Heritage' },
    'nav.home': { ar: 'الرئيسية', en: 'Home' },
    'nav.about': { ar: 'من نحن', en: 'About' },
    'nav.origin': { ar: 'أصل العائلة', en: 'Family Origin' },
    'nav.tree': { ar: 'شجرة العائلة', en: 'Family Tree' },
    'nav.gallery': { ar: 'معرض الصور', en: 'Gallery' },
    'nav.museum': { ar: 'المتحف الرقمي', en: 'Digital Museum' },
    'nav.documents': { ar: 'الوثائق', en: 'Documents' },
    'nav.news': { ar: 'الأخبار', en: 'News' },
    'nav.events': { ar: 'الفعاليات', en: 'Events' },
    'nav.births': { ar: 'المواليد', en: 'Births' },
    'nav.deaths': { ar: 'الوفيات', en: 'In Memoriam' },
    'nav.suggestions': { ar: 'اقتراحات', en: 'Suggestions' },
    'nav.contact': { ar: 'تواصل معنا', en: 'Contact' },

    // Hero
    'hero.title': { ar: 'الدّراس', en: 'Al-Drrass' },
    'hero.subtitle': { ar: 'من جذورٍ راسخة... نبني أجيالًا واعدة.', en: 'From deep-rooted origins... we build promising generations.' },
    'hero.cta': { ar: 'استكشف شجرة العائلة', en: 'Explore the Family Tree' },
    'hero.cta2': { ar: 'قصة العائلة', en: 'Our Story' },
    'hero.scroll': { ar: 'مرر للأسفل', en: 'Scroll' },

    // Common
    'common.readMore': { ar: 'اقرأ المزيد', en: 'Read More' },
    'common.viewAll': { ar: 'عرض الكل', en: 'View All' },
    'common.download': { ar: 'تحميل', en: 'Download' },
    'common.preview': { ar: 'معاينة', en: 'Preview' },
    'common.search': { ar: 'بحث', en: 'Search' },
    'common.all': { ar: 'الكل', en: 'All' },
    'common.close': { ar: 'إغلاق', en: 'Close' },
    'common.send': { ar: 'إرسال', en: 'Send' },
    'common.name': { ar: 'الاسم', en: 'Name' },
    'common.email': { ar: 'البريد الإلكتروني', en: 'Email' },
    'common.phone': { ar: 'رقم الهاتف', en: 'Phone' },
    'common.message': { ar: 'الرسالة', en: 'Message' },
    'common.submit': { ar: 'إرسال', en: 'Submit' },
    'common.loading': { ar: 'جارٍ التحميل...', en: 'Loading...' },
    'common.noResults': { ar: 'لا توجد نتائج', en: 'No results found' },

    // Footer
    'footer.tagline': { ar: 'منصة رقمية توثّق تاريخ عائلة الدّراس وتربط أجيالها عبر الزمن.', en: 'A digital platform documenting the Al-Drrass family history and connecting its generations across time.' },
    'footer.explore': { ar: 'استكشاف', en: 'Explore' },
    'footer.community': { ar: 'المجتمع', en: 'Community' },
    'footer.contact': { ar: 'تواصل', en: 'Get in Touch' },
    'footer.rights': { ar: 'جميع الحقوق محفوظة', en: 'All rights reserved' },

    'backToTop': { ar: 'العودة للأعلى', en: 'Back to top' },

    // Tree toolbar
    'tree.search.placeholder': { ar: 'ابحث بالاسم...', en: 'Search by name...' },
    'tree.compare': { ar: '🔗 حاسبة القرابة', en: '🔗 Kinship Calculator' },
    'tree.expandAll': { ar: 'فتح الكل', en: 'Expand All' },
    'tree.collapseAll': { ar: 'طي الكل', en: 'Collapse All' },
    'tree.print': { ar: '🖨️ طباعة', en: '🖨️ Print' },
    'tree.legend.root': { ar: 'الجذر', en: 'Root' },
    'tree.legend.a': { ar: 'اختيار (أ)', en: 'Selection (A)' },
    'tree.legend.b': { ar: 'اختيار (ب)', en: 'Selection (B)' },
    'tree.slot.first': { ar: 'اختر الفرد الأول', en: 'Select the first person' },
    'tree.slot.second': { ar: 'اختر الفرد الثاني', en: 'Select the second person' },
  };

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || 'ar';
  }

  function t(key, lang) {
    lang = lang || getLang();
    const entry = DICT[key];
    if (!entry) return key;
    return entry[lang] || entry.ar;
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key, lang);
    });

    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const spec = el.getAttribute('data-i18n-attr');
      spec.split(';').filter(Boolean).forEach((pair) => {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim(), lang));
      });
    });

    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lang === lang);
    });

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLang(lang);
  }

  function initI18n() {
    applyLang(getLang());
    document.querySelectorAll('.lang-switch__btn').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initI18n);
  } else {
    initI18n();
  }

  global.I18n = { t, getLang, setLang, applyLang };
})(window);
