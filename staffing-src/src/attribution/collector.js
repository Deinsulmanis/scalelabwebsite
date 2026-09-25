/**
 * Best-effort batching client for the first-party collector
 * (/staffing/api/lp -> SalesPipeline2 POST /api/landing/e).
 *
 * Schema (v1), matched to the collector's validation:
 *   { v: 1, kind: 'events', t: <token|null>, sid: <uuid>, plid: <uuid>,
 *     internal: <bool>, debug: <bool>, vp: 'm'|'t'|'d', wd: <bool>,
 *     ev: [{ n: <name>, s: <seq>, ms: <ms since page load>, tr?: <isTrusted>, ua?: <user activation>, p: {…} }] }
 * At most 20 events and 2 KB per request; larger batches are split. Sequence
 * numbers are per page load, so a resent batch is ignored server-side.
 *
 * Never throws and never retries: after three failed requests it stops sending
 * for the rest of the page load. The page, the video and booking never depend on it.
 */

export const MAX_EVENTS = 20;
export const MAX_BYTES = 1900; // under the collector's 2048-byte limit
export const FLUSH_DELAY_MS = 1000;
export const MAX_FAILURES = 3;

const clampMs = (value) => Math.max(0, Math.min(86400000, Math.round(Number(value) || 0)));

export function createCollector({ send, clock = () => performance.now(), flushDelayMs = FLUSH_DELAY_MS, schedule = setTimeout, cancel = clearTimeout, onEvent = null } = {}) {
  let context = null;
  let seq = 0;
  let queue = [];
  let timer = null;
  let failures = 0;
  let disabled = false;

  const envelope = (events) => ({
    v: 1, kind: 'events', t: context.t || null, sid: context.sid, plid: context.plid,
    internal: Boolean(context.internal), debug: Boolean(context.debug), vp: context.vp, wd: Boolean(context.wd), ev: events,
  });

  function chunks(events) {
    const out = [];
    let current = [];
    for (const event of events) {
      const candidate = [...current, event];
      if (current.length && (candidate.length > MAX_EVENTS || JSON.stringify(envelope(candidate)).length > MAX_BYTES)) {
        out.push(current);
        current = [event];
      } else {
        current = candidate;
      }
    }
    if (current.length) out.push(current);
    return out.filter((chunk) => JSON.stringify(envelope(chunk)).length <= MAX_BYTES);
  }

  function flush({ final = false } = {}) {
    if (timer) { cancel(timer); timer = null; }
    if (!queue.length || !context) return;
    const pending = queue;
    queue = [];
    if (disabled) return;
    for (const chunk of chunks(pending)) {
      let result;
      try { result = send(JSON.stringify(envelope(chunk)), { final }); } catch { result = Promise.resolve(false); }
      Promise.resolve(result).then((ok) => {
        if (ok) return;
        failures += 1;
        if (failures >= MAX_FAILURES) disabled = true;
      }, () => {
        failures += 1;
        if (failures >= MAX_FAILURES) disabled = true;
      });
    }
  }

  return {
    /** Session / page-load context. A new page-load id restarts the sequence. */
    setContext(next) {
      if (context && queue.length) flush();
      if (!context || next.plid !== context.plid) seq = 0;
      context = { ...next };
    },
    enqueue(name, props = {}, { trusted = null, activated = null } = {}) {
      if (!context || disabled) return null;
      seq += 1;
      const event = { n: name, s: seq, ms: clampMs(clock()), p: props };
      if (typeof trusted === 'boolean') event.tr = trusted;
      if (typeof activated === 'boolean') event.ua = activated;
      queue.push(event);
      if (onEvent) onEvent(event);
      if (queue.length >= MAX_EVENTS) flush();
      else if (!timer) timer = schedule(() => { timer = null; flush(); }, flushDelayMs);
      return event;
    },
    flush,
    get disabled() { return disabled; },
    get pending() { return queue.length; },
  };
}
