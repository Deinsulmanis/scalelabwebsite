/* ============================
   SCALELAB AI — JAVASCRIPT
   ============================ */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ANALYTICS — GA4 via the gtag snippet in <head>. Events carry no personal data.
function trackAnalyticsEvent(eventName, eventParameters = {}) {
  if (typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', eventName, eventParameters);
  } catch {
    // Analytics must never break the page.
  }
}

const sentOnce = new Set();
function trackOnce(key, eventName, eventParameters) {
  if (sentOnce.has(key)) return;
  sentOnce.add(key);
  trackAnalyticsEvent(eventName, eventParameters);
}

// Runs `callback` once, after `element` has been at least half visible for one second.
function whenSeen(element, callback) {
  if (!('IntersectionObserver' in window)) return;
  let timer;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      timer = setTimeout(() => { observer.disconnect(); callback(); }, 1000);
    } else {
      clearTimeout(timer);
    }
  }, { threshold: 0.5 });
  observer.observe(element);
}

// NAV SCROLL STATE
const nav = document.getElementById('nav');
function updateNav() { nav.classList.toggle('scrolled', window.scrollY > 20); }
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// MOBILE MENU
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('primaryNavigation');
function setMenu(open) {
  navLinks.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
}
navToggle.addEventListener('click', () => setMenu(navToggle.getAttribute('aria-expanded') !== 'true'));
navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    navToggle.focus();
  }
});
window.addEventListener('resize', () => { if (window.innerWidth > 960) setMenu(false); });

// SCROLL REVEAL — watches .sl-reveal and adds .is-visible
if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.sl-reveal').forEach((el) => revealObserver.observe(el));
} else {
  document.querySelectorAll('.sl-reveal').forEach((el) => el.classList.add('is-visible'));
}

// BOOKING CTAs — every "Book a Strategy Call" is a plain link to the Google Calendar
// appointment page (works without JavaScript). Each click sends the existing
// strategy_call_click event (kept so earlier GA4 reports stay comparable) plus a
// location-specific booking event.
const BOOKING_EVENTS = {
  nav: 'nav_booking_click',
  hero: 'hero_booking_click',
  after_proof: 'midpage_booking_click',
  after_process: 'midpage_booking_click',
  final_cta: 'final_booking_click',
  footer: 'final_booking_click',
};
document.querySelectorAll('[data-booking-cta]').forEach((link) => {
  link.addEventListener('click', () => {
    const location = link.dataset.bookingCta;
    trackAnalyticsEvent('strategy_call_click', { cta_location: location });
    trackAnalyticsEvent(BOOKING_EVENTS[location] || 'midpage_booking_click', { cta_location: location });
  });
});

// SOLUTIONS — which outcome a visitor explores (once per link per page load).
document.querySelectorAll('[data-solution]').forEach((link) => {
  link.addEventListener('click', () => {
    trackOnce(`solution:${link.dataset.solution}`, 'solution_section_interaction', { solution: link.dataset.solution });
  });
});

