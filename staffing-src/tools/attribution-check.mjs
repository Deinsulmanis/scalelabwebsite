import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

// First-party attribution QA against the production build, served as
// https://scalelabai.ca/staffing/ (so the production-only paths run) with the GA
// tag stubbed and the collector replaced by a recorder. Run `npm run build` first.
//
// Optional: LANDING_BACKEND_DIR=<SalesPipeline2 checkout> also validates every
// captured payload with the real collector's schema check.

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const PAGE = 'https://scalelabai.ca/staffing/';
const COLLECTOR = 'https://scalelabai.ca/staffing/api/lp';
const GA_ID = 'G-MGQJVCVWFZ';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const token = () => randomBytes(16).toString('base64url');
const T1 = token();
const T2 = token();
const MARK_OK = `v1.${Math.floor(Date.now() / 1000) + 300}.${'n'.repeat(22)}.${'s'.repeat(43)}`;

let backendValidate = null;
if (process.env.LANDING_BACKEND_DIR) {
  const file = join(process.env.LANDING_BACKEND_DIR, 'integrations', 'landing-collector.js');
  if (existsSync(file)) backendValidate = createRequire(file)(file).normalizeCollectorRequest;
}

const results = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function serve(context, { markAccepts = MARK_OK, collectorFails = null } = {}) {
  const log = { requests: [], collector: [], ga: [], console: [], pageErrors: [] };
  context.on('request', (request) => log.requests.push(request));
  await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
    log.ga.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* gtag stub */' });
  });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://scalelabai.ca/staffing/**', async (route) => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/staffing\/?/, ''));
    if (!path || path.endsWith('/')) path += 'index.html';
    let body;
    try { body = await readFile(join(distDir, path)); } catch { return route.fulfill({ status: 404, body: '' }); }
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : body.length - 1;
      return route.fulfill({ status: 206, body: body.subarray(start, end + 1), contentType: TYPES[extname(path)],
        headers: { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Accept-Ranges': 'bytes' } });
    }
    return route.fulfill({ status: 200, body, contentType: TYPES[extname(path)] || 'application/octet-stream', headers: { 'Accept-Ranges': 'bytes' } });
  });
  // Registered last, so it wins over the static route above.
  await context.route(COLLECTOR, async (route) => {
    const request = route.request();
    const raw = request.postData() || '';
    let body = null;
    try { body = JSON.parse(raw); } catch { /* recorded as raw */ }
    log.collector.push({ raw, body, headers: await request.allHeaders() });
    if (collectorFails === 'abort') return route.abort('failed');
    if (collectorFails) return route.fulfill({ status: collectorFails, body: '' });
    if (body?.kind === 'mark' && body.code === markAccepts) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"marked":true}' });
    return route.fulfill({ status: 204, body: '' });
  });
  return log;
}

function watch(page, log) {
  page.on('console', (message) => log.console.push(message.text()));
  page.on('pageerror', (error) => log.pageErrors.push(error.message));
}

const events = (log) => log.collector.filter((entry) => entry.body?.kind === 'events').flatMap((entry) => entry.body.ev.map((event) => ({ ...event, sid: entry.body.sid, plid: entry.body.plid, t: entry.body.t, internal: entry.body.internal, debug: entry.body.debug })));
const names = (log) => events(log).map((event) => event.n);
const settle = (page, ms = 1400) => page.waitForTimeout(ms);
const dataLayer = (page) => page.evaluate(() => JSON.parse(JSON.stringify((window.dataLayer || []).map((entry) => Array.from(entry)))));

