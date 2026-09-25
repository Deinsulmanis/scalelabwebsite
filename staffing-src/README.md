# Staffing landing page source

Source for **https://scalelabai.ca/staffing/**, the ScaleLab AI landing page for industrial staffing agencies. Plain HTML, CSS and JavaScript, bundled with Vite. There is no framework and no client-side routing.

## How it relates to the live site

| Folder | What it is |
|---|---|
| `staffing-src/` (this folder) | The source. It is not served on the live site. |
| `staffing/` | The generated production build that Netlify serves at `/staffing/`. Don't edit it by hand. |

Netlify publishes this repository's root from `main` with no build step, so the live page is exactly what's committed in `staffing/`. Regenerate `staffing/` from this folder and commit both together.

## Local development

Requires Node.js 20.19+ or 22.12+. In PowerShell, use `npm.cmd` instead of `npm` if script execution is restricted.

```sh
npm ci
npm run dev -- --port 5173 --strictPort    # http://127.0.0.1:5173/
```

## Build and verify

```sh
npm run build:site     # writes the production build into ../staffing (asset URLs prefixed with /staffing/)
npm run verify:site    # builds into a temporary folder and fails unless it matches ../staffing byte for byte
```

`verify:site` shows that the committed `staffing/` was built from the committed source. Both folders are kept with LF line endings (see the repository's `.gitattributes`) so builds match on every platform.

## QA

```sh
npm run build                                  # dist/, used by the local preview
npm run preview -- --port 4173 --strictPort    # http://127.0.0.1:4173/staffing/
npm run check                                  # Playwright + axe against the local preview (headless Edge)
```

`tools/check.mjs` covers copy rules, layout at 1440, 1024, 768, 390 and 360px (overflow, 44px tap targets, heading order, WCAG 2.1 A/AA automated checks), the main journeys (booking dialog, video playback and end screen, FAQ, calls to action), analytics event counts, no-JavaScript behaviour, the video failure state and a throttled mobile load. Results and screenshots go to `docs/qa/`, which isn't committed.

```sh
npm run test:unit            # session, collector batching and video-progress rules
npm run build
npm run check:attribution    # link-token handling, sessions, first-party events, internal/debug modes
```

`tools/attribution-check.mjs` serves the build as `https://scalelabai.ca/staffing/` with the GA tag stubbed and the collector replaced by a recorder, so the production-only paths run without sending anything.

`tools/live-check.mjs` runs read-only checks against the live page after a deploy. It switches off GA measurement, blocks analytics collection requests and never books a slot.

## Analytics

### GA4 (aggregate)

The page uses GA4 with the content group `staffing`. The tag loads only on `scalelabai.ca` and `www.scalelabai.ca`, so local development, previews and QA runs send nothing. Every event carries `funnel: staffing`. No event carries personal data or a link identifier, and `page_location` is always the cleaned URL.

| Event | When |
|---|---|
| `staffing_page_view` | Once per page load |
| `staffing_hero_cta_click` | Once per hero call to action per load (`cta`: `see_how_it_works`, `book_call`) |
| `staffing_video_impression` | Half the video in view for one second, once |
| `staffing_video_play` | Video frames actually playing (not just requested), once |
| `staffing_video_25` / `_50` / `_75` | That share of the video actually watched, once each. Seeking or dragging through it counts nothing. |
| `staffing_video_complete` | 95% watched, or ended after 90% watched, once |
| `staffing_video_error` | Video failed to load, once |
| `staffing_qualified_meeting_section_view` | Half the qualification card in view for one second, once |
| `staffing_final_cta_click` | Once per load |
| `staffing_booking_started` | First booking call to action per load (`cta_location`, `method`). Historical name: this is a click, not a booking. |
| `staffing_booking_open_new_tab` | Fallback link in the booking dialog |
| `staffing_booking_embed_slow` | Booking embed not loaded after 8 seconds |

### Outreach links (first party)

ScaleLab's outreach emails can link to `/staffing/?t=<token>`, where the token is opaque and random. The first script on the page removes it from the address bar before GA4 starts. It keeps it only in that tab's `sessionStorage`, and the page never shows or logs it.

Only a tab that arrived with a token sends measurement events, same-origin to `/staffing/api/lp` (best-effort, batched, no retries). A browser marked internal by ScaleLab also sends them. Visitors without a token send nothing there.

The events are:
- `page_load`, `visible`, `engaged_10s`;
- `interaction` (trusted pointer, touch, key or wheel input), `scroll_input`, `scroll_depth`;
- `video_visible`, `video_playing`, `video_25` / `_50` / `_75`, `video_complete`;
- `meeting_section_visible`;
- `booking_cta_click`, `booking_dialog_open`, `booking_embed_loaded`, `booking_new_tab`;
- `page_summary`.

A scripted or instant scroll is never counted as input.

Google's appointment-schedule embed doesn't tell the page when a booking is confirmed, so completed bookings aren't measured in the browser.

## Booking

Every booking call to action is a plain link to the Google Calendar appointment schedule, so booking works without JavaScript. With JavaScript, the schedule opens in a dialog and the iframe is created on first click. If the schedule changes, update the short link in `index.html` and the schedule ID in `src/components/booking.js` and `tools/check.mjs`.

## Files

- `index.html`: copy, metadata, FAQ structured data, the booking dialog, and the first `<head>` script: link-token removal, internal/debug switches and the GA4 bootstrap.
- `src/styles.css`: design tokens (see `docs/DESIGN-SYSTEM.md`), components and responsive rules.
- `src/main.js`: wires analytics, attribution, booking, the video and scroll reveals.
- `src/analytics.js`: `track`, `trackOnce` (GA4).
- `src/attribution/`: first-party sessions, event collection, dwell-based visibility, watched-time video progress and the debug panel.
- `src/components/booking.js`: booking links, the scheduling dialog and booking events.
- `src/components/explainer-video.js`: click-to-play explainer, playback events, end screen and failure state.
- `public/media/`: the 70-second explainer video and its poster frame. To change the video, publish it under a new filename and update the `<source>` in `index.html`.
- `docs/`: design reference and SEO notes.
