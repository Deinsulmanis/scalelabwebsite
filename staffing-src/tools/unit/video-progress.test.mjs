import test from 'node:test';
import assert from 'node:assert/strict';
import { createWatchTracker } from '../../src/attribution/video-progress.js';

const DURATION = 70;
// Real playback: 0.25 s of playhead per 250 ms of wall clock.
function play(tracker, from, to, { rate = 1, step = 0.25, startAt = 0 } = {}) {
  const out = [];
  let at = startAt;
  for (let time = from; time <= to + 1e-9; time += step * rate) {
    out.push(...tracker.tick({ currentTime: Math.min(time, DURATION), duration: DURATION, at, rate }));
    at += step * 1000;
  }
  return { fired: out, at };
}

test('watching the whole video fires 25, 50, 75 and complete in order', () => {
  const tracker = createWatchTracker();
  const { fired } = play(tracker, 0, DURATION);
  assert.deepEqual(fired, [25, 50, 75, 'complete']);
  assert.ok(tracker.watched >= DURATION * 0.99);
});

test('seeking straight to the end fires nothing, and ended does not count as complete', () => {
  const tracker = createWatchTracker();
  play(tracker, 0, 3);
  tracker.interrupt(); // seeking
  const { fired } = play(tracker, DURATION - 2, DURATION, { startAt: 10000 });
  assert.deepEqual(fired, []);
  assert.deepEqual(tracker.ended({ duration: DURATION }), []);
  assert.ok(tracker.watched < 6);
});

test('a jump without a seeking event is rejected as implausible', () => {
  const tracker = createWatchTracker();
  tracker.tick({ currentTime: 1, duration: DURATION, at: 0 });
  assert.deepEqual(tracker.tick({ currentTime: 60, duration: DURATION, at: 250 }), []);
  assert.ok(tracker.watched < 1);
});

test('fast playback counts: 16x still reaches every milestone', () => {
  const tracker = createWatchTracker();
  const { fired } = play(tracker, 0, DURATION, { rate: 16 });
  assert.deepEqual(fired, [25, 50, 75, 'complete']);
});

test('pausing does not accrue time, and rewatching does not fire twice', () => {
  const tracker = createWatchTracker();
  play(tracker, 0, 10);
  tracker.interrupt(); // pause
  assert.deepEqual(tracker.tick({ currentTime: 10, duration: DURATION, at: 600000 }), []);
  const { fired } = play(tracker, 10, DURATION, { startAt: 600250 });
  assert.deepEqual(fired, [25, 50, 75, 'complete']);
  tracker.interrupt();
  assert.deepEqual(play(tracker, 0, DURATION, { startAt: 900000 }).fired, []);
});

test('ended after 90% watched is complete even if 95% was not reached', () => {
  const tracker = createWatchTracker();
  const { fired } = play(tracker, 0, 64);
  assert.deepEqual(fired, [25, 50, 75]);
  assert.deepEqual(tracker.ended({ duration: DURATION }), ['complete']);
  assert.deepEqual(tracker.ended({ duration: DURATION }), []);
});
