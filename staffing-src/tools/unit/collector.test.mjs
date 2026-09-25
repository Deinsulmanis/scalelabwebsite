import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollector, MAX_EVENTS, MAX_BYTES, MAX_FAILURES } from '../../src/attribution/collector.js';

const CONTEXT = { t: 'AbCdEfGhIjKlMnOpQrStUv', sid: '3b241101-e2bb-4255-8caf-4136c566a962', plid: '9f1c7e2a-5b3d-4c8e-a1f0-2d4b6e8a0c13', internal: false, debug: false, vp: 'd', wd: false };
const manual = () => { const jobs = []; return { schedule: (fn) => { jobs.push(fn); return jobs.length; }, cancel: () => {}, run: () => jobs.splice(0).forEach((fn) => fn()) }; };

test('batches into the collector schema with per-page-load sequence numbers', async () => {
  const sent = [];
  const timers = manual();
  const collector = createCollector({ send: (json) => { sent.push(JSON.parse(json)); return true; }, clock: () => 1234.6, ...timers });
  collector.setContext(CONTEXT);
  collector.enqueue('page_load', { visible: true });
  collector.enqueue('interaction', { kind: 'pointer' }, { trusted: true, activated: true });
  collector.enqueue('visible', {}, { trusted: null, activated: null });
  assert.equal(sent.length, 0, 'waits for the flush delay');
  timers.run();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { v: 1, kind: 'events', ...CONTEXT, ev: [
    { n: 'page_load', s: 1, ms: 1235, p: { visible: true } },
    { n: 'interaction', s: 2, ms: 1235, tr: true, ua: true, p: { kind: 'pointer' } },
    { n: 'visible', s: 3, ms: 1235, p: {} },
  ] });
  // A new page-load id restarts the sequence.
  collector.setContext({ ...CONTEXT, plid: '1f1c7e2a-5b3d-4c8e-a1f0-2d4b6e8a0c13' });
  collector.enqueue('page_load');
  collector.flush();
  assert.equal(sent[1].ev[0].s, 1);
});

test('never more than 20 events or ~2 KB per request', () => {
  const sent = [];
  const collector = createCollector({ send: (json) => { sent.push(json); return true; }, clock: () => 1, ...manual() });
  collector.setContext(CONTEXT);
  for (let i = 0; i < 45; i += 1) collector.enqueue('scroll_depth', { pct: 25, mode: 'input' });
  collector.flush();
  assert.ok(sent.length >= 3);
  for (const json of sent) {
    assert.ok(json.length <= MAX_BYTES, `${json.length} bytes`);
    assert.ok(JSON.parse(json).ev.length <= MAX_EVENTS);
  }
  assert.equal(sent.reduce((sum, json) => sum + JSON.parse(json).ev.length, 0), 45);
});

test('failures never throw and stop sending after three failed requests (no retry storm)', async () => {
  let calls = 0;
  const collector = createCollector({ send: () => { calls += 1; return Promise.resolve(false); }, clock: () => 1, ...manual() });
  collector.setContext(CONTEXT);
  for (let round = 0; round < 6; round += 1) {
    collector.enqueue('visible');
    collector.flush();
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(calls, MAX_FAILURES);
  assert.equal(collector.disabled, true);
  assert.equal(collector.enqueue('visible'), null);
  const throwing = createCollector({ send: () => { throw new Error('offline'); }, clock: () => 1, ...manual() });
  throwing.setContext(CONTEXT);
  throwing.enqueue('visible');
  assert.doesNotThrow(() => throwing.flush());
});

test('nothing is sent before a context exists, and the token only ever appears as the t field', () => {
  const sent = [];
  const collector = createCollector({ send: (json) => { sent.push(json); return true; }, clock: () => 1, ...manual() });
  assert.equal(collector.enqueue('visible'), null);
  collector.setContext(CONTEXT);
  collector.enqueue('booking_cta_click', { cta_location: 'hero' }, { trusted: true });
  collector.flush();
  const body = JSON.parse(sent[0]);
  assert.equal(body.t, CONTEXT.t);
  assert.equal(JSON.stringify(body.ev).includes(CONTEXT.t), false);
});
