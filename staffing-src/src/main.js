import { trackOnce, trackWhenVisible } from './analytics.js';
import { initBooking } from './components/booking.js';
import { ExplainerVideo } from './components/explainer-video.js';

trackOnce('staffing_page_view');

initBooking(document.querySelector('#booking-dialog'));
document.querySelectorAll('[data-explainer]').forEach((root) => new ExplainerVideo(root));
trackWhenVisible(document.querySelector('#qualified-meeting'), 'staffing_qualified_meeting_section_view', 0.5);

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