// INFRASTRUCTURE BREAKDOWNS — cards rendered from window.SCALELAB_CREATIVES (creatives.js).
const CREATIVE_DIAGRAMS = {
  // Stacked layers: targeting → sending.
  stack: `<svg class="creative-diagram" viewBox="0 0 320 180" fill="none" aria-hidden="true">
      <g stroke="rgba(0,212,255,0.55)" stroke-width="1">
        <rect x="70" y="16" width="180" height="24" rx="6"/><rect x="70" y="52" width="180" height="24" rx="6"/>
        <rect x="70" y="88" width="180" height="24" rx="6"/><rect x="70" y="124" width="180" height="24" rx="6" stroke="#00D4FF"/>
      </g>
      <g fill="#00D4FF"><circle cx="86" cy="28" r="3"/><circle cx="86" cy="64" r="3"/><circle cx="86" cy="100" r="3"/><circle cx="86" cy="136" r="3"/></g>
      <g stroke="rgba(0,212,255,0.25)" stroke-width="6" stroke-linecap="round"><path d="M100 28h80M100 64h110M100 100h64M100 136h96"/></g>
      <path d="M260 28v108" stroke="rgba(0,212,255,0.4)" stroke-dasharray="3 4"/>
    </svg>`,
  // Replies branching into qualified / not now / opt-out, one path to a calendar.
  reply: `<svg class="creative-diagram" viewBox="0 0 320 180" fill="none" aria-hidden="true">
      <rect x="20" y="74" width="64" height="32" rx="6" stroke="rgba(0,212,255,0.55)"/>
      <g stroke="rgba(0,212,255,0.4)"><path d="M84 90h32M116 90c20 0 20-52 44-52M116 90h44M116 90c20 0 20 52 44 52"/></g>
      <g stroke="rgba(0,212,255,0.4)"><rect x="160" y="24" width="60" height="28" rx="6" stroke="#00D4FF"/><rect x="160" y="76" width="60" height="28" rx="6"/><rect x="160" y="128" width="60" height="28" rx="6"/></g>
      <path d="M220 38h36" stroke="#00D4FF"/>
      <rect x="256" y="18" width="44" height="40" rx="6" stroke="#00D4FF"/>
      <path d="M256 30h44" stroke="#00D4FF"/><circle cx="278" cy="44" r="4" fill="#00D4FF"/>
      <g fill="rgba(0,212,255,0.3)"><rect x="30" y="86" width="44" height="8" rx="4"/></g>
    </svg>`,
  // Five connected stages with a feedback loop.
  system: `<svg class="creative-diagram" viewBox="0 0 320 180" fill="none" aria-hidden="true">
      <path d="M40 80h240" stroke="rgba(0,212,255,0.5)"/>
      <path d="M40 92c0 50 240 50 240 0" stroke="rgba(0,212,255,0.35)" stroke-dasharray="3 4"/>
      <g stroke="#00D4FF" fill="#010810"><circle cx="40" cy="80" r="10"/><circle cx="100" cy="80" r="10"/><circle cx="160" cy="80" r="10"/><circle cx="220" cy="80" r="10"/><circle cx="280" cy="80" r="10"/></g>
      <g fill="#00D4FF"><circle cx="40" cy="80" r="4"/><circle cx="100" cy="80" r="4"/><circle cx="160" cy="80" r="4"/><circle cx="220" cy="80" r="4"/><circle cx="280" cy="80" r="4"/></g>
      <g fill="rgba(0,212,255,0.3)"><rect x="24" y="44" width="32" height="6" rx="3"/><rect x="84" y="44" width="32" height="6" rx="3"/><rect x="144" y="44" width="32" height="6" rx="3"/><rect x="204" y="44" width="32" height="6" rx="3"/><rect x="264" y="44" width="32" height="6" rx="3"/></g>
    </svg>`,
};
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderCreative(item) {
  const media = item.media && item.media.src ? item.media : null;
  const card = document.createElement('article');
  card.className = 'creative-card sl-reveal is-visible';
  card.dataset.creativeId = item.id;

  let frame;
  if (!media) {
    frame = `<div class="creative-frame">
        <span class="creative-status">In preparation</span>
        ${CREATIVE_DIAGRAMS[item.diagram] || CREATIVE_DIAGRAMS.system}
      </div>`;
  } else if (media.type === 'image') {
    const image = `<img src="${escapeHTML(media.src)}" alt="${escapeHTML(media.alt || item.title)}" loading="lazy" decoding="async" />`;
    frame = `<div class="creative-frame">${media.href
      ? `<a href="${escapeHTML(media.href)}" target="_blank" rel="noopener" data-creative-click>${image}<span class="sr-only"> (opens in a new tab)</span></a>`
      : image}</div>`;
  } else {
    // Video or embed: show the poster with a play button; nothing heavy loads until play.
    frame = `<div class="creative-frame">
        <span class="creative-status creative-status--live">Watch</span>
        ${media.poster ? `<img src="${escapeHTML(media.poster)}" alt="" loading="lazy" decoding="async" />` : CREATIVE_DIAGRAMS[item.diagram] || ''}
        <button type="button" class="creative-play" data-creative-play aria-label="Play: ${escapeHTML(media.label || item.title)}"><span>${PLAY_ICON}</span></button>
        ${item.duration ? `<span class="creative-duration">${escapeHTML(item.duration)}</span>` : ''}
      </div>`;
  }

  const cta = item.cta && item.cta.href
    ? `<a class="text-link" href="${escapeHTML(item.cta.href)}" target="_blank" rel="noopener" data-creative-click>${escapeHTML(item.cta.label || 'Watch')} <span aria-hidden="true">↗</span></a>`
    : '';

  card.innerHTML = `${frame}
    <div class="creative-body">
      <p class="creative-kicker mono">${escapeHTML(item.kicker)}</p>
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.description)}</p>
      ${cta}
    </div>`;

  if (!media) return card;

  const params = { creative_id: item.id };
  whenSeen(card, () => trackOnce(`creative_view:${item.id}`, 'creative_view', params));
  card.querySelectorAll('[data-creative-click]').forEach((link) => {
    link.addEventListener('click', () => trackAnalyticsEvent('creative_click', params));
  });
  const play = card.querySelector('[data-creative-play]');
  if (play) {
    play.addEventListener('click', () => {
      const frameEl = card.querySelector('.creative-frame');
      let player;
      if (media.type === 'embed') {
        player = document.createElement('iframe');
        const url = new URL(media.src, location.href);
        url.searchParams.set('autoplay', '1');
        player.src = url.href;
        player.title = media.label || item.title;
        player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        player.allowFullscreen = true;
      } else {
        player = document.createElement('video');
        player.src = media.src;
        if (media.poster) player.poster = media.poster;
        player.controls = true;
        player.playsInline = true;
        player.setAttribute('aria-label', media.label || item.title);
      }
      frameEl.querySelectorAll('img, svg.creative-diagram, .creative-play, .creative-status, .creative-duration').forEach((node) => node.remove());
      frameEl.append(player);
      if (player.tagName === 'VIDEO') player.play().catch(() => {});
      player.focus();
      trackOnce(`creative_play:${item.id}`, 'creative_play', params);
    });
  }
  return card;
}

