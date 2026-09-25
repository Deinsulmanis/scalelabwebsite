import { newUuid, readSession, writeSession, resolveSession, continueOrRotate } from './session.js';
import { createCollector } from './collector.js';
import { createDebugPanel } from './debug-panel.js';

/**
 * First-party attribution for the staffing page. Best-effort by design: nothing
 * here can break the page, the video or booking.
 *
 * Active only on the production host, and only for a tab that arrived with a
 * link token (kept for the tab's session) or for a browser marked internal.
 * Anonymous visitors send nothing here; they stay GA4-only.
 *
 * Events (the collector's allowlist):
 *   page_load, visible, engaged_10s, interaction, scroll_input, scroll_depth, page_summary
 *   (this module); video_visible, video_playing, video_25/50/75, video_complete
 *   (explainer-video.js); meeting_section_visible (main.js); booking_cta_click,
 *   booking_dialog_open, booking_embed_loaded, booking_new_tab (booking.js).
 */

export const ENDPOINT = '/staffing/api/lp';
export const ENGAGED_MS = 10000;
export const INPUT_WINDOW_MS = 1000;
export const SCROLL_INPUT = Object.freeze({ events: 3, px: 300 });
export const DEPTHS = Object.freeze([25, 50, 75, 90]);
const SCROLL_KEYS = new Set(['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' ', 'Spacebar', 'End', 'Home']);

const inert = Object.freeze({
  active: false, emit() {}, once() {}, oncePage() {}, flush() {},
  trusted: () => ({}),
});

function takeBoot(win) {
  const boot = win.__slLandingBoot || {};
  try { delete win.__slLandingBoot; } catch { /* non-configurable in an unexpected environment */ }
  return { ...boot };
}

function area(win, name) {
  try { return win[name]; } catch { return null; }
}

function post(win, body) {
  return win.fetch(ENDPOINT, {
    method: 'POST', body, keepalive: true, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  });
}

function transport(win, json) {
  try {
    return post(win, json).then((response) => response.ok, () => false);
  } catch {
    try { return Promise.resolve(win.navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'text/plain;charset=UTF-8' }))); } catch { return Promise.resolve(false); }
  }
}

function notice(doc, text) {
  const show = () => {
    const note = doc.createElement('div');
    note.setAttribute('role', 'status');
    note.setAttribute('data-sl-notice', '');
    note.textContent = text;
    note.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483000;max-width:min(520px,calc(100vw - 32px));'
      + 'padding:12px 16px;background:#0D1E35;color:#F2F2F2;border:1px solid rgba(0,212,255,.45);border-radius:8px;font:14px/1.45 Outfit,system-ui,sans-serif';
    doc.body.append(note);
    setTimeout(() => note.remove(), 8000);
  };
  if (doc.body) show(); else doc.addEventListener('DOMContentLoaded', show, { once: true });
}

/** The page side of the dashboard's "Mark this browser internal". */
async function handleMark(boot, { win, doc }) {
  if (boot.markOff) {
    notice(doc, 'This browser is no longer marked internal on the staffing page.');
    return;
  }
  let marked = false;
  try {
    const response = await post(win, JSON.stringify({ v: 1, kind: 'mark', code: boot.markCode }));
    if (response.status === 200) marked = (await response.json())?.marked === true;
  } catch { /* unverified: stays unmarked */ }
  if (marked) {
    try { win.localStorage.setItem('sl.internal', '1'); } catch { marked = false; }
  }
  notice(doc, marked
    ? 'This browser is now marked internal: its visits are left out of analytics and attribution on the staffing page.'
    : 'This browser could not be marked internal. Open a new link from the dashboard.');
}

/**
 * A marking or debug link pasted into a tab that already shows the page is a
 * same-document fragment change: the head script does not run again, so handle
 * it here. The mark is verified exactly as on a fresh load; a debug switch takes
 * effect on the next load.
 */
