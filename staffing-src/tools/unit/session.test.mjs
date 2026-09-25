import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_KEY, IDLE_MS, newUuid, readSession, writeSession, resolveSession, continueOrRotate } from '../../src/attribution/session.js';

const T1 = 'AbCdEfGhIjKlMnOpQrStUv';
const T2 = 'ZzYyXxWwVvUuTtSsRrQqPp';
let counter = 0;
const ids = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map }; };

test('uuid: v4 shape, random', () => {
  const a = newUuid();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, newUuid());
  const fallback = newUuid({ getRandomValues: (bytes) => bytes.fill(7) });
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('first arrival with a token starts a session for that token', () => {
  const { state, isNew, reason } = resolveSession({ stored: null, arrivingToken: T1, now: 1000, newId: ids });
  assert.deepEqual([isNew, reason, state.t, state.last, state.vms], [true, 'none', T1, 1000, 0]);
});

test('reload (no token in the URL any more) continues the same session', () => {
  const first = resolveSession({ stored: null, arrivingToken: T1, now: 1000, newId: ids }).state;
  const reload = resolveSession({ stored: first, arrivingToken: null, now: 5000, newId: ids });
  assert.deepEqual([reload.isNew, reload.state.sid, reload.state.t, reload.state.last], [false, first.sid, T1, 5000]);
  // Arriving again with the SAME token also continues.
  assert.equal(resolveSession({ stored: first, arrivingToken: T1, now: 6000, newId: ids }).state.sid, first.sid);
});

test('a different arriving token starts a new session', () => {
  const first = resolveSession({ stored: null, arrivingToken: T1, now: 1000, newId: ids }).state;
  const next = resolveSession({ stored: first, arrivingToken: T2, now: 2000, newId: ids });
  assert.deepEqual([next.isNew, next.reason, next.state.t], [true, 'new_token', T2]);
  assert.notEqual(next.state.sid, first.sid);
});

test('more than 30 minutes idle starts a new session with the same token', () => {
  const first = resolveSession({ stored: null, arrivingToken: T1, now: 0, newId: ids }).state;
  assert.equal(resolveSession({ stored: first, now: IDLE_MS, newId: ids }).isNew, false, 'exactly 30 minutes continues');
  const idle = resolveSession({ stored: first, now: IDLE_MS + 1, newId: ids });
  assert.deepEqual([idle.isNew, idle.reason, idle.state.t], [true, 'idle', T1]);
  assert.notEqual(idle.state.sid, first.sid);
  const midPage = continueOrRotate({ ...first, last: 0 }, IDLE_MS + 5, ids);
  assert.equal(midPage.rotated, true);
  assert.deepEqual(midPage.state.once, {});
  assert.equal(continueOrRotate({ ...first, last: 0 }, 1000, ids).rotated, false);
});

test('storage round trip; anything malformed reads as no session', () => {
  const storage = memory();
  const state = resolveSession({ stored: null, arrivingToken: T1, now: 1, newId: newUuid }).state;
  writeSession(storage, state);
  assert.deepEqual(readSession(storage), state);
  for (const bad of ['{nope', JSON.stringify({ ...state, v: 2 }), JSON.stringify({ ...state, sid: 'x' }), JSON.stringify({ ...state, t: 'short' }), JSON.stringify({ ...state, last: 'x' })]) {
    storage.setItem(SESSION_KEY, bad);
    assert.equal(readSession(storage), null, bad);
  }
  assert.equal(readSession(null), null);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readSession(throwing), null);
  assert.doesNotThrow(() => writeSession(throwing, state));
});