const creativeGrid = document.getElementById('creativeGrid');
if (creativeGrid && Array.isArray(window.SCALELAB_CREATIVES)) {
  creativeGrid.replaceChildren(...window.SCALELAB_CREATIVES.filter((item) => item && item.id && item.title).map(renderCreative));
}

// LIVE TIME IN THE WORKFLOW DEMONSTRATION
const liveTime = document.getElementById('liveTime');
function updateLiveTime() {
  const now = new Date();
  liveTime.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}
if (liveTime) {
  updateLiveTime();
  setInterval(updateLiveTime, 1000);
}

// CONTACT FORM (Formspree). Sends a message; it does not book a call.
const form    = document.getElementById('contactForm');
const success = document.getElementById('formSuccess');
const error   = document.getElementById('formError');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = 'Sending...';
  btn.disabled = true;
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
      trackAnalyticsEvent('generate_lead');
      setTimeout(() => success.classList.remove('visible'), 6000);
    })
    .catch(() => {
      error.classList.add('visible');
      setTimeout(() => error.classList.remove('visible'), 8000);
    })
    .finally(() => {
      btn.textContent = 'Send Message';
      btn.disabled = false;
    });
});

// SMOOTH SCROLL — CSS scroll-padding-top accounts for the sticky nav.
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    history.pushState(null, '', href);
  });
});

// Keep the footer current without requiring annual content edits.
const currentYear = document.getElementById('currentYear');
if (currentYear) currentYear.textContent = new Date().getFullYear();
