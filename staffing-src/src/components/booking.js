import { track, trackOnce } from '../analytics.js';

/**
 * Booking uses the existing Google Calendar appointment schedule (Deins Ulmanis,
 * "Discovery Call", 30 min). Every booking CTA is a plain link to it, so booking
 * works without JavaScript. With JavaScript the schedule opens in a dialog and
 * the visitor keeps their place on the page.
 *
 * Measured separately, never conflated:
 *   booking_cta_click      a booking call to action was clicked
 *   booking_dialog_open    the scheduling dialog opened
 *   booking_embed_loaded   Google's schedule finished loading inside it
 *   booking_new_tab        the schedule was opened in a new tab instead
 * A booked meeting is NOT known here: Google's embed does not tell the host page
 * when a booking is confirmed. Completed bookings are attributed server-side
 * from the Google Calendar sync. (GA4 keeps its historical staffing_booking_started
 * name for the first booking call to action per page load.)
 */
const EMBED_URL = 'https://calendar.google.com/calendar/appointments/schedules/AcZssZ2qt7Yk5pjd4beD8UsAZc1Nl4TwkSqc3cMoH4HbjxGi8MoDRUPfAH32a7y6Oa2SuypSIKBZiWNA?gv=true';
const SLOW_LOAD_MS = 8000;
const CTA_LOCATIONS = ['nav', 'hero', 'video', 'video_end', 'final'];

function recordStart(trigger, method) {
  trackOnce('staffing_booking_started', { cta_location: trigger.dataset.booking || 'unknown', method });
}

const inert = { once() {}, oncePage() {}, trusted: () => ({}) };

export function initBooking(dialog, attribution = inert) {
  const canUseDialog = Boolean(dialog) && typeof dialog.showModal === 'function';
  const where = (trigger) => (CTA_LOCATIONS.includes(trigger.dataset.booking) ? trigger.dataset.booking : 'unknown');
  let frame;
  let openedFrom = 'unknown';

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
      attribution.once('booking_embed_loaded');
    }, { once: true });
    frame.src = EMBED_URL;
    body.append(frame);
  }

  document.querySelectorAll('[data-booking]').forEach((trigger) => {
    if (canUseDialog) trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', (event) => {
      const location = where(trigger);
      attribution.oncePage(`cta:${location}`, 'booking_cta_click', { cta_location: location }, attribution.trusted(event));
      // Modified clicks keep the link's own behaviour: the schedule in a new tab.
      const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!canUseDialog || modified) {
        recordStart(trigger, 'new_tab');
        attribution.oncePage(`new_tab:${location}`, 'booking_new_tab', { cta_location: location }, attribution.trusted(event));
        return;
      }
      event.preventDefault();
      if (!frame) loadFrame();
      dialog.showModal();
      openedFrom = location;
      recordStart(trigger, 'dialog');
      attribution.oncePage(`dialog:${location}`, 'booking_dialog_open', { cta_location: location });
    });
  });

  if (!canUseDialog) return;
  dialog.querySelector('[data-booking-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-booking-newtab]').addEventListener('click', (event) => {
    track('staffing_booking_open_new_tab');
    attribution.oncePage(`new_tab:fallback:${openedFrom}`, 'booking_new_tab', { cta_location: openedFrom }, attribution.trusted(event));
  });
  // Native <dialog> handles Escape, focus containment and focus return; this adds backdrop dismissal.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) dialog.close();
  });
}