async function scenario(name, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await run(context);
    results.push(`PASS ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

function validateWithBackend(log) {
  if (!backendValidate) return;
  for (const entry of log.collector.filter((item) => item.body?.kind === 'events')) {
    assert.ok(entry.raw.length <= 2048, `payload ${entry.raw.length} bytes`);
    const verdict = backendValidate(entry.raw);
    assert.equal(verdict.ok, true, `backend rejected a payload: ${verdict.reason}`);
    assert.equal(verdict.payload.events.length, entry.body.ev.length, 'backend dropped an event (name or props outside the allowlist)');
  }
}

// 1. Token capture and removal happen before GA4 is configured; nothing GA sees has the token.
await scenario('token is removed from the URL before GA4 config; page_location and GA params are clean', async (context) => {
  const log = await serve(context);
  await context.addInitScript(() => {
    window.__pushLog = [];
    window.dataLayer = [];
    const push = Array.prototype.push;
    window.dataLayer.push = function (...args) { window.__pushLog.push({ href: location.href, entry: JSON.stringify(Array.from(args[0] || [])) }); return push.apply(this, args); };
  });
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?utm_source=email&t=${T1}#staffing-demo`, { waitUntil: 'load' });
  await settle(page);
  assert.equal(page.url(), `${PAGE}?utm_source=email#staffing-demo`, 'other params and the fragment are kept');
  const pushes = await page.evaluate(() => window.__pushLog);
  const config = pushes.find((push) => JSON.parse(push.entry)[0] === 'config');
  assert.ok(config, 'GA4 configured');
  assert.equal(config.href.includes(T1), false, 'URL was clean when gtag("config") ran');
  assert.deepEqual(JSON.parse(config.entry), ['config', GA_ID, { content_group: 'staffing', page_location: `${PAGE}?utm_source=email#staffing-demo` }]);
  assert.equal(JSON.stringify(await dataLayer(page)).includes(T1), false, 'no GA event parameter carries the token');
  assert.ok(log.ga.some((url) => url.includes(`id=${GA_ID}`)), 'GA4 tag loads for a normal visitor');
  assert.equal(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, '__slLandingBoot')), false, 'boot handoff removed');
  assert.equal(log.console.some((line) => line.includes(T1)), false, 'console');
  validateWithBackend(log);
});

// 2. After the initial navigation, no request carries the token in its URL or headers
// (Referer included). The only body that carries it is the first-party collector's,
// where the collector hashes it on arrival.
await scenario('no request after the initial navigation carries the token (URL, headers, Referer); only the collector body', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await page.locator('[data-video-play]').click();
  await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.5, null, { timeout: 20000 });
  await page.locator('[data-explainer] video').evaluate((video) => video.pause());
  await page.locator('#nav-book-cta').click();
  await page.waitForTimeout(3000);
  await page.keyboard.press('Escape');
  await page.locator('footer a[href^="mailto:"]').hover();
  await settle(page, 2000);
  const after = log.requests.slice(1);
  assert.ok(after.length > 10, `${after.length} requests checked`);
  const leaks = [];
  let pageRequests = 0;
  for (const request of after) {
    const headers = await request.allHeaders().catch(() => ({}));
    const isCollector = request.url() === COLLECTOR;
    if (request.url().includes(T1)) leaks.push(`url ${request.url()}`);
    if (JSON.stringify(headers).includes(T1)) leaks.push(`headers ${request.url()}`);
    if (!isCollector && (request.postData() || '').includes(T1)) leaks.push(`body ${request.url()}`);
    // The page's own requests send the origin only. (Requests made inside Google's
    // booking iframe carry Google's own referrers; they are still checked above.)
    let fromPage = false;
    try { fromPage = request.frame() === page.mainFrame(); } catch { /* service worker or detached frame */ }
    if (fromPage) {
      pageRequests += 1;
      if (headers.referer && headers.referer !== 'https://scalelabai.ca/') leaks.push(`referer ${headers.referer} on ${request.url()}`);
    }
  }
  assert.deepEqual(leaks, []);
  assert.ok(pageRequests > 5, `${pageRequests} page requests had origin-only or no Referer`);
  const collectorRequests = log.collector.filter((entry) => entry.body?.kind === 'events');
  assert.ok(collectorRequests.length >= 1);
  for (const entry of collectorRequests) {
    assert.equal(entry.body.t, T1);
    assert.equal(entry.headers.referer, undefined, 'collector requests send no Referer');
    assert.equal(entry.headers.cookie, undefined, 'collector requests send no cookies');
  }
  assert.equal(log.console.some((line) => line.includes(T1)), false, 'console');
  validateWithBackend(log);
});

