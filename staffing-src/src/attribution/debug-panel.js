/**
 * On-page event list for debug mode, which only an internally marked browser can
 * switch on (#sl-debug=1). Shows session state and each first-party event as it
 * is queued. The link token is never shown: only whether one is present.
 */
export function createDebugPanel({ doc = document, boot, getState }) {
  const panel = doc.createElement('aside');
  panel.setAttribute('aria-label', 'Staffing attribution debug');
  panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;width:min(360px,calc(100vw - 24px));max-height:45vh;'
    + 'overflow:auto;padding:10px 12px;background:#010810;color:#F2F2F2;border:1px solid rgba(0,212,255,.45);border-radius:8px;'
    + 'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-shadow:0 12px 32px rgba(0,0,0,.5)';
  const head = doc.createElement('div');
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = 'float:right;background:none;border:1px solid rgba(0,212,255,.45);color:#00D4FF;border-radius:4px;cursor:pointer;padding:2px 8px';
  close.addEventListener('click', () => panel.remove());
  const summary = doc.createElement('div');
  const list = doc.createElement('ol');
  list.style.cssText = 'margin:8px 0 0;padding-left:18px';
  head.append(close, Object.assign(doc.createElement('strong'), { textContent: 'Attribution debug (internal browser)' }));
  panel.append(head, summary, list);

  const describe = () => {
    const state = getState();
    return `session ${String(state.sid).slice(0, 8)} · link token ${state.t ? 'present' : 'none'} · GA ${boot.ga ? 'loaded (debug_mode)' : 'not loaded'}`;
  };
  const mount = () => { if (!panel.isConnected) doc.body.append(panel); summary.textContent = describe(); };
  if (doc.body) mount(); else doc.addEventListener('DOMContentLoaded', mount, { once: true });

  return {
    record(event) {
      summary.textContent = describe();
      const item = doc.createElement('li');
      item.textContent = `${event.n} #${event.s}${event.tr === undefined ? '' : ` trusted=${event.tr}`} ${JSON.stringify(event.p)}`;
      list.append(item);
      while (list.children.length > 30) list.firstElementChild.remove();
      console.debug('[staffing-attribution]', event.n, event.p);
    },
  };
}
