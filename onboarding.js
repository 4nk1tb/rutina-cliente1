import { markOnboardingSeen } from './onboarding-state.js';
import { createMotion } from './motion.js';

const ROUTES = {
  simple: ['routine', 'sets', 'progress', 'history'],
  detailed: ['routine', 'start', 'sets', 'progress', 'history', 'profile', 'backup'],
};
const CARD_MAX_HEIGHT = 360;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** Positions the card inside the visible viewport, including an iPhone keyboard. */
export function positionTour({ viewport, target, cardHeight = 280, cardWidth = 360 }) {
  const left = Number(viewport.left) || 0;
  const top = Number(viewport.top) || 0;
  const width = Math.max(1, Number(viewport.width) || 1);
  const height = Math.max(1, Number(viewport.height) || 1);
  const margin = Math.min(16, width / 8, height / 8);
  const gap = 12;
  const right = left + width;
  const bottom = top + height;
  const innerLeft = left + margin;
  const innerTop = top + margin;
  const innerRight = right - margin;
  const innerBottom = bottom - margin;
  const availableWidth = Math.max(1, width - margin * 2);
  const availableHeight = Math.max(1, height - margin * 2);
  const actualWidth = Math.min(cardWidth, availableWidth);
  const actualHeight = Math.min(Math.max(1, cardHeight), CARD_MAX_HEIGHT, availableHeight);
  const card = { left: innerLeft + (availableWidth - actualWidth) / 2, top: innerTop + (availableHeight - actualHeight) / 2, width: actualWidth, maxHeight: Math.min(CARD_MAX_HEIGHT, availableHeight) };
  let spotlight = null;
  if (target && [target.left, target.top, target.right, target.bottom].every(Number.isFinite)) {
    const clipped = {
      left: Math.max(innerLeft, target.left - 8), top: Math.max(innerTop, target.top - 8),
      right: Math.min(innerRight, target.right + 8), bottom: Math.min(innerBottom, target.bottom + 8),
    };
    if (clipped.right > clipped.left && clipped.bottom > clipped.top) {
      spotlight = clipped;
      const below = innerBottom - clipped.bottom - gap;
      const above = clipped.top - innerTop - gap;
      const onRight = innerRight - clipped.right - gap;
      const onLeft = clipped.left - innerLeft - gap;
      const centeredLeft = clamp((clipped.left + clipped.right - actualWidth) / 2, innerLeft, innerRight - actualWidth);
      const centeredTop = clamp((clipped.top + clipped.bottom - actualHeight) / 2, innerTop, innerBottom - actualHeight);
      if (width >= 700 && onRight >= actualWidth) {
        card.left = clipped.right + gap; card.top = centeredTop;
      } else if (width >= 700 && onLeft >= actualWidth) {
        card.left = clipped.left - gap - actualWidth; card.top = centeredTop;
      } else if (below >= actualHeight) {
        card.left = centeredLeft; card.top = clipped.bottom + gap;
      } else if (above >= actualHeight) {
        card.left = centeredLeft; card.top = clipped.top - gap - actualHeight;
      } else if (Math.max(above, below) >= Math.min(actualHeight, 160)) {
        // Let the card scroll on a short screen rather than cover its target.
        const putBelow = below >= above;
        card.left = centeredLeft;
        card.maxHeight = Math.min(card.maxHeight, putBelow ? below : above);
        card.top = putBelow ? clipped.bottom + gap : clipped.top - gap - card.maxHeight;
      } else {
        // A large target must never push the controls out of the viewport.
        // Keep a useful slice highlighted on the opposite side of the card.
        card.left = centeredLeft;
        const putBelow = (clipped.top + clipped.bottom) / 2 <= (innerTop + innerBottom) / 2;
        card.top = putBelow ? innerBottom - actualHeight : innerTop;
        if (putBelow) spotlight.bottom = Math.min(spotlight.bottom, card.top - gap);
        else spotlight.top = Math.max(spotlight.top, card.top + actualHeight + gap);
        if (spotlight.bottom <= spotlight.top) spotlight = null;
      }
    }
  }
  const spot = spotlight ? { left: spotlight.left, top: spotlight.top, width: spotlight.right - spotlight.left, height: spotlight.bottom - spotlight.top } : null;
  const shades = spot ? {
    top: { left, top, width, height: spot.top - top },
    bottom: { left, top: spot.top + spot.height, width, height: bottom - spot.top - spot.height },
    left: { left, top: spot.top, width: spot.left - left, height: spot.height },
    right: { left: spot.left + spot.width, top: spot.top, width: right - spot.left - spot.width, height: spot.height },
  } : {
    top: { left, top, width, height },
    bottom: { left, top, width: 0, height: 0 },
    left: { left, top, width: 0, height: 0 },
    right: { left, top, width: 0, height: 0 },
  };
  return { card, spotlight: spot, shades };
}