await scenario('an invalid token is removed and ignored; the visitor stays anonymous', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=not-a-token&x=1`, { waitUntil: 'load' });
  await page.mouse.wheel(0, 600);
  await settle(page);
  assert.equal(page.url(), `${PAGE}?x=1`);
  assert.equal(log.collector.length, 0, 'no collector traffic');
  assert.ok(log.ga.length >= 1, 'GA4 still loads');
});

await scenario('anonymous visitor: GA4 as before, zero collector requests', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(PAGE, { waitUntil: 'load' });
  for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 500);
  await page.locator('#nav-book-cta').click();
  await page.keyboard.press('Escape');
  await settle(page);
  assert.equal(log.collector.length, 0);
  const layer = await dataLayer(page);
  assert.ok(layer.some((entry) => entry[0] === 'config'));
  assert.ok(layer.some((entry) => entry[0] === 'event' && entry[1] === 'staffing_page_view'));
});

// Session model.
await scenario('sessions: reload keeps it, a new tab or a different token starts one, 30 minutes idle starts one', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await settle(page);
  const first = events(log)[0];
  await page.reload({ waitUntil: 'load' });
  await settle(page);
  const reload = events(log).filter((event) => event.n === 'page_load')[1];
  assert.deepEqual([reload.sid, reload.t], [first.sid, T1], 'reload keeps session and token');
  assert.notEqual(reload.plid, first.plid, 'reload gets a new page-load id');
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'nothing in localStorage');

  const tab = await context.newPage();
  await tab.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await settle(tab);
  const newTab = events(log).filter((event) => event.n === 'page_load')[2];
  assert.notEqual(newTab.sid, first.sid, 'new tab, new session');
  const before = log.collector.length;
  const bare = await context.newPage();
  await bare.goto(PAGE, { waitUntil: 'load' });
  await settle(bare);
  assert.equal(log.collector.length, before, 'a new tab without the token is anonymous (no identity recovery)');

  await page.goto(`${PAGE}?t=${T2}`, { waitUntil: 'load' });
  await settle(page);
  const other = events(log).filter((event) => event.n === 'page_load').at(-1);
  assert.deepEqual([other.t, other.sid === first.sid], [T2, false], 'different token, new session');

  // Age the stored session by 31 minutes at the start of the next load, after the
  // current page has saved its state on the way out.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__ageSessionOnce') !== '1') return;
    sessionStorage.removeItem('__ageSessionOnce');
    const state = JSON.parse(sessionStorage.getItem('sl.lp.session'));
    state.last -= 31 * 60 * 1000;
    sessionStorage.setItem('sl.lp.session', JSON.stringify(state));
  });
  await page.evaluate(() => sessionStorage.setItem('__ageSessionOnce', '1'));
  await page.reload({ waitUntil: 'load' });
  await settle(page);
  const idle = events(log).filter((event) => event.n === 'page_load').at(-1);
  assert.deepEqual([idle.t, idle.sid === other.sid], [T2, false], 'idle over 30 minutes, new session, same token');
  validateWithBackend(log);
});

// Visible time: only while the tab is visible.
async function hiddenControl(context) {
  await context.addInitScript(() => {
    window.__slVisibility = 'visible';
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => window.__slVisibility });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => window.__slVisibility === 'hidden' });
  });
}
const setVisibility = (page, value) => page.evaluate((state) => { window.__slVisibility = state; document.dispatchEvent(new Event('visibilitychange')); }, value);

await scenario('engaged_10s after 10 s visible; a hidden tab accumulates nothing', async (context) => {
  const log = await serve(context);
  await hiddenControl(context);
  const page = await context.newPage();
  await page.clock.install();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await setVisibility(page, 'hidden');
  await page.clock.fastForward(60000);
  await settle(page);
  assert.equal(names(log).includes('engaged_10s'), false, 'no engagement while hidden');
  const hiddenSummary = events(log).find((event) => event.n === 'page_summary');
  assert.ok(hiddenSummary && hiddenSummary.p.visible_ms < 1000, `visible_ms ${hiddenSummary?.p.visible_ms}`);
  await setVisibility(page, 'visible');
  await page.clock.fastForward(5000);
  assert.equal(names(log).includes('engaged_10s'), false, '5 s is not enough');
  await page.clock.fastForward(6500);
  await page.clock.fastForward(1500);
  await settle(page, 300);
  assert.ok(names(log).includes('engaged_10s'), 'engaged after 10 s visible');
  assert.equal(names(log).filter((name) => name === 'engaged_10s').length, 1);
  validateWithBackend(log);
});

// Tiers: a scripted jump is never input; real wheel/key/touch input is.
await scenario('a scripted jump to the bottom produces no interaction and no scroll input', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    document.querySelector('footer').scrollIntoView({ behavior: 'instant' });
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
  });
  await settle(page);
  const seen = events(log);
  assert.equal(seen.some((event) => event.n === 'interaction'), false, 'no interaction');
  assert.equal(seen.some((event) => event.n === 'scroll_input'), false, 'no scroll input');
  const depths = seen.filter((event) => event.n === 'scroll_depth');
  assert.ok(depths.length >= 1 && depths.every((event) => event.p.mode === 'jump'), 'depth recorded as a jump');
  validateWithBackend(log);
});

await scenario('real wheel, keyboard and touch input are trusted interaction and scroll input', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, 300); await page.waitForTimeout(120); }
  await page.keyboard.press('PageDown');
  await settle(page);
  const seen = events(log);
  const kinds = seen.filter((event) => event.n === 'interaction').map((event) => [event.p.kind, event.tr]);
  assert.deepEqual(kinds.sort(), [['key', true], ['wheel', true]]);
  const input = seen.find((event) => event.n === 'scroll_input');
  assert.ok(input && input.tr === true && input.p.count >= 3 && input.p.px >= 300, JSON.stringify(input));
  assert.ok(seen.filter((event) => event.n === 'scroll_depth').some((event) => event.p.mode === 'input'));
  validateWithBackend(log);

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchLog = await serve(touch);
  const phone = await touch.newPage();
  await phone.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await phone.touchscreen.tap(200, 500);
  await settle(phone);
  assert.ok(events(touchLog).some((event) => event.n === 'interaction' && event.p.kind === 'touch' && event.tr === true), 'touch');
  validateWithBackend(touchLog);
  await touch.close();
});

// Video.
async function scrollVideoTo(page, visibleShare) {
  await page.evaluate((share) => {
    const video = document.querySelector('[data-explainer] video');
    const rect = video.getBoundingClientRect();
    const top = rect.top + scrollY;
    // Put the requested share of the video's height inside the bottom of the viewport.
    window.scrollTo({ top: top + rect.height * share - innerHeight, behavior: 'instant' });
  }, visibleShare);
}

await scenario('video_visible needs half the player in view for one second', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await scrollVideoTo(page, 0.3);
  await page.waitForTimeout(1600);
  await scrollVideoTo(page, 0.9);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  assert.equal(names(log).includes('video_visible'), false, '30% for 1.6 s, or 90% for 0.5 s, is not enough');
  assert.equal((await dataLayer(page)).some((entry) => entry[1] === 'staffing_video_impression'), false);
  await scrollVideoTo(page, 0.9);
  await page.waitForTimeout(1300);
  await settle(page);
  assert.equal(names(log).filter((name) => name === 'video_visible').length, 1);
  assert.equal((await dataLayer(page)).filter((entry) => entry[1] === 'staffing_video_impression').length, 1);
  validateWithBackend(log);
});

await scenario('video: playing, 25/50/75 and complete from actual playback, once each', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}#staffing-demo`, { waitUntil: 'load' });
  await page.locator('[data-video-play]').click();
  await page.waitForFunction(() => { const v = document.querySelector('[data-explainer] video'); return !v.paused && v.currentTime > 0.3; }, null, { timeout: 20000 });
  await page.locator('[data-explainer] video').evaluate((video) => { video.playbackRate = 16; });
  await page.waitForFunction(() => document.querySelector('[data-explainer] video').ended, null, { timeout: 30000 });
  await settle(page);
  const fired = names(log).filter((name) => name.startsWith('video_') && name !== 'video_visible');
  assert.deepEqual(fired, ['video_playing', 'video_25', 'video_50', 'video_75', 'video_complete']);
  const ga = (await dataLayer(page)).filter((entry) => entry[0] === 'event').map((entry) => entry[1]);
  for (const name of ['staffing_video_play', 'staffing_video_25', 'staffing_video_50', 'staffing_video_75', 'staffing_video_complete']) {
    assert.equal(ga.filter((value) => value === name).length, 1, name);
  }
  assert.equal(await page.locator('[data-video-end]').isVisible(), true, 'end screen still shows');
  validateWithBackend(log);
});

