const THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * Calls `callback` once, after `share` of the element (or of the viewport, if the
 * element is taller) has stayed visible for `ms` without interruption while the
 * document itself is visible. Leaving the viewport or hiding the tab restarts
 * the wait. Returns a function that stops watching.
 */
export function whenVisibleFor(element, { share = 0.5, ms = 1000, win = window, doc = document } = {}, callback) {
  if (!element || !('IntersectionObserver' in win)) return () => {};
  let inView = false;
  let timer = null;
  let done = false;

  const disarm = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
  const arm = () => {
    if (done || timer || !inView || doc.visibilityState !== 'visible') return;
    timer = win.setTimeout(() => {
      timer = null;
      if (done || !inView || doc.visibilityState !== 'visible') return;
      done = true;
      stop();
      callback();
    }, ms);
  };
  const observer = new win.IntersectionObserver((entries) => {
    for (const entry of entries) {
      const visible = entry.isIntersecting
        ? entry.intersectionRect.height / Math.min(entry.boundingClientRect.height, win.innerHeight)
        : 0;
      inView = visible >= share;
    }
    if (inView) arm(); else disarm();
  }, { threshold: THRESHOLDS });
  const onVisibility = () => (doc.visibilityState === 'visible' ? arm() : disarm());

  function stop() {
    observer.disconnect();
    doc.removeEventListener('visibilitychange', onVisibility);
    disarm();
  }

  doc.addEventListener('visibilitychange', onVisibility);
  observer.observe(element);
  return stop;
}
