/**
 * Staffing funnel events. The GA4 tag (same property as scalelabai.ca) is
 * bootstrapped in index.html and only loads on the production hostname. Off
 * production — local dev, QA runs, deploy previews — gtag() calls still queue
 * into window.dataLayer, which tools/check.mjs inspects, but nothing is sent.
 * No personal data is attached to any event.
 */
const sent = new Set();

export function track(name, params = {}) {
  if (typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, { funnel: 'staffing', ...params });
  } catch {
    // Analytics must never break the page.
  }
}

/** Sends an event at most once per page load, however often the trigger repeats. */
export function trackOnce(name, params = {}, key = name) {
  if (sent.has(key)) return;
  sent.add(key);
  track(name, params);
}

/** Sends a once-per-load event when `share` of the element (or of the viewport, if taller) is visible. */
export function trackWhenVisible(element, name, share = 0.5) {
  if (!element || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const visible = entry.intersectionRect.height / Math.min(entry.boundingClientRect.height, window.innerHeight);
      if (visible >= share) {
        trackOnce(name);
        observer.disconnect();
      }
    });
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
  observer.observe(element);
}
