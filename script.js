/* ============================
   SCALELAB AI — JAVASCRIPT
   ============================ */

// LOADER
(function () {
  const loader = document.getElementById('loader');
  document.body.style.overflow = 'hidden';
  setTimeout(() => loader.classList.add('phase2'), 1800);
  setTimeout(() => { loader.classList.add('exit'); document.body.style.overflow = ''; }, 2700);
  setTimeout(() => loader.remove(), 3400);
})();

// CUSTOM CURSOR — lerp trailing blob + crisp pixel-locked dot
(function () {
  if (matchMedia('(hover: none)').matches) return;
  const cursor = document.querySelector('.sl-cursor');
  const dot    = document.querySelector('.sl-cursor-dot');
  if (!cursor || !dot) return;

  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
  const lerp = (a, b, t) => a + (b - a) * t;

  window.addEventListener('mousemove', (e) => {
    targetX = e.clientX; targetY = e.clientY;
    dot.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
  }, { passive: true });

  (function tick() {
    currentX = lerp(currentX, targetX, 0.18);
    currentY = lerp(currentY, targetY, 0.18);
    cursor.style.transform = `translate3d(${currentX}px,${currentY}px,0)`;
    requestAnimationFrame(tick);
  })();

  document.addEventListener('mouseover', (e) => {
    const input   = e.target.closest('input, textarea');
    const primary = e.target.closest('.btn-primary');
    const ghost   = e.target.closest('.btn:not(.btn-primary), button:not(.btn-primary), a, .social-btn');
    const generic = e.target.closest('.service-card, .result-card');
    cursor.classList.remove('is-hover', 'is-hover-primary', 'is-hover-ghost', 'is-text');
    if      (input)   cursor.classList.add('is-text');
    else if (primary) cursor.classList.add('is-hover-primary');
    else if (ghost)   cursor.classList.add('is-hover-ghost');
    else if (generic) cursor.classList.add('is-hover');
  });

  window.addEventListener('mousedown', () => cursor.classList.add('is-down'));
  window.addEventListener('mouseup',   () => cursor.classList.remove('is-down'));
  document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; dot.style.opacity = '0'; });
  document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; dot.style.opacity = '1'; });
})();

// NAV SCROLL + SECTION-AWARE COLOR
const nav = document.getElementById('nav');
const sectionMap = [
  { selector: '.cta-strip',    cls: 'on-cta' },
  { selector: '.section--alt', cls: 'on-alt' },
];

function updateNav() {
  nav.classList.toggle('scrolled', window.scrollY > 20);
  const navBottom = nav.getBoundingClientRect().bottom + window.scrollY;
  let matched = null;
  for (const { selector, cls } of sectionMap) {
    document.querySelectorAll(selector).forEach(el => {
      const top = el.offsetTop, bot = top + el.offsetHeight;
      if (navBottom >= top && navBottom <= bot) matched = cls;
    });
  }
  nav.classList.toggle('on-alt', matched === 'on-alt');
  nav.classList.toggle('on-cta', matched === 'on-cta');
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// MOBILE MENU TOGGLE
const navToggle = document.getElementById('navToggle');
const navLinks  = document.querySelector('.nav-links');
navToggle.addEventListener('click', () => {
  const open = navLinks.style.display === 'flex';
  navLinks.style.cssText = open
    ? ''
    : 'display:flex;flex-direction:column;position:fixed;top:80px;left:0;right:0;background:rgba(2,13,24,0.97);backdrop-filter:blur(16px);padding:24px;gap:24px;border-bottom:1px solid rgba(0,212,255,0.12);z-index:99;';
});
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => { navLinks.style.cssText = ''; });
});

// SCROLL REVEAL — watches .sl-reveal and adds .is-visible
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

// Observe all elements that already have sl-reveal in HTML
document.querySelectorAll('.sl-reveal').forEach(el => revealObserver.observe(el));

// LIVE TIME IN TERMINAL
function updateLiveTime() {
  const el = document.getElementById('liveTime');
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
}
updateLiveTime();
setInterval(updateLiveTime, 1000);

