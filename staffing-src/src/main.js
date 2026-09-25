import { trackOnce } from './analytics.js';
import { startAttribution } from './attribution/index.js';
import { whenVisibleFor } from './attribution/visibility.js';
import { initBooking } from './components/booking.js';
import { ExplainerVideo } from './components/explainer-video.js';

// First-party attribution (tokened or internal tabs on the production host only;
// inert otherwise). GA4 events below are aggregate and carry no identifiers.
const attribution = startAttribution();

trackOnce('staffing_page_view');

initBooking(document.querySelector('#booking-dialog'), attribution);
document.querySelectorAll('[data-explainer]').forEach((root) => new ExplainerVideo(root, attribution));

// The qualification card counts as seen at half visible for one second, once.
whenVisibleFor(document.querySelector('#qualified-meeting'), { share: 0.5, ms: 1000 }, () => {
  trackOnce('staffing_qualified_meeting_section_view');
  attribution.once('meeting_section_visible');
});

// CTA clicks: one event per CTA per page load. Booking starts are recorded in booking.js.
document.addEventListener('click', (event) => {
  const cta = event.target.closest('[data-track]');
  if (!cta) return;
  const { track: name, trackCta: ctaName } = cta.dataset;
  trackOnce(name, ctaName ? { cta: ctaName } : {}, `${name}:${ctaName || ''}`);
});

// Presentation only: reveal content once as it scrolls into view.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  document.querySelectorAll('.reveal').forEach((element) => {
    element.classList.add('reveal-ready');
    observer.observe(element);
  });
}