await scenario('video: seeking to the end fires no progress and no completion', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}#staffing-demo`, { waitUntil: 'load' });
  await page.locator('[data-video-play]').click();
  await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.3, null, { timeout: 20000 });
  await page.locator('[data-explainer] video').evaluate((video) => { video.currentTime = video.duration - 1.5; });
  await page.waitForFunction(() => document.querySelector('[data-explainer] video').ended, null, { timeout: 20000 });
  await settle(page);
  const fired = names(log).filter((name) => /^video_(25|50|75|complete)$/.test(name));
  assert.deepEqual(fired, []);
  const ga = (await dataLayer(page)).map((entry) => entry[1]);
  assert.equal(ga.some((name) => /^staffing_video_(25|50|75|complete)$/.test(name)), false);
  assert.equal(await page.locator('[data-video-end]').isVisible(), true, 'end screen still shows');
});

await scenario('meeting section needs half the card for one second; booking: click, dialog, embed are separate', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}`, { waitUntil: 'load' });
  await page.locator('#qualified-meeting').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  assert.equal(names(log).includes('meeting_section_visible'), false, 'a glimpse is not enough');
  await page.locator('#qualified-meeting').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1300);
  await page.locator('#final-cta').click();
  await page.waitForFunction(() => document.querySelector('#booking-dialog').classList.contains('is-loaded'), null, { timeout: 30000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await page.locator('#nav-book-cta').click({ modifiers: ['Control'] }).catch(() => {});
  await settle(page);
  const seen = events(log);
  assert.equal(seen.filter((event) => event.n === 'meeting_section_visible').length, 1);
  const click = seen.find((event) => event.n === 'booking_cta_click' && event.p.cta_location === 'final');
  assert.ok(click && click.tr === true, 'trusted CTA click');
  assert.ok(seen.some((event) => event.n === 'booking_dialog_open' && event.p.cta_location === 'final'), 'dialog open');
  assert.ok(seen.some((event) => event.n === 'booking_new_tab' && event.p.cta_location === 'nav'), 'modified click opens a new tab');
  assert.equal(seen.some((event) => /booked|booking_started|booking_completed/.test(event.n)), false, 'no event claims a booking');
  assert.equal((await dataLayer(page)).filter((entry) => entry[1] === 'staffing_qualified_meeting_section_view').length, 1);
  validateWithBackend(log);
});

// Internal browsers.
await scenario('internal marking: the code is verified before the flag is set; the fragment is removed; clearing works', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}#sl-mark=v1.9999999999.${'x'.repeat(22)}.${'y'.repeat(43)}`, { waitUntil: 'load' });
  await settle(page);
  assert.equal(page.url(), PAGE, 'fragment removed');
  assert.equal(await page.evaluate(() => localStorage.getItem('sl.internal')), null, 'unverified code sets nothing');
  await page.goto('about:blank');
  await page.goto(`${PAGE}#sl-mark=${MARK_OK}`, { waitUntil: 'load' });
  await page.waitForFunction(() => localStorage.getItem('sl.internal') === '1', null, { timeout: 5000 });
  assert.equal(page.url(), PAGE);
  assert.equal(log.ga.length, 0, 'no GA on marking visits');
  assert.equal(log.collector.filter((entry) => entry.body?.kind === 'events').length, 0, 'marking visits send no events');
  assert.equal(log.collector.filter((entry) => entry.body?.kind === 'mark').length, 2);
  assert.ok(await page.locator('[data-sl-notice]').first().isVisible(), 'the operator sees a confirmation');
  await page.goto('about:blank');
  await page.goto(`${PAGE}#sl-mark=off`, { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => localStorage.getItem('sl.internal')), null, 'cleared');
  assert.equal(page.url(), PAGE);
});

