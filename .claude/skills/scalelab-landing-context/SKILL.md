---
name: scalelab-landing-context
description: Use when working in the scalelabwebsite repo on the staffing landing page (staffing-src/, staffing/), its GA4 tag, tracked outreach links (?t=), the /staffing/api/lp collector rule in netlify.toml, internal/debug marking, or the privacy disclosure. Explains that landing attribution spans this repo and SalesPipeline2, and pins the invariants that must hold.
---

# Staffing landing page: cross-repo context

The staffing landing page (`https://scalelabai.ca/staffing/`) **lives in this repo**. The source is in `staffing-src/`, and Netlify serves the committed build in `staffing/`. Link attribution **spans two repositories**:

- **This repo (scalelabwebsite):**
  - strips the token from the URL;
  - keeps the per-tab session;
  - sends allowlisted browser events;
  - handles internal and debug marking;
  - carries the signed forwarding rule and the privacy disclosure.
- **SalesPipeline2:**
  - issues tracked links in the send path;
  - owns the token keys and the collector (`POST /api/landing/e`);
  - handles signature verification, ingest, the reconciler, the Supabase `landing_*` schema and booking attribution;
  - hosts the Staffing Funnel dashboard.

**The authoritative detailed guide** is the SalesPipeline2 skill `.claude/skills/salespipeline2-landing-attribution/SKILL.md`, with its `references/`. Read it, and the current backend code, before changing anything that affects:
- tracked links or tokens;
- collector payloads or event names, which must match the backend's `EVENT_PROPS` allowlist exactly;
- the attribution schema, tiers or booking labels;
- signing or the forwarding rule;
- dashboard data.

Such changes usually need a matching SalesPipeline2 change and test.

## Non-negotiable invariants

1. **Strip the tracking token** (`?t=`) from the visible URL. The first `<head>` script does it with `history.replaceState`, before GA loads. Also strip the `#sl-mark` and `#sl-debug` fragments.
2. **GA must never receive the token or any lead identity.** That covers `page_location`, event params and the dataLayer. GA stays aggregate only, with no UTMs added for attribution.
3. **Browser events go only through the same-origin path** `/staffing/api/lp`. The Netlify rule forwards it, signed, to the SalesPipeline2 collector. Never call the backend directly from the browser.
4. **Unsigned, forged and deploy-preview requests must stay rejected.** The collector accepts only Netlify production-signed requests. Don't weaken the rule or the signing.
5. **Anonymous visitors** (no token, not a marked internal browser) must not create collector requests or tracked attribution.
6. **No signing secret belongs in browser code or this repo.** `netlify.toml` names the env var `LANDING_PROXY_SIGNING_SECRET`; its value lives only in Netlify's production environment and on Railway.
7. **Don't duplicate backend logic here.** SalesPipeline2 owns tiers, token hashing, identity resolution, booking labels and funnel metrics. The page only reports raw signals.
8. **Don't touch production tracking flags** (`LANDING_*` on Railway) or the Netlify env from website work unless explicitly asked.
9. **Keep events minimal and privacy-safe.**
   - Use allowlisted names and properties only.
   - Send no personal data, cookies or fingerprinting.
   - Treat scripted scrolls as jumps, never as input.
   - Never show or log the token, including in the debug panel and the console.
10. **If backend behaviour must change,** read the SalesPipeline2 landing-attribution skill and the current backend code first, then change both sides together.

## Website files involved

| File | Role |
|---|---|
| `staffing-src/index.html` | `<meta name="referrer" content="strict-origin">` plus the first inline script: token and fragment stripping, the internal and debug switches, the production-only GA4 bootstrap |
| `staffing-src/src/attribution/index.js` | `startAttribution()`: sessions, event emission, input and scroll signals, internal marking (`#sl-mark`), and a no-op for anonymous visitors |
| `staffing-src/src/attribution/session.js` | Per-tab `sessionStorage` session with a 30-minute idle rotation |
| `staffing-src/src/attribution/collector.js` | Batched, best-effort POST client with size limits and no retries |
| `staffing-src/src/attribution/visibility.js` | Dwell-based visibility (share of the element plus time in view) |
| `staffing-src/src/attribution/video-progress.js` | Watched-time milestones that ignore seeking |
| `staffing-src/src/attribution/debug-panel.js` | Debug panel for internal browsers only (never shows the token) |
| `staffing-src/src/main.js`, `src/analytics.js` | Wiring and aggregate GA4 helpers (`track`, `trackOnce`) |
| `staffing-src/src/components/booking.js`, `explainer-video.js` | Booking click, dialog and embed events; video events |
| `netlify.toml` | Signed rule `/staffing/api/lp` → collector; `/staffing-src/*` → 404 |
| `privacy-policy.html` | Disclosure of tracked email links and retention |
| `staffing/` | Generated build. Never edit by hand; regenerate with `npm run build:site`. |
| `staffing-src/README.md` | Analytics definitions and QA commands |

## Testing and deploying (from `staffing-src/`)

1. **Run the suite:**
   - `npm run test:unit`;
   - `npm run build`;
   - `LANDING_BACKEND_DIR=<SalesPipeline2 checkout> npm run check:attribution`, which validates payloads against the backend's own normalizer;
   - `npm run check` against `npm run preview -- --port 4173 --strictPort`;
   - `npm run build:site`, then `npm run verify:site`.
2. **Deploy:** open a pull request, which gets a Netlify deploy preview; the collector refuses preview requests by design. Netlify publishes production when the PR is merged to `main`.
3. **Check live after merge:** run `node tools/live-check.mjs`.
