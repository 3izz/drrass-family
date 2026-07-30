/**
 * main.js — site-wide chrome behaviour: loading screen, sticky nav,
 * mobile menu, scroll-reveal, counters, parallax, back-to-top.
 * Runs on every page; feature-specific logic lives in tree.js / gallery.js / etc.
 */
(function () {
  'use strict';

  /* ---- Loading screen ---- */
  window.addEventListener('load', () => {
    const loader = document.querySelector('.loader');
    if (loader) {
      setTimeout(() => loader.classList.add('is-hidden'), 350);
    }
  });

  /* ---- Sticky header ---- */
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- Mobile nav toggle ---- */
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  const navScrim = document.querySelector('.nav-scrim');
  function closeNav() {
    navToggle && navToggle.classList.remove('is-active');
    mainNav && mainNav.classList.remove('is-open');
    navScrim && navScrim.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const opening = !mainNav.classList.contains('is-open');
      navToggle.classList.toggle('is-active', opening);
      mainNav.classList.toggle('is-open', opening);
      navScrim && navScrim.classList.toggle('is-open', opening);
      document.body.style.overflow = opening ? 'hidden' : '';
    });
    navScrim && navScrim.addEventListener('click', closeNav);
    mainNav.querySelectorAll('.main-nav__link').forEach((l) => l.addEventListener('click', closeNav));
  }

  /* ---- Mark current nav link active ---- */
  const currentPage = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.main-nav__link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('is-active');
    }
  });

  /* ---- Scroll reveal via IntersectionObserver ---- */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---- Animated counters ---- */
  const counters = document.querySelectorAll('[data-counter]');
  if (counters.length) {
    const animateCounter = (el) => {
      const target = parseFloat(el.dataset.counter);
      const suffix = el.dataset.suffix || '';
      const duration = 1800;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased);
        el.textContent = value.toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };
    if ('IntersectionObserver' in window) {
      const cio = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            cio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      counters.forEach((el) => cio.observe(el));
    } else {
      counters.forEach(animateCounter);
    }
  }

  /* ---- Hero particles ---- */
  const particleField = document.querySelector('.hero__particles');
  if (particleField) {
    const count = window.innerWidth < 720 ? 16 : 34;
    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.style.left = Math.random() * 100 + '%';
      span.style.bottom = -(Math.random() * 20) + 'px';
      span.style.animationDuration = 8 + Math.random() * 14 + 's';
      span.style.animationDelay = Math.random() * 10 + 's';
      particleField.appendChild(span);
    }
  }

  /* ---- Parallax on scroll ---- */
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  if (parallaxEls.length) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      parallaxEls.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax) || 0.15;
        el.style.transform = `translateY(${y * speed}px)`;
      });
    }, { passive: true });
  }

  /* ---- Back to top ---- */
  const backToTop = document.querySelector('.back-to-top');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('is-visible', window.scrollY > 500);
    }, { passive: true });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---- Generic modal close-on-overlay / Escape ---- */
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.is-open, .lightbox.is-open').forEach((el) => {
        el.classList.remove('is-open');
      });
      document.body.style.overflow = '';
    }
  });
  document.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay, .lightbox');
      if (overlay) {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });
  });

  /* ---- Toast helper (shared) ---- */
  window.showToast = function (message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  };

  /* ---- Simple internal page transition veil ---- */
  document.querySelectorAll('a[href]:not([target]):not([href^="#"]):not([href^="http"]):not([href^="mailto"]):not([href^="tel"])').forEach((a) => {
    a.addEventListener('click', (e) => {
      const url = a.getAttribute('href');
      if (!url || url.startsWith('javascript:')) return;
      e.preventDefault();
      const veil = document.createElement('div');
      veil.className = 'page-veil is-active';
      document.body.appendChild(veil);
      setTimeout(() => { window.location.href = url; }, 320);
    });
  });
})();
