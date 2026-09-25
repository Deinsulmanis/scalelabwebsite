/**
 * Video progress from WATCHED time, not playhead position, so seeking or
 * dragging through the video cannot fire milestones.
 *
 * Each timeupdate adds the playhead's advance only when it is plausible for
 * real playback: forward, and no more than the wall-clock time since the last
 * update times the playback rate (plus a small tolerance). A seek, a jump or a
 * pause-then-resume adds nothing.
 *
 *   25 / 50 / 75  watched >= that share of the duration
 *   complete      watched >= 95%, or the video ended after >= 90% was watched
 */

export const MILESTONES = Object.freeze([25, 50, 75]);
export const COMPLETE_SHARE = 0.95;
export const ENDED_SHARE = 0.9;
const TOLERANCE_S = 0.75;

export function createWatchTracker() {
  let watched = 0;
  let last = null;
  const fired = new Set();

  function crossed(duration) {
    const out = [];
    if (!(duration > 0) || !Number.isFinite(duration)) return out;
    for (const milestone of MILESTONES) {
      if (!fired.has(milestone) && watched >= (duration * milestone) / 100) { fired.add(milestone); out.push(milestone); }
    }
    if (!fired.has('complete') && watched >= duration * COMPLETE_SHARE) { fired.add('complete'); out.push('complete'); }
    return out;
  }

  return {
    /** A timeupdate. at: a monotonic clock in ms. Returns the milestones crossed now. */
    tick({ currentTime, duration, at, rate = 1 }) {
      if (last) {
        const advance = currentTime - last.time;
        const elapsed = Math.max(0, at - last.at) / 1000;
        if (advance > 0 && advance <= elapsed * Math.max(rate, 0.1) + TOLERANCE_S) watched += advance;
      }
      last = { time: currentTime, at };
      return crossed(duration);
    },
    /** seeking / pause / waiting: the next update starts a fresh interval. */
    interrupt() { last = null; },
    /** ended: completion if enough was actually watched. */
    ended({ duration }) {
      last = null;
      if (!fired.has('complete') && duration > 0 && watched >= duration * ENDED_SHARE) {
        fired.add('complete');
        return ['complete'];
      }
      return [];
    },
    get watched() { return watched; },
  };
}
