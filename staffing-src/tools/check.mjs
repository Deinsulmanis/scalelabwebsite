import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Runs against the production build: `npm run build`, then `npm run preview -- --port 4173 --strictPort`.
const baseURL = process.env.CHECK_URL || 'http://127.0.0.1:4173/staffing/';
const origin = new URL(baseURL).origin;
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const output = new URL('../docs/qa/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, output));

const BOOKING_LINK = 'https://calendar.app.google/h3X8e3WbBKjPrBoVA';
const SCHEDULE_ID = 'AcZssZ2qt7Yk5pjd4beD8UsAZc1Nl4TwkSqc3cMoH4HbjxGi8MoDRUPfAH32a7y6Oa2SuypSIKBZiWNA';
const BOOKING_EMBED = `https://calendar.google.com/calendar/appointments/schedules/${SCHEDULE_ID}?gv=true`;
const BOOKING_CTAS = ['final', 'hero', 'nav', 'video', 'video_end'];
const DESTINATION = 'https://scalelabai.ca/staffing/';
const GA_ID = 'G-MGQJVCVWFZ';
const ONCE_PER_LOAD = ['staffing_page_view', 'staffing_video_impression', 'staffing_video_play', 'staffing_video_25', 'staffing_video_50', 'staffing_video_75', 'staffing_video_complete', 'staffing_qualified_meeting_section_view', 'staffing_booking_started', 'staffing_final_cta_click'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
const VIEWPORTS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 740]];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const report = { baseURL, checkedAt: new Date().toISOString(), viewports: [], errors: [] };
const mainFrameOrigins = new Set();

function watch(page, label) {
  page.on('pageerror', (error) => report.errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && (message.location().url || '').startsWith(origin)) report.errors.push(`${label} console: ${message.text()}`);
  });
  page.on('request', (request) => {
    // Once the Google schedule is embedded, it makes its own requests (e.g. CSP reports) that are not the page's.
    if (page.bookingOpened) return;
    try {
      if (request.frame() !== page.mainFrame()) return;
    } catch {
      return;
    }
    const requestOrigin = new URL(request.url()).origin;
    if (requestOrigin !== origin) mainFrameOrigins.add(requestOrigin);
  });
}

const dataLayerEvents = (page) => page.evaluate(() => (window.dataLayer || [])
  .filter((entry) => entry && entry[0] === 'event')
  .map((entry) => ({ name: entry[1], params: entry[2] || {} })));
const tally = (events) => events.reduce((all, { name }) => ({ ...all, [name]: (all[name] || 0) + 1 }), {});
const waitForEvent = (page, name) => page.waitForFunction((eventName) => (window.dataLayer || []).some((entry) => entry[0] === 'event' && entry[1] === eventName), name, { timeout: 20000 });
const dialogOpen = (page) => page.locator('#booking-dialog').evaluate((element) => element.open);