await scenario('internal marking also works when the link is pasted into a tab already showing the page', async (context) => {
  const log = await serve(context);
  const page = await context.newPage();
  watch(page, log);
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.evaluate((code) => { location.hash = `sl-mark=${code}`; }, MARK_OK);
  await page.waitForFunction(() => localStorage.getItem('sl.internal') === '1', null, { timeout: 5000 });
  assert.equal(page.url(), PAGE, 'fragment removed');
  await page.evaluate(() => { location.hash = 'sl-mark=off'; });
  await page.waitForFunction(() => localStorage.getItem('sl.internal') === null, null, { timeout: 5000 });
  assert.equal(page.url(), PAGE);
});

await scenario('internal browser: no GA; attributed events flagged internal (e.g. a prospect link opened from Gmail Sent)', async (context) => {
  const log = await serve(context);
  await context.addInitScript(() => { if (location.hostname === 'scalelabai.ca') localStorage.setItem('sl.internal', '1'); });
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}#sl-debug=0`, { waitUntil: 'load' });
  await page.mouse.wheel(0, 300);
  await settle(page);
  assert.equal(log.ga.length, 0, 'GA not loaded');
  assert.equal((await dataLayer(page)).some((entry) => entry[0] === 'config'), false, 'GA never configured');
  const seen = events(log);
  assert.ok(seen.length > 0 && seen.every((event) => event.internal === true && event.debug === false));
  assert.equal(await page.locator('[aria-label="Staffing attribution debug"]').count(), 0);
  validateWithBackend(log);
});