function watchFragmentSwitches({ win, doc }) {
  win.addEventListener('hashchange', () => {
    const mark = /^#sl-mark=([A-Za-z0-9._-]{1,200})$/.exec(win.location.hash);
    const debug = /^#sl-debug=([01])$/.exec(win.location.hash);
    if (!mark && !debug) return;
    try { win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search); } catch { /* best effort */ }
    const local = area(win, 'localStorage');
    const session = area(win, 'sessionStorage');
    if (mark && mark[1] === 'off') {
      try { local.removeItem('sl.internal'); session.removeItem('sl.debug'); } catch { /* storage unavailable */ }
      handleMark({ markOff: true }, { win, doc });
    } else if (mark) {
      handleMark({ markCode: mark[1] }, { win, doc });
    } else {
      let internal = false;
      try { internal = local.getItem('sl.internal') === '1'; } catch { /* storage unavailable */ }
      if (!internal) return;
      try { if (debug[1] === '1') session.setItem('sl.debug', '1'); else session.removeItem('sl.debug'); } catch { return; }
      notice(doc, debug[1] === '1' ? 'Debug mode takes effect when the page reloads.' : 'Debug mode is off from the next reload.');
    }
  });
}

export function startAttribution({ win = window, doc = document } = {}) {
  const boot = takeBoot(win);
  watchFragmentSwitches({ win, doc });
  if (boot.markCode || boot.markOff) handleMark(boot, { win, doc });
  // A marking visit sends nothing else, and off the production host nothing is sent at all.
  if (boot.markCode || !boot.production) return inert;

  const storage = area(win, 'sessionStorage');
  const clock = () => win.performance.now();
  const now = () => Date.now();
  let state = resolveSession({ stored: readSession(storage), arrivingToken: boot.token || null, now: now(), newId: newUuid }).state;
  if (!state.t && !boot.internal) return inert;

  let plid = newUuid();
  const save = () => writeSession(storage, state);
  const pageOnce = new Set();
  const panel = boot.debug ? createDebugPanel({ doc, boot, getState: () => state }) : null;
  const collector = createCollector({ send: (json) => transport(win, json), clock, onEvent: panel ? (event) => panel.record(event) : null });
  const viewport = () => (win.innerWidth < 600 ? 'm' : win.innerWidth < 1024 ? 't' : 'd');
  const setContext = () => collector.setContext({
    t: state.t, sid: state.sid, plid, internal: Boolean(boot.internal), debug: Boolean(boot.debug), vp: viewport(), wd: win.navigator.webdriver === true,
  });
  const isVisible = () => doc.visibilityState === 'visible';
  const activation = () => (win.navigator.userActivation ? Boolean(win.navigator.userActivation.hasBeenActive) : null);

  // Activity keeps the session alive; more than 30 minutes idle starts a new one.
  function freshen() {
    const next = continueOrRotate(state, now(), newUuid);
    state = next.state;
    if (next.rotated) {
      plid = newUuid();
      pageOnce.clear();
      setContext();
      if (isVisible()) { state.once.visible = 1; collector.enqueue('visible'); }
    }
  }
  function emit(name, props = {}, meta = {}) {
    freshen();
    collector.enqueue(name, props, meta);
    save();
  }
  function once(name, props = {}, meta = {}) {
    freshen();
    if (state.once[name]) return;
    state.once[name] = 1;
    emit(name, props, meta);
  }
  function oncePage(key, name, props = {}, meta = {}) {
    freshen();
    if (pageOnce.has(key)) return;
    pageOnce.add(key);
    emit(name, props, meta);
  }

  // Visible time: only while the document is visible; accumulated per page load
  // (page_summary) and per session (engaged_10s at 10 s).
  let visibleSince = null;
  let pageVisibleMs = 0;
  let engagedTimer = null;
  let summaryPending = false;
  function accrue() {
    if (visibleSince === null) return;
    const at = clock();
    pageVisibleMs += at - visibleSince;
    state.vms += at - visibleSince;
    visibleSince = at;
    save();
  }
  function armEngaged() {
    if (engagedTimer) { win.clearTimeout(engagedTimer); engagedTimer = null; }
    if (state.once.engaged_10s || !isVisible()) return;
    engagedTimer = win.setTimeout(() => {
      engagedTimer = null;
      accrue();
      if (state.vms >= ENGAGED_MS) once('engaged_10s'); else armEngaged();
    }, Math.max(0, ENGAGED_MS - state.vms) + 25);
  }

  // Input and scroll.
  let lastInputAt = -Infinity;
  let inputCount = 0;
  let inputPx = 0;
  let lastScrollY = win.scrollY;
  let scrollEvents = 0;
  let maxJump = 0;
  let maxDepth = 0;
  function input(kind, event, scrollInput) {
    if (!event.isTrusted) return;
    oncePage(`interaction:${kind}`, 'interaction', { kind }, { trusted: true, activated: activation() });
    if (scrollInput) { inputCount += 1; lastInputAt = clock(); }
  }
  function onScroll() {
    const y = win.scrollY;
    const delta = Math.abs(y - lastScrollY);
    lastScrollY = y;
    scrollEvents += 1;
    maxJump = Math.max(maxJump, delta);
    // A scroll only counts as input when a trusted wheel, touch or scroll key came first.
    const byInput = clock() - lastInputAt <= INPUT_WINDOW_MS;
    if (byInput) inputPx += delta;
    if (inputCount >= SCROLL_INPUT.events && inputPx >= SCROLL_INPUT.px) {
      oncePage('scroll_input', 'scroll_input', { count: Math.min(inputCount, 100000), px: Math.min(Math.round(inputPx), 10000000) }, { trusted: true, activated: activation() });
    }
    const height = doc.documentElement.scrollHeight || 1;
    const depth = Math.min(100, Math.round(((y + win.innerHeight) / height) * 100));
    maxDepth = Math.max(maxDepth, depth);
    for (const pct of DEPTHS) if (depth >= pct) oncePage(`depth:${pct}`, 'scroll_depth', { pct, mode: byInput ? 'input' : 'jump' });
  }
  // Leaving or hiding the page is not activity: the summary belongs to the
  // current session and page load, and never refreshes or rotates the session.
  function summary() {
    if (!summaryPending) return;
    summaryPending = false;
    accrue();
    collector.enqueue('page_summary', {
      visible_ms: Math.min(Math.round(pageVisibleMs), 86400000), max_scroll_pct: maxDepth,
      scroll_events: Math.min(scrollEvents, 1000000), max_jump_px: Math.min(Math.round(maxJump), 10000000),
    });
  }
  function onVisibility() {
    if (isVisible()) {
      visibleSince = clock();
      summaryPending = true;
      once('visible');
      armEngaged();
    } else {
      accrue();
      visibleSince = null;
      if (engagedTimer) { win.clearTimeout(engagedTimer); engagedTimer = null; }
      summary();
      collector.flush({ final: true });
    }
  }

  function begin() {
    setContext();
    save();
    const navigation = win.performance.getEntriesByType?.('navigation')?.[0];
    const prerendered = Number(navigation?.activationStart) > 0;
    const type = prerendered ? 'prerender' : ['navigate', 'reload', 'back_forward'].includes(navigation?.type) ? navigation.type : null;
    emit('page_load', { visible: isVisible(), prerendered, ...(type ? { navigation: type } : {}) });
    if (isVisible()) { visibleSince = clock(); summaryPending = true; once('visible'); armEngaged(); }

    doc.addEventListener('visibilitychange', onVisibility);
    win.addEventListener('pagehide', () => { summary(); collector.flush({ final: true }); });
    win.addEventListener('pageshow', (event) => { if (event.persisted && isVisible()) onVisibility(); });
    doc.addEventListener('pointerdown', (event) => input(event.pointerType === 'touch' ? 'touch' : 'pointer', event, false), { capture: true, passive: true });
    doc.addEventListener('keydown', (event) => input('key', event, SCROLL_KEYS.has(event.key)), { capture: true, passive: true });
    win.addEventListener('wheel', (event) => input('wheel', event, true), { capture: true, passive: true });
    doc.addEventListener('touchmove', (event) => { if (event.isTrusted) { inputCount += 1; lastInputAt = clock(); } }, { capture: true, passive: true });
    win.addEventListener('scroll', onScroll, { passive: true });
  }

  // A prerendered page reports nothing until the visitor actually opens it.
  if (doc.prerendering) doc.addEventListener('prerenderingchange', begin, { once: true });
  else begin();

  return {
    active: true,
    emit, once, oncePage,
    flush: () => collector.flush(),
    trusted: (event) => ({ trusted: Boolean(event?.isTrusted), activated: activation() }),
  };
}