try {
  // Copy: nothing unfinished, no guarantee or undefined-cost language, every call duration is 30 minutes,
  // and every booking CTA links to the same schedule. Reads all text, including closed <details>, metadata and JSON-LD.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const copy = await page.evaluate(() => [
      document.documentElement.textContent,
      ...[...document.querySelectorAll('meta[content]')].map((meta) => meta.content),
      ...[...document.querySelectorAll('[aria-label], [title], [alt]')].map((element) => element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt')),
    ].join('\n'));
    const bookingLinks = await page.evaluate(() => [...document.querySelectorAll('[data-booking]')].map((link) => [link.dataset.booking, link.getAttribute('href')]));
    report.copy = {
      callDurationsMinutes: [...copy.matchAll(/(\d+)[\s-]?(?:minutes?|mins?)\b/gi)].map((match) => Number(match[1])),
      guaranteeWording: [...copy.matchAll(/[^.\n]*guarant[^.\n]*/gi)].map((match) => match[0].trim()),
      bookingCtas: bookingLinks.map(([location]) => location).sort(),
    };
    assert.equal(/coming soon|lorem ipsum|placeholder|TODO/i.test(copy), false, 'Unfinished or placeholder copy');
    assert.equal(/guarant/i.test(copy.replace(/not guaranteed/gi, '')), false, 'Guarantee language beyond the "not guaranteed" disclaimer');
    assert.equal(/set[\s-]?up|infrastructure|retainer|platform fee|other costs|additional (?:fees?|charges?|costs?)/i.test(copy), false, 'Undefined cost language');
    assert.ok(report.copy.callDurationsMinutes.length > 0 && report.copy.callDurationsMinutes.every((minutes) => minutes === 30), `Call durations: ${report.copy.callDurationsMinutes}`);
    assert.deepEqual(report.copy.bookingCtas, BOOKING_CTAS, 'Booking CTAs present');
    assert.ok(bookingLinks.every(([, href]) => href === BOOKING_LINK), 'Every booking CTA links to the schedule');
    assert.equal(await page.locator('[data-booking-newtab]').getAttribute('href'), BOOKING_LINK);
    await context.close();
  }

  for (const [width, height] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    watch(page, String(width));
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
      const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
      const stage = document.querySelector('.video-stage').getBoundingClientRect();
      const levels = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => Number(heading.tagName[1]));
      return {
        documentWidth: document.documentElement.scrollWidth,
        h1Count: document.querySelectorAll('h1').length,
        skippedHeadingLevels: levels.filter((level, index) => index > 0 && level - levels[index - 1] > 1).length,
        videoRatio: stage.width / stage.height,
        overflow: [...document.querySelectorAll('body *')].filter((element) => {
          if (element.closest('[aria-hidden="true"], dialog, .hero-hex')) return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
        }).map((element) => String(element.className || element.tagName)),
        smallTargets: [...document.querySelectorAll('a, button, summary')].filter((element) => {
          if (element.closest('dialog') || element.classList.contains('skip-link') || !visible(element)) return false;
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map((element) => element.textContent.trim().slice(0, 40)),
        smallestTextPx: Math.min(...[...document.querySelectorAll('main p, main li, main span, main a, main summary, footer p, footer a')]
          .filter(visible).map((element) => parseFloat(getComputedStyle(element).fontSize))),
        posterShown: Boolean(document.querySelector('[data-explainer] video').getAttribute('poster')) && !document.querySelector('[data-video-play]').hidden,
      };
    });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const accessibilityViolations = axe.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) }));
    const record = { width, ...layout, accessibilityViolations };
    report.viewports.push(record);
    await page.screenshot({ path: shot(`${width}-hero.png`) });
    await page.screenshot({ path: shot(`${width}-full.png`), fullPage: true });

    assert.equal(layout.documentWidth, width, `Horizontal page overflow at ${width}`);
    assert.equal(layout.h1Count, 1, 'Exactly one h1');
    assert.equal(layout.skippedHeadingLevels, 0, `Skipped heading level at ${width}`);
    assert.deepEqual(layout.overflow, [], `Element overflow at ${width}`);
    assert.deepEqual(layout.smallTargets, [], `Small tap targets at ${width}`);
    assert.ok(Math.abs(layout.videoRatio - 16 / 9) < 0.01, `Video ratio at ${width}`);
    assert.ok(layout.smallestTextPx >= 11, `Text below 11px at ${width}: ${layout.smallestTextPx}px`);
    assert.equal(layout.posterShown, true, `Video poster and play button at ${width}`);
    assert.deepEqual(accessibilityViolations, [], `Accessibility violations at ${width}`);

    // Opens booking from a CTA, checks the embedded schedule, closes it and confirms focus returns to the CTA.
    const openBooking = async (selector, closeWith, inspectCalendar = false) => {
      page.bookingOpened = true;
      const trigger = page.locator(selector);
      await trigger.click();
      assert.equal(await dialogOpen(page), true, `Booking opens from ${selector} at ${width}`);
      assert.equal(await page.locator('#booking-dialog iframe').getAttribute('src'), BOOKING_EMBED, `Correct schedule from ${selector}`);
      const box = await page.locator('#booking-dialog').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `Booking dialog fits the viewport at ${width}`);
      if (inspectCalendar) {
        await page.waitForFunction(() => document.querySelector('#booking-dialog').classList.contains('is-loaded'), null, { timeout: 30000 });
        const calendar = page.frameLocator('#booking-dialog iframe');
        await calendar.getByText('Discovery Call').first().waitFor({ timeout: 30000 });
        await calendar.getByText('30 min appointments').first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: shot(`${width}-booking.png`) });
      }
      if (closeWith === 'escape') await page.keyboard.press('Escape');
      else await page.locator('[data-booking-close]').click();
      assert.equal(await dialogOpen(page), false, `Booking closes with ${closeWith} at ${width}`);
      assert.equal(await trigger.evaluate((element) => element === document.activeElement), true, `Focus returns to ${selector} at ${width}`);
    };

    // Nav CTA (the sticky mobile CTA) first, so it is the recorded booking start.
    await openBooking('#nav-book-cta', 'escape', width === 1440 || width === 390);

    // Hero CTA → walkthrough.
    await page.locator('#primary-cta').click();
    await page.waitForFunction(() => location.hash === '#staffing-demo');

    // Video: play, milestones, completion, end screen and its booking CTA, replay without duplicate events.
    // Milestones count WATCHED time (seeking earns nothing), so the check plays at 16x.
    const video = page.locator('[data-explainer] video');
    await page.locator('[data-video-play]').click();
    await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.2, null, { timeout: 20000 });
    await page.screenshot({ path: shot(`${width}-video.png`) });
    await video.evaluate((element) => { element.playbackRate = 16; });
    for (const milestone of [25, 50, 75]) await waitForEvent(page, `staffing_video_${milestone}`);
    await waitForEvent(page, 'staffing_video_complete');
    await page.waitForFunction(() => document.querySelector('[data-explainer] video').ended, null, { timeout: 20000 });
    assert.equal(await page.locator('[data-video-end]').isVisible(), true, 'Video end screen shows');
    await page.locator('.video-shell').screenshot({ path: shot(`${width}-video-end.png`) });
    await openBooking('[data-video-end] [data-booking]', 'escape');
    await video.evaluate((element) => { element.playbackRate = 1; });
    await page.locator('[data-video-replay]').click();
    await page.waitForFunction(() => { const element = document.querySelector('[data-explainer] video'); return !element.paused && element.currentTime < 5; });
    assert.equal(await page.locator('[data-video-end]').isVisible(), false, 'End screen hides on replay');
    await video.evaluate((element) => element.pause());
    await openBooking('.video-cta [data-booking]', 'close');

    // Qualified-meeting definition and FAQ.
    await page.locator('#qualified-meeting').scrollIntoViewIfNeeded();
    await waitForEvent(page, 'staffing_qualified_meeting_section_view');
    const firstQuestion = page.locator('.faq-item').first();
    await firstQuestion.locator('summary').click();
    assert.equal(await firstQuestion.evaluate((element) => element.open), true, 'FAQ item opens');

    // Remaining booking CTAs.
    await openBooking('#book-call-cta', 'escape');
    await openBooking('#final-cta', 'close');

    const events = await dataLayerEvents(page);
    record.events = tally(events);
    for (const name of ONCE_PER_LOAD) assert.equal(record.events[name], 1, `${name} fired ${record.events[name] || 0} times at ${width}`);
    assert.equal(record.events.staffing_hero_cta_click, 2, 'Hero CTA clicks: see-how-it-works and book-call, once each');
    assert.deepEqual(events.find((event) => event.name === 'staffing_booking_started').params, { funnel: 'staffing', cta_location: 'nav', method: 'dialog' });
    assert.ok(events.every((event) => event.params.funnel === 'staffing'), 'Every event carries funnel=staffing');
    assert.equal(record.events.staffing_video_error, undefined, 'No video error');
    await context.close();
  }

  // Cold-email destination: a tagged link and a deep link load cleanly, with the canonical and indexing intact.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    watch(page, 'email-destination');
    const response = await page.goto(`${baseURL}?utm_source=email&utm_medium=cold&utm_campaign=staffing`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), DESTINATION);
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), DESTINATION);
    assert.doesNotMatch(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.equal(tally(await dataLayerEvents(page)).staffing_page_view, 1);
    // A tracked outreach link: the token leaves the address bar before anything else runs.
    await page.goto(`${baseURL}?utm_source=email&t=AbCdEfGhIjKlMnOpQrStUv#staffing-demo`, { waitUntil: 'networkidle' });
    assert.equal(page.url(), `${baseURL}?utm_source=email#staffing-demo`, 'Link token removed, other parameters kept');
    await page.goto(`${baseURL}#staffing-demo`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#staffing-demo').evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; }), true, 'Deep link lands on the walkthrough');
    await context.close();
  }

  // Live host: URL variants people may type or paste resolve to the destination, and the short booking link
  // resolves to the schedule the dialog embeds. (Netlify behaviour; unaffected by this build.)
  {
    const context = await browser.newContext();
    report.liveUrlVariants = [];
    for (const [url, redirectTo] of [
      [DESTINATION, null],
      ['https://scalelabai.ca/staffing', '/staffing/'],
      ['http://scalelabai.ca/staffing/', DESTINATION],
      ['https://www.scalelabai.ca/staffing/', DESTINATION],
    ]) {
      const response = await context.request.get(url, { maxRedirects: 0 });
      const location = response.headers().location || null;
      report.liveUrlVariants.push({ url, status: response.status(), location });
      if (redirectTo) assert.ok(response.status() === 301 && location === redirectTo, `${url} → ${response.status()} ${location}`);
      else assert.equal(response.status(), 200, `${url} → ${response.status()}`);
    }
    const booking = await context.request.get(BOOKING_LINK);
    report.bookingLinkResolvesTo = booking.url();
    assert.ok(booking.ok() && booking.url().includes(SCHEDULE_ID), 'Short booking link resolves to the embedded schedule');
    await context.close();
  }

  // Links: anchors resolve, external pages respond.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((link) => link.getAttribute('href')))]);
    report.links = [];
    for (const href of hrefs) {
      if (href.startsWith('#')) {
        assert.ok(await page.locator(href).count(), `Missing anchor target ${href}`);
      } else if (href.startsWith('mailto:')) {
        assert.equal(href, 'mailto:deins@scalelabai.ca');
      } else if (href.includes('linkedin.com')) {
        report.links.push({ href, status: 'not requested: LinkedIn rejects automated requests' });
      } else {
        const response = await context.request.get(new URL(href, baseURL).href, { maxRedirects: 5 });
        report.links.push({ href, status: response.status() });
        assert.ok(response.status() < 400, `Broken link ${href}: ${response.status()}`);
      }
    }
    await context.close();
  }

  // Without JavaScript: content readable, booking links work, video has native controls.
  {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(baseURL);
    assert.equal(await page.locator('h1').isVisible(), true);
    assert.equal(await page.locator('#qualified-title').isVisible(), true);
    for (const id of ['#nav-book-cta', '#book-call-cta', '#final-cta']) assert.equal(await page.locator(id).getAttribute('href'), BOOKING_LINK);
    assert.notEqual(await page.locator('[data-explainer] video').getAttribute('controls'), null, 'Native video controls without JS');
    assert.equal(await page.locator('[data-video-play]').isVisible(), false);
    await context.close();
  }

  // Video failure: readable fallback, text version opens, focus kept, one error event.
  {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    await context.route('**/*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.locator('[data-video-play]').click();
    await page.waitForSelector('[data-video-error]:not([hidden])', { timeout: 20000 });
    assert.equal(await page.locator('[data-video-summary]').evaluate((element) => element.open), true, 'Text version opens when the video fails');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-video-error]')), true, 'Focus moves to the video error message');
    assert.equal(tally(await dataLayerEvents(page)).staffing_video_error, 1);
    await page.locator('#staffing-demo').screenshot({ path: shot('video-error.png') });
    await context.close();
  }

  // Production host: GA4 loads with the staffing content group (requests aborted, nothing sent).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const tagRequests = [];
    await context.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
      tagRequests.push(route.request().url());
      return route.abort();
    });
    await context.route('https://scalelabai.ca/staffing/**', async (route) => {
      let path = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/staffing\/?/, ''));
      if (!path || path.endsWith('/')) path += 'index.html';
      try {
        await route.fulfill({ status: 200, body: await readFile(join(distDir, path)), contentType: TYPES[extname(path)] || 'application/octet-stream' });
      } catch {
        await route.fulfill({ status: 404, body: '' });
      }
    });
    const page = await context.newPage();
    await page.goto(DESTINATION, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const config = await page.evaluate(() => window.dataLayer.filter((entry) => entry[0] === 'config').map((entry) => [entry[1], entry[2]]));
    report.productionTag = { requested: tagRequests.find((url) => url.includes('gtag/js')), config };
    assert.ok(report.productionTag.requested?.includes(`id=${GA_ID}`), 'GA4 tag loads on scalelabai.ca');
    assert.deepEqual(config, [[GA_ID, { content_group: 'staffing', page_location: DESTINATION }]]);
    await context.close();
  }

  // Throttled mobile load: layout stability, weight, and no video or booking download before interaction.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__vitals = { cls: 0, lcp: 0 };
      new PerformanceObserver((list) => list.getEntries().forEach((entry) => { if (!entry.hadRecentInput) window.__vitals.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => { const entries = list.getEntries(); window.__vitals.lcp = entries[entries.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    report.performance = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      const navigation = performance.getEntriesByType('navigation')[0];
      const sameOrigin = resources.filter((entry) => entry.name.startsWith(location.origin));
      return {
        profile: 'Mobile 390px, 1.6 Mbps down, 150 ms latency, 4x CPU slowdown',
        lcpMs: Math.round(window.__vitals.lcp),
        cls: Number(window.__vitals.cls.toFixed(4)),
        sameOriginTransferKB: Math.round((navigation.transferSize + sameOrigin.reduce((sum, entry) => sum + entry.transferSize, 0)) / 1024),
        requests: resources.length + 1,
        videoRequestedBeforePlay: resources.some((entry) => entry.name.includes('.mp4')),
        bookingRequestedBeforeClick: resources.some((entry) => entry.name.includes('calendar.google.com')),
      };
    });
    assert.ok(report.performance.cls < 0.1, `CLS ${report.performance.cls}`);
    assert.equal(report.performance.videoRequestedBeforePlay, false, 'Video must not download before play');
    assert.equal(report.performance.bookingRequestedBeforeClick, false, 'Booking embed must not load before a CTA click');
    await context.close();
  }

  report.mainFrameExternalOrigins = [...mainFrameOrigins];
  assert.deepEqual(report.errors, [], 'Browser errors');
  const allowedOrigins = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  assert.ok(report.mainFrameExternalOrigins.every((value) => allowedOrigins.includes(value)), `Unexpected external requests: ${report.mainFrameExternalOrigins.join(', ')}`);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = error.message;
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
