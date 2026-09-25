import { track, trackOnce } from '../analytics.js';

/**
 * Booking uses the existing Google Calendar appointment schedule (Deins Ulmanis,
 * "Discovery Call", 30 min). Every booking CTA is a plain link to it, so booking
 * works without JavaScript. With JavaScript the schedule opens in a dialog and
 * the visitor keeps their place on the page.
 *
 * Google's embed does not tell the host page when a booking is confirmed, so a
 * completed booking cannot be tracked from here (see README, Analytics).
 */
const EMBED_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2qt7Yk5pjd4beD8UsAZc1Nl4TwkSqc3cMoH4HbjxGi8MoDRUPfAH32a7y6Oa2SuypSIKBZiWNA?gv=true';
const SLOW_LOAD_MS = 8000;

function recordStart(trigger, method) {
  trackOnce('staffing_booking_started', { cta_location: trigger.dataset.booking || 'unknown', method });
}

export function initBooking(dialog) {
  const canUseDialog = Boolean(dialog) && typeof dialog.showModal === 'function';
  let frame;

  function loadFrame() {
    const body = dialog.querySelector('[data-booking-frame]');
    const status = dialog.querySelector('[data-booking-status]');
    frame = document.createElement('iframe');
    frame.title = 'Choose a time for a discovery call with ScaleLab AI (Google Calendar)';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    const slow = window.setTimeout(() => {
      dialog.classList.add('is-slow');
      status.textContent = 'Still loading. You can also open the booking page in a new tab below.';
      track('staffing_booking_embed_slow');
    }, SLOW_LOAD_MS);
    frame.addEventListener('load', () => {
      window.clearTimeout(slow);
      dialog.classList.remove('is-slow');
      dialog.classList.add('is-loaded');
      status.textContent = '';
    }, { once: true });
    frame.src = EMBED_URL;
    body.append(frame);
  }

  document.querySelectorAll('[data-booking]').forEach((trigger) => {
    if (canUseDialog) trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', (event) => {
      // Modified clicks keep the link's own behaviour: the schedule in a new tab.
      const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!canUseDialog || modified) {
        recordStart(trigger, 'new_tab');
        return;
      }
      event.preventDefault();
      if (!frame) loadFrame();
      dialog.showModal();
      recordStart(trigger, 'dialog');
    });
  });

  if (!canUseDialog) return;
  dialog.querySelector('[data-booking-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-booking-newtab]').addEventListener('click', () => track('staffing_booking_open_new_tab'));
  // Native <dialog> handles Escape, focus containment and focus return; this adds backdrop dismissal.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close();
  });
}
