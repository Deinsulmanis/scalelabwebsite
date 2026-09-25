import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Post-deploy check of the live page. GA4 is allowed to load, but measurement is switched off with
// Google's ga-disable flag and collect requests are blocked, so the check adds no analytics traffic.
// It never books a slot. Run after Netlify has published: `node tools/live-check.mjs`.
const LIVE = 'https://scalelabai.ca/staffing/';
const GA_ID = 'G-MGQJVCVWFZ';
const VIDEO_PATH = '/staffing/media/staffing-explainer-v5.mp4';
const LOCAL_VIDEO = new URL('../public/media/staffing-explainer-v5.mp4', import.meta.url);
const BUILT_HTML = new URL('../dist/index.html', import.meta.url);
const output = new URL('../docs/qa/live/', import.meta.url);
const shot = (name) => fileURLToPath(new URL(name, output));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

await mkdir(output, { recursive: true });
const report = { url: LIVE, checkedAt: new Date().toISOString(), errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

async function liveContext(options) {
  const context = await browser.newContext(options);
  await context.addInitScript((id) => { window[`ga-disable-${id}`] = true; }, GA_ID);
  context.blockedCollects = [];
  await context.route(/\/g\/collect|google-analytics\.com\/(?:j\/)?collect/, (route) => {
    context.blockedCollects.push(route.request().url());
    return route.abort();
  });
  return context;
}

function watch(page, label) {
  page.on('pageerror', (error) => report.errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && (message.location().url || '').startsWith('https://scalelabai.ca')) report.errors.push(`${label} console: ${message.text()}`);
  });
}

const eventNames = (page) => page.evaluate(() => (window.dataLayer || []).filter((entry) => entry[0] === 'event').map((entry) => entry[1]));
const tally = (names) => Object.fromEntries([...new Set(names)].map((name) => [name, names.filter((value) => value === name).length]));

