// Presentation only: training state and timers update before any animation.
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';

export function createMotion(root, media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
  const running = new Map();
  let lastPage = null;
  root.dataset.motion = 'ready';
  root.dataset.input = 'pointer';

  function cancel(element) {
    const animation = running.get(element);
    if (!animation) return;
    running.delete(element);
    animation.cancel();
  }
  function cancelAll() { for (const element of running.keys()) cancel(element); }
  root.addEventListener('keydown', () => { root.dataset.input = 'keyboard'; cancelAll(); }, { capture: true });
  root.addEventListener('pointerdown', () => { root.dataset.input = 'pointer'; }, { capture: true, passive: true });
  root.addEventListener('click', event => {
    if (event.detail === 0) { root.dataset.input = 'keyboard'; cancelAll(); }
  }, { capture: true });
  media?.addEventListener?.('change', event => { if (event.matches) cancelAll(); });

  function play(element, frames, duration = 180, easing = EASE) {
    if (!element) return;
    cancel(element);
    for (const pending of running.keys()) if (!pending.isConnected) cancel(pending);
    if (root.dataset.input === 'keyboard' || typeof element.animate !== 'function') return;
    try {
      const animation = element.animate(frames, { duration, easing });
      running.set(element, animation);
      const clean = () => { if (running.get(element) === animation) running.delete(element); };
      animation.finished.then(clean, clean);
    } catch { /* Unsupported effects never interrupt the action they accompany. */ }
  }

  function page(element, direction = 1) {
    cancel(lastPage);
    lastPage = element;
    const frames = media?.matches
      ? [{ opacity: .85 }, { opacity: 1 }]
      : [{ opacity: .7, transform: `translateX(${direction * 10}px)` }, { opacity: 1, transform: 'translateX(0)' }];
    play(element, frames, media?.matches ? 100 : 200);
  }
  function content(element) { play(element, [{ opacity: .8 }, { opacity: 1 }], media?.matches ? 80 : 140); }
  function setCompleted(button, progress, from, to, completed) {
    if (media?.matches || root.dataset.input === 'keyboard') return;
    if (completed) {
      const check = button?.querySelector('path');
      if (check) {
        check.setAttribute('pathLength', '1');
        play(check, [{ strokeDasharray: '1', strokeDashoffset: 1 }, { strokeDasharray: '1', strokeDashoffset: 0 }], 160, 'linear');
      }
    }
    if (progress && from !== to) play(progress, [{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], 200);
  }
  return { page, content, setCompleted };
}
