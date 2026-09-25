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

`tools/live-check.mjs` runs read-only checks against the live page after a deploy. It switches off GA measurement, blocks analytics collection requests and never books a slot.

## Analytics

The page uses GA4 with the content group `staffing`. The tag loads only on `scalelabai.ca` and `www.scalelabai.ca`, so local development, previews and QA runs send nothing. Every event carries `funnel: staffing`, and no event carries personal data.

| Event | When |
|---|---|
| `staffing_page_view` | Once per page load |
| `staffing_hero_cta_click` | Once per hero call to action per load (`cta`: `see_how_it_works`, `book_call`) |
| `staffing_video_impression` | Half the video in view, once |
| `staffing_video_play` | First play, once |
| `staffing_video_25` / `_50` / `_75` | Playback progress reached, once each |
| `staffing_video_complete` | Video ended, once |
| `staffing_video_error` | Video failed to load, once |
| `staffing_qualified_meeting_section_view` | Half the qualification card in view, once |
| `staffing_final_cta_click` | Once per load |
| `staffing_booking_started` | First booking call to action opened per load (`cta_location`, `method`) |
| `staffing_booking_open_new_tab` | Fallback link in the booking dialog |
| `staffing_booking_embed_slow` | Booking embed not loaded after 8 seconds |

Google's appointment-schedule embed doesn't tell the page when a booking is confirmed, so completed bookings aren't measured in the browser.

## Booking

Every booking call to action is a plain link to the Google Calendar appointment schedule, so booking works without JavaScript. With JavaScript, the schedule opens in a dialog and the iframe is created on first click. If the schedule changes, update the short link in `index.html` and the schedule ID in `src/components/booking.js` and `tools/check.mjs`.

## Files

- `index.html`: copy, metadata, FAQ structured data, GA4 bootstrap and the booking dialog.
- `src/styles.css`: design tokens (see `docs/DESIGN-SYSTEM.md`), components and responsive rules.
- `src/main.js`: wires analytics, booking, the video and scroll reveals.
- `src/analytics.js`: `track`, `trackOnce`, `trackWhenVisible`.
- `src/components/booking.js`: booking links and the scheduling dialog.
- `src/components/explainer-video.js`: click-to-play explainer, progress events, end screen and failure state.
- `public/media/`: the 70-second explainer video and its poster frame. To change the video, publish it under a new filename and update the `<source>` in `index.html`.
- `docs/`: design reference and SEO notes.