try {
  // Deployed files: HTML is this build, the video is byte-identical to V5, sitemap lists the page.
  {
    const context = await browser.newContext();
    const html = await context.request.get(LIVE);
    const body = await html.body();
    report.html = { status: html.status(), cacheControl: html.headers()['cache-control'], identicalToBuild: sha256(body) === sha256(await readFile(BUILT_HTML)) };
    assert.equal(html.status(), 200, 'Live page responds');
    assert.ok(body.toString('utf8').includes(VIDEO_PATH), 'Live HTML references V5');
    assert.doesNotMatch(body.toString('utf8'), /staffing-explainer-v[34]\.mp4/, 'Live HTML has no older video');
    const video = await context.request.get(new URL(VIDEO_PATH, LIVE).href);
    const videoBody = await video.body();
    report.video = { status: video.status(), contentType: video.headers()['content-type'], bytes: videoBody.length, identicalToV5: sha256(videoBody) === sha256(await readFile(LOCAL_VIDEO)) };
    assert.equal(video.status(), 200, 'Live video responds');
    assert.equal(report.video.identicalToV5, true, 'Live video is byte-identical to V5');
    const range = await context.request.get(new URL(VIDEO_PATH, LIVE).href, { headers: { Range: 'bytes=0-1023' } });
    report.video.rangeRequestStatus = range.status();
    assert.equal(range.status(), 206, 'Byte-range requests work (required by iOS Safari)');
    const sitemap = await (await context.request.get('https://scalelabai.ca/sitemap.xml')).text();
    report.sitemapListsStaffing = sitemap.includes('<loc>https://scalelabai.ca/staffing/</loc>');
    assert.equal(report.sitemapListsStaffing, true, 'Sitemap lists /staffing/');
    await context.close();
  }

  // Desktop: GA loads, hero, V5 playback and corrected caption frame, booking calendar, events once.
  {
    const context = await liveContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    watch(page, 'desktop');
    const tag = page.waitForResponse((response) => response.url().includes(`googletagmanager.com/gtag/js?id=${GA_ID}`), { timeout: 30000 });
    await page.goto(LIVE, { waitUntil: 'networkidle' });
    const tagResponse = await tag;
    await page.waitForFunction(() => Boolean(window.google_tag_manager), null, { timeout: 20000 });
    report.ga = { tagStatus: tagResponse.status(), googleTagManagerReady: true };
    assert.equal(tagResponse.status(), 200, 'GA4 tag loads');
    assert.equal(await page.locator('h1').isVisible(), true, 'Hero headline visible');
    report.h1 = (await page.locator('h1').innerText()).replace(/\s+/g, ' ');
    await page.screenshot({ path: shot('1440-hero.png') });

    await page.locator('#staffing-demo').scrollIntoViewIfNeeded();
    await page.locator('[data-video-play]').click();
    const video = page.locator('[data-explainer] video');
    await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.5, null, { timeout: 30000 });
    report.videoCurrentSrc = await video.evaluate((element) => element.currentSrc);
    assert.ok(report.videoCurrentSrc.endsWith(VIDEO_PATH), 'Player is playing V5');
    await video.evaluate((element) => new Promise((resolve) => {
      element.pause();
      element.addEventListener('seeked', resolve, { once: true });
      element.currentTime = 31.5;
    }));
    await page.waitForTimeout(800);
    await video.screenshot({ path: shot('1440-video-31.5s.png') });

    await page.locator('#book-call-cta').click();
    assert.equal(await page.locator('#booking-dialog').evaluate((element) => element.open), true, 'Booking opens');
    const calendar = page.frameLocator('#booking-dialog iframe');
    await calendar.getByText('Discovery Call').first().waitFor({ timeout: 30000 });
    await calendar.getByText('30 min appointments').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: shot('1440-booking.png') });
    await page.keyboard.press('Escape');

    report.desktopEvents = tally(await eventNames(page));
    for (const name of ['staffing_page_view', 'staffing_hero_cta_click', 'staffing_video_impression', 'staffing_video_play', 'staffing_booking_started']) {
      assert.equal(report.desktopEvents[name], 1, `${name} fires once on desktop`);
    }
    report.ga.collectRequestsBlocked = context.blockedCollects.length;
    await context.close();
  }

  // Mobile: UTM-tagged arrival, layout, nav CTA booking, deep link and playback.
  {
    const context = await liveContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    watch(page, 'mobile');
    const response = await page.goto(`${LIVE}?utm_source=email&utm_medium=cold&utm_campaign=staffing`, { waitUntil: 'networkidle' });
    report.mobile = {
      utmStatus: response.status(),
      documentWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      canonical: await page.locator('link[rel="canonical"]').getAttribute('href'),
    };
    assert.equal(response.status(), 200, 'UTM-tagged URL responds');
    assert.equal(report.mobile.documentWidth, 390, 'No horizontal overflow at 390px');
    assert.equal(report.mobile.canonical, LIVE, 'Canonical unaffected by UTM parameters');
    await page.screenshot({ path: shot('390-hero.png') });
    await page.screenshot({ path: shot('390-full.png'), fullPage: true });
    await page.locator('#nav-book-cta').tap();
    assert.equal(await page.locator('#booking-dialog').evaluate((element) => element.open), true, 'Mobile nav CTA opens booking');
    await page.frameLocator('#booking-dialog iframe').getByText('30 min appointments').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: shot('390-booking.png') });
    await page.locator('[data-booking-close]').tap();
    const mobileEvents = tally(await eventNames(page));
    assert.equal(mobileEvents.staffing_page_view, 1, 'Page view once on mobile');
    assert.equal(mobileEvents.staffing_booking_started, 1, 'Booking start once on mobile');

    await page.goto(`${LIVE}#staffing-demo`, { waitUntil: 'networkidle' });
    report.mobile.deepLinkLandsOnVideo = await page.locator('#staffing-demo').evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; });
    assert.equal(report.mobile.deepLinkLandsOnVideo, true, '#staffing-demo lands on the walkthrough');
    await page.locator('[data-video-play]').tap();
    await page.waitForFunction(() => document.querySelector('[data-explainer] video').currentTime > 0.5, null, { timeout: 30000 });
    report.mobile.videoPlays = true;
    await context.close();
  }

  assert.deepEqual(report.errors, [], 'No console or page errors');
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