/** A presentation-only tour. The host owns navigation and all training state. */
export function createOnboarding({ dialog, icon = () => '', onStart, onStep, onRestore, onComplete, onChooseRoutine, onTrain }) {
  const document = dialog.ownerDocument;
  const window = document.defaultView || globalThis;
  const motion = createMotion(dialog);
  let active = false;
  let phase = 'closed';
  let mode = null;
  let index = 0;
  let returnFocus = null;
  let captured = false;
  let navigating = false;
  let transitioning = false;
  let activationPending = false;
  let target = null;
  let pendingFrame = null;
  let resizeObserver = null;
  let observing = false;
  const find = selector => dialog.querySelector(selector);
  const glyph = name => icon(name);

  function focusTitle() { find('#guide-title')?.focus({ preventScroll: true }); }
  function visible(element) {
    if (!element?.isConnected) return false;
    const rectangle = element.getBoundingClientRect?.();
    return !rectangle || (rectangle.width > 0 && rectangle.height > 0);
  }
  function header(title, description) {
    return `<div class="dialog-header guide-header"><div><h2 id="guide-title" tabindex="-1">${escapeHTML(title)}</h2><p id="guide-description" class="caption">${escapeHTML(description)}</p></div><button type="button" class="icon-btn" data-guide-action="close" aria-label="Cerrar guía">${glyph('close')}</button></div>`;
  }
  function cancelFrame() {
    if (pendingFrame === null) return;
    window.cancelAnimationFrame?.(pendingFrame);
    pendingFrame = null;
  }
  function viewport() {
    const visual = window.visualViewport;
    return {
      left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
      width: visual?.width || window.innerWidth || document.documentElement?.clientWidth || 390,
      height: visual?.height || window.innerHeight || document.documentElement?.clientHeight || 844,
    };
  }
  function applyRectangle(element, rectangle) {
    if (!element) return;
    for (const key of ['left', 'top', 'width', 'height', 'maxHeight']) {
      if (rectangle[key] !== undefined) element.style[key] = `${Math.max(0, rectangle[key])}px`;
    }
  }
  function position() {
    if (!active || phase !== 'tour' || !dialog.open) return;
    const card = find('.tour-card');
    if (!card) return;
    const bounds = viewport();
    card.style.width = `${Math.min(360, Math.max(1, bounds.width - 32))}px`;
    card.style.maxHeight = `${Math.min(CARD_MAX_HEIGHT, Math.max(1, bounds.height - 32))}px`;
    const cardBounds = card.getBoundingClientRect?.();
    const result = positionTour({ viewport: bounds, target: visible(target) ? target.getBoundingClientRect() : null, cardHeight: cardBounds?.height || card.scrollHeight || 280 });
    applyRectangle(card, result.card);
    const spotlight = find('.tour-spotlight');
    if (spotlight) spotlight.hidden = !result.spotlight;
    if (result.spotlight) applyRectangle(spotlight, result.spotlight);
    for (const side of ['top', 'bottom', 'left', 'right']) applyRectangle(find(`.tour-shade[data-side="${side}"]`), result.shades[side]);
  }
  function schedulePosition() {
    if (!active || phase !== 'tour' || pendingFrame !== null) return;
    if (typeof window.requestAnimationFrame !== 'function') { position(); return; }
    pendingFrame = window.requestAnimationFrame(() => { pendingFrame = null; position(); });
  }
  function alignTarget() {
    if (!active || phase !== 'tour' || !visible(target)) return;
    const bounds = viewport();
    const mobile = bounds.width < 700;
    const previousMargin = target.style.scrollMarginTop;
    navigating = true;
    try {
      if (mobile) target.style.scrollMarginTop = `${bounds.top + 100}px`;
      target.scrollIntoView?.({ block: mobile ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
    } finally {
      if (mobile) target.style.scrollMarginTop = previousMargin || '';
      navigating = false;
    }
  }
  function resized() {
    alignTarget();
    schedulePosition();
  }
  function outsideAction(event) {
    if (!active || phase !== 'tour' || navigating || activationPending || dialog.contains(event.target)) return;
    if (event.type === 'click' && !event.target.closest?.('button, a[href], input, select, textarea, summary, [data-action], [contenteditable="true"], [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [tabindex]:not([tabindex="-1"])')) return;
    // Do not prevent the real action; the tour simply gets out of its way.
    finish('skipped', { restore: false, focus: false });
  }
  function escape(event) {
    if (!active || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }
  function startObservers() {
    if (observing) return;
    observing = true;
    document.addEventListener('click', outsideAction, true);
    document.addEventListener('focusin', outsideAction, true);
    document.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
    window.addEventListener?.('resize', resized, { passive: true });
    window.visualViewport?.addEventListener?.('resize', resized, { passive: true });
    window.visualViewport?.addEventListener?.('scroll', schedulePosition, { passive: true });
    if (typeof window.ResizeObserver === 'function') resizeObserver = new window.ResizeObserver(schedulePosition);
  }
  function stopObservers() {
    cancelFrame();
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (!observing) return;
    observing = false;
    document.removeEventListener('click', outsideAction, true);
    document.removeEventListener('focusin', outsideAction, true);
    document.removeEventListener('scroll', schedulePosition, true);
    window.removeEventListener?.('resize', resized);
    window.visualViewport?.removeEventListener?.('resize', resized);
    window.visualViewport?.removeEventListener?.('scroll', schedulePosition);
  }
  function switchDialog(tour) {
    transitioning = true;
    if (dialog.open) dialog.close();
    dialog.classList.toggle('guide-tour', tour);
    dialog.setAttribute('aria-modal', String(!tour));
    if (tour) dialog.show(); else dialog.showModal();
    transitioning = false;
  }
  function restoreView() {
    if (!captured) return null;
    captured = false;
    navigating = true;
    try { return onRestore?.() || null; }
    finally { navigating = false; }
  }
  function showChooser(animate = true) {
    stopObservers();
    phase = 'chooser';
    mode = null;
    index = 0;
    target = null;
    dialog.innerHTML = header('¿Cómo quieres empezar?', 'Te llevamos por la app y señalamos sus controles. Toca un control para salir y usarlo. Repite las guías en Perfil.') + `
      <div class="guide-body guide-choices">
        <button type="button" class="guide-choice" data-guide-action="choose" data-guide-mode="simple"><span class="guide-choice-icon">${glyph('clock')}</span><span class="guide-choice-copy"><strong class="guide-choice-title">Tutorial rápido</strong><span class="guide-choice-meta">4 pasos · alrededor de 1 minuto</span><span>Rutina, series, progreso y cómo guardar y compartir.</span></span>${glyph('arrow')}</button>
        <button type="button" class="guide-choice" data-guide-action="choose" data-guide-mode="detailed"><span class="guide-choice-icon">${glyph('list')}</span><span class="guide-choice-copy"><strong class="guide-choice-title">Guía detallada</strong><span class="guide-choice-meta">7 pasos · alrededor de 2 minutos</span><span>Todos los apartados, tus ajustes y las copias de seguridad.</span></span>${glyph('arrow')}</button>
      </div><div class="dialog-footer guide-footer"><button type="button" class="btn secondary" data-guide-action="skip">Entrar sin guía</button></div>`;
    switchDialog(false);
    if (animate) motion.content(find('.guide-body'));
    focusTitle();
  }
  function renderStep(animate = true) {
    cancelFrame();
    resizeObserver?.disconnect();
    const route = ROUTES[mode];
    const key = route[index];
    const last = index === route.length - 1;
    let step;
    navigating = true;
    try { step = onStep?.(key) || {}; }
    finally { navigating = false; }
    target = step.target || null;
    alignTarget();
    const progress = `<div class="guide-progress"><p class="caption">${mode === 'simple' ? 'Tutorial rápido' : 'Guía detallada'} · Paso ${index + 1} de ${route.length}${step.name ? ` <span class="guide-step-name">· ${escapeHTML(step.name)}</span>` : ''}</p><div class="guide-dots" aria-hidden="true">${route.map((_, dot) => `<span class="${dot === index ? 'active' : dot < index ? 'visited' : ''}"></span>`).join('')}</div></div>`;
    dialog.innerHTML = `<div class="tour-shade" data-side="top" aria-hidden="true"></div><div class="tour-shade" data-side="bottom" aria-hidden="true"></div><div class="tour-shade" data-side="left" aria-hidden="true"></div><div class="tour-shade" data-side="right" aria-hidden="true"></div><div class="tour-spotlight" aria-hidden="true"></div><section class="tour-card" aria-labelledby="guide-title" aria-describedby="guide-description">${progress}${header(step.title || 'Conoce este apartado', step.description || 'Aquí encontrarás los controles de esta sección. Puedes seguir con la guía o explorar la app.')}
      <div class="dialog-footer guide-footer"><button type="button" class="btn secondary" data-guide-action="back">${glyph('back')} Atrás</button><button type="button" class="btn primary" data-guide-action="${last ? 'complete' : 'next'}">${last ? 'Entendido' : `Siguiente ${glyph('arrow')}`}</button>${last && onTrain ? '<button type="button" class="btn secondary" data-guide-action="train">Ir a entrenar</button>' : ''}<button type="button" class="btn subtle guide-skip" data-guide-action="skip">Omitir guía</button></div></section>`;
    if (!dialog.open || !dialog.classList.contains('guide-tour')) switchDialog(true);
    position();
    focusTitle();
    resizeObserver?.observe(find('.tour-card'));
    if (visible(target)) resizeObserver?.observe(target);
    schedulePosition();
    if (animate) motion.content(find('.tour-card'));
  }
  function beginTour(nextMode) {
    if (!Object.hasOwn(ROUTES, nextMode)) return;
    mode = nextMode;
    index = 0;
    phase = 'tour';
    navigating = true;
    try { onStart?.(nextMode); captured = true; }
    finally { navigating = false; }
    renderStep(false);
    activationPending = true;
    const activate = () => { activationPending = false; };
    if (typeof window.queueMicrotask === 'function') window.queueMicrotask(activate);
    else globalThis.queueMicrotask(activate);
    startObservers();
    resizeObserver?.observe(find('.tour-card'));
    if (visible(target)) resizeObserver?.observe(target);
  }
  function finish(status, { restore = true, focus = true } = {}) {
    if (!active) return;
    active = false;
    phase = 'closed';
    stopObservers();
    document.removeEventListener('keydown', escape, true);
    for (const animation of find('.tour-card')?.getAnimations?.() || find('.guide-body')?.getAnimations?.() || []) animation.cancel();
    markOnboardingSeen(status);
    const previous = returnFocus;
    returnFocus = null;
    transitioning = true;
    if (dialog.open) dialog.close();
    dialog.classList.remove('guide-tour');
    transitioning = false;
    const replacement = restore ? restoreView() : null;
    captured = false;
    target = null;
    const focusTarget = replacement || previous;
    if (focus && visible(focusTarget)) focusTarget.focus?.({ preventScroll: true });
  }
  function close() { finish('skipped'); }
  function open(requestedMode) {
    if (active || dialog.open) return;
    returnFocus = document.activeElement;
    active = true;
    markOnboardingSeen('started');
    document.addEventListener('keydown', escape, true);
    if (Object.hasOwn(ROUTES, requestedMode)) beginTour(requestedMode);
    else showChooser(false);
  }

  dialog.addEventListener('click', event => {
    if (!active) return;
    const button = event.target.closest?.('[data-guide-action]');
    if (!button || !dialog.contains(button) || button.disabled) return;
    switch (button.dataset.guideAction) {
      case 'choose': if (phase === 'chooser') beginTour(button.dataset.guideMode); break;
      case 'back':
        if (phase !== 'tour') break;
        if (index > 0) { index -= 1; renderStep(); }
        else { stopObservers(); restoreView(); showChooser(); }
        break;
      case 'next': if (phase === 'tour' && index < ROUTES[mode].length - 1) { index += 1; renderStep(); } break;
      case 'complete': finish('completed', { restore: false, focus: false }); onComplete?.(); break;
      case 'routine': finish('completed', { restore: false, focus: false }); onChooseRoutine?.(); break;
      case 'train': finish('completed', { restore: false, focus: false }); onTrain?.(); break;
      case 'close':
      case 'skip': close(); break;
    }
  });
  dialog.addEventListener('cancel', event => { if (active) { event.preventDefault(); close(); } });
  dialog.addEventListener('close', () => { if (active && !transitioning && !dialog.open) close(); });
  return { open, close };
}