await scenario('debug mode: internal browsers only; DebugView-flagged GA, event panel, never the token', async (context) => {
  const log = await serve(context);
  await context.addInitScript(() => { if (location.hostname === 'scalelabai.ca') localStorage.setItem('sl.internal', '1'); });
  const page = await context.newPage();
  watch(page, log);
  await page.goto(`${PAGE}?t=${T1}#sl-debug=1`, { waitUntil: 'load' });
  await page.mouse.wheel(0, 300);
  await settle(page);
  assert.equal(page.url(), PAGE);
  const config = (await dataLayer(page)).find((entry) => entry[0] === 'config');
  assert.deepEqual(config, ['config', GA_ID, { content_group: 'staffing', page_location: PAGE, debug_mode: true, traffic_type: 'internal' }]);
  const panel = page.locator('[aria-label="Staffing attribution debug"]');
  assert.equal(await panel.isVisible(), true);
  const text = await panel.innerText();
  assert.match(text, /link token present/);
  assert.equal(text.includes(T1), false, 'panel never shows the token');
  assert.equal(log.console.some((line) => line.includes(T1)), false, 'console never shows the token');
  assert.ok(events(log).every((event) => event.internal === true && event.debug === true));
  validateWithBackend(log);

  const outsider = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const outsiderLog = await serve(outsider);
  const visitor = await outsider.newPage();
  await visitor.goto(`${PAGE}?t=${T1}#sl-debug=1`, { waitUntil: 'load' });
  await settle(visitor);
  assert.equal(visitor.url(), PAGE, 'switch removed');
  assert.equal(await visitor.locator('[aria-label="Staffing attribution debug"]').count(), 0, 'no debug for a normal browser');
  assert.deepEqual((await dataLayer(visitor)).find((entry) => entry[0] === 'config'), ['config', GA_ID, { content_group: 'staffing', page_location: PAGE }]);
  assert.ok(events(outsiderLog).every((event) => event.debug === false && event.internal === false));
  await outsider.close();
});

await scenario('collector down: page, video and booking work; no visible error; at most three failed requests', async (context) => {
  for (const failure of ['abort', 503]) {
    const inner = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const log = await serve(inner, { collectorFails: failure });
    const page = await inner.newPage();
    watch(page, log);
    await page.goto(`${PAGE}?t=${T1}#staffing-demo`, { waitUntil: 'load' });
    await page.locator('[data-video-play]').click();
    await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.5, null, { timeout: 20000 });
    for (let i = 0; i < 6; i += 1) { await page.mouse.wheel(0, 400); await page.waitForTimeout(1100); }
    await page.locator('#nav-book-cta').click();
    assert.equal(await page.locator('#booking-dialog').evaluate((dialog) => dialog.open), true, `booking opens (${failure})`);
    await page.keyboard.press('Escape');
    await settle(page);
    assert.ok(log.collector.length <= 3, `${log.collector.length} collector requests (${failure})`);
    assert.deepEqual(log.pageErrors, [], `page errors (${failure})`);
    assert.equal(await page.locator('[data-sl-notice], [role="alert"]').count(), 0, `no visible error (${failure})`);
    await inner.close();
  }
});

await browser.close();
console.log(results.join('\n'));
console.log(`${results.filter((line) => line.startsWith('PASS')).length} passed, ${results.filter((line) => line.startsWith('FAIL')).length} failed${backendValidate ? ' (payloads validated with the SalesPipeline2 collector)' : ''}`);
