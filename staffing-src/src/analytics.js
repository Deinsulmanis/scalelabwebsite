/**
 * Staffing funnel events for GA4 (aggregate only). The tag is bootstrapped by the
 * first script in index.html and loads only on the production hostname, after any
 * link token has been removed from the URL. Off production — local dev, QA runs,
 * deploy previews — and in internal browsers outside debug mode, gtag() calls still
 * queue into window.dataLayer, which the QA tools inspect, but nothing is sent.
 * No personal data or link identifier is attached to any event.
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
