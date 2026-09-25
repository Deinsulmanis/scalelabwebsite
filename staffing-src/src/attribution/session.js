/**
 * First-party session model for the staffing page. Pure: storage, clock and id
 * generator are injected, so the rules below are unit-tested directly.
 *
 * Per browser tab (sessionStorage), never across tabs and never persistent:
 *   - a new tab starts a new session (sessionStorage is per tab);
 *   - a reload continues the session and gets a new page-load id;
 *   - arriving with a different link token starts a new session;
 *   - more than 30 minutes without activity starts a new session.
 * No fingerprinting and no cross-session identity recovery: a later visit
 * without the token in a new tab is anonymous.
 */

export const SESSION_KEY = 'sl.lp.session';
export const IDLE_MS = 30 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newUuid(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A stored session, or null when absent or not in the expected shape. */
export function readSession(storage) {
  let parsed = null;
  try { parsed = JSON.parse(storage?.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  if (!parsed || parsed.v !== 1 || !UUID.test(String(parsed.sid)) || !Number.isFinite(parsed.last)) return null;
  if (parsed.t !== null && !TOKEN.test(String(parsed.t))) return null;
  return {
    v: 1, t: parsed.t, sid: parsed.sid, last: parsed.last,
    vms: Number.isFinite(parsed.vms) && parsed.vms >= 0 ? parsed.vms : 0,
    once: parsed.once && typeof parsed.once === 'object' ? parsed.once : {},
  };
}

export function writeSession(storage, state) {
  try { storage?.setItem(SESSION_KEY, JSON.stringify(state)); } catch { /* storage unavailable: in-memory only */ }
}

export function freshSession(token, now, newId) {
  return { v: 1, t: token || null, sid: newId(), last: now, vms: 0, once: {} };
}

/**
 * The session for this page load.
 * @returns { state, isNew, reason } reason: 'none' | 'new_token' | 'idle' | 'continued'
 */
export function resolveSession({ stored, arrivingToken = null, now, newId = newUuid }) {
  if (!stored) return { state: freshSession(arrivingToken, now, newId), isNew: true, reason: 'none' };
  if (arrivingToken && arrivingToken !== stored.t) return { state: freshSession(arrivingToken, now, newId), isNew: true, reason: 'new_token' };
  if (now - stored.last > IDLE_MS) return { state: freshSession(stored.t, now, newId), isNew: true, reason: 'idle' };
  return { state: { ...stored, last: now }, isNew: false, reason: 'continued' };
}

/** Mid-page check: more than 30 minutes since the last activity starts a new session. */
export function continueOrRotate(state, now, newId = newUuid) {
  if (now - state.last > IDLE_MS) return { state: freshSession(state.t, now, newId), rotated: true };
  return { state: { ...state, last: now }, rotated: false };
}