// CONTACT FORM
const form    = document.getElementById('contactForm');
const success = document.getElementById('formSuccess');
const error   = document.getElementById('formError');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = 'Sending...';
  btn.disabled = true;
  btn.style.opacity = '0.7';
  error.classList.remove('visible');

  fetch(form.action, {
    method: 'POST',
    body: new FormData(form),
    headers: { 'Accept': 'application/json' }
  })
    .then((response) => {
      if (!response.ok) throw new Error('Form submission failed');
      form.reset();
      success.classList.add('visible');
      setTimeout(() => success.classList.remove('visible'), 6000);
    })
    .catch(() => {
      error.classList.add('visible');
      setTimeout(() => error.classList.remove('visible'), 8000);
    })
    .finally(() => {
      btn.textContent = 'Send Message →';
      btn.disabled = false;
      btn.style.opacity = '1';
    });
});

// SMOOTH SCROLL — account for nav height
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// COUNTER ANIMATION
function animateCounters() {
  document.querySelectorAll('.stat-num, .result-num').forEach(el => {
    const text = el.textContent.trim();
    const num  = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num === 0) return;
    const prefix   = text.match(/^[^0-9]*/)?.[0]  || '';
    const suffix   = text.match(/[^0-9.]+$/)?.[0] || '';
    const duration = 1200;
    const start    = performance.now();
    const update = (now) => {
      const t    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + (num < 10 ? (num * ease).toFixed(1) : Math.round(num * ease)) + suffix;
      if (t < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  });
}
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { animateCounters(); counterObserver.disconnect(); }
  });
}, { threshold: 0.3 });
const resultsGrid = document.querySelector('.results-grid');
if (resultsGrid) counterObserver.observe(resultsGrid);

// HERO CUBE PARALLAX
const heroCube = document.getElementById('heroCube');
if (heroCube) {
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth  - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    heroCube.style.transform = `translate(${x}px, ${y}px)`;
  }, { passive: true });
}

// CHAT WIDGET BRANDING — swap the assistant's header avatar for the ScaleLab hex mark
(function () {
  const HEX_LOGO = `
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="28,4 52,17 52,39 28,52 4,39 4,17" stroke="#00D4FF" stroke-width="1.5" fill="none"/>
      <polygon points="28,14 44,23 44,33 28,42 12,33 12,23" stroke="#00D4FF" stroke-width="1" fill="none" opacity="0.5"/>
      <line x1="4"  y1="17" x2="12" y2="23" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <line x1="52" y1="17" x2="44" y2="23" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <line x1="4"  y1="39" x2="12" y2="33" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <line x1="52" y1="39" x2="44" y2="33" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <line x1="28" y1="4"  x2="28" y2="14" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <line x1="28" y1="52" x2="28" y2="42" stroke="#00D4FF" stroke-width="1" opacity="0.6"/>
      <circle cx="28" cy="28" r="4"   fill="#00D4FF" opacity="0.9"/>
      <circle cx="28" cy="28" r="2"   fill="#ffffff"/>
      <circle cx="28" cy="4"  r="2.5" fill="#00D4FF"/>
      <circle cx="52" cy="17" r="2.5" fill="#00D4FF"/>
      <circle cx="52" cy="39" r="2.5" fill="#00D4FF"/>
      <circle cx="28" cy="52" r="2.5" fill="#00D4FF"/>
      <circle cx="4"  cy="39" r="2.5" fill="#00D4FF"/>
      <circle cx="4"  cy="17" r="2.5" fill="#00D4FF"/>
    </svg>`;

  function applyWidgetLogo() {
    const avatar = document.getElementById('sla-avatar');
    if (avatar && !avatar.dataset.slBranded) {
      avatar.innerHTML = HEX_LOGO;
      avatar.dataset.slBranded = 'true';
      return true;
    }
    return false;
  }

  if (!applyWidgetLogo()) {
    const observer = new MutationObserver(() => {
      if (applyWidgetLogo()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
