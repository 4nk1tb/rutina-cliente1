import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboarding, positionTour } from '../onboarding.js';
import { ONBOARDING_KEY, shouldShowOnboarding } from '../onboarding-state.js';

function dispatch(surface, type, target, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  surface.dispatchEvent(event);
  return event;
}

class TrackedEvents extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
}
class Node {
  constructor(tag, attributes, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.isConnected = true;
    this.textContent = '';
    this.rectangle = { left: 40, top: 180, right: 340, bottom: 236, width: 300, height: 56 };
    for (const match of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ''] = match;
      this.attributes.set(name, value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    this.hidden = this.attributes.has('hidden');
    this.disabled = this.attributes.has('disabled');
    if ((this.getAttribute('class') || '').includes('tour-card')) this.rectangle = { left: 16, top: 400, right: 374, bottom: 680, width: 358, height: 280 };
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getBoundingClientRect() { return this.rectangle; }
  scrollIntoView(options) { this.lastScroll = options; this.scrollCount = (this.scrollCount || 0) + 1; this.appliedScrollMargin = this.style.scrollMarginTop; }
  focus(options) {
    this.ownerDocument.activeElement = this;
    this.lastFocus = options;
    dispatch(this.ownerDocument, 'focusin', this);
  }
  closest(selector) {
    if (selector === '[data-guide-action]') return this.dataset.guideAction ? this : null;
    return selector.startsWith('button,') && ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) ? this : null;
  }
  getAnimations() { return []; }
}
class Dialog extends EventTarget {
  dataset = {};
  open = false;
  nodes = [];
  attributes = new Map();
  constructor(ownerDocument) {
    super(); this.ownerDocument = ownerDocument;
    const classes = new Set();
    this.classList = { contains: value => classes.has(value), remove: value => classes.delete(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) };
  }
  set innerHTML(html) {
    for (const node of this.nodes) node.isConnected = false;
    this.html = html;
    this.nodes = [...html.matchAll(/<(h2|div|section|button|p)\b([^>]*)>/g)].map(([, tag, attributes]) => new Node(tag, attributes, this.ownerDocument));
  }
  get innerHTML() { return this.html; }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.nodes.find(node => node.getAttribute('id') === selector.slice(1)) || null;
    const className = selector.match(/^\.([\w-]+)/)?.[1];
    const attribute = selector.match(/\[([\w-]+)="([^"]+)"\]/);
    return this.nodes.find(node => (!className || (node.getAttribute('class') || '').split(' ').includes(className)) && (!attribute || node.getAttribute(attribute[1]) === attribute[2])) || null;
  }
  contains(node) { return this.nodes.includes(node); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  showModal() { this.open = true; this.modal = true; }
  show() { this.open = true; this.modal = false; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}

function setup({ missingTarget = false, replacementFocus = false, focusDuringStep = false, width = 390, height = 844 } = {}) {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([['gym-log-v2', '{"existing":"training data must remain intact"}']]);
  const writes = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push(key); values.set(key, value); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const window = new TrackedEvents();
  window.innerWidth = width; window.innerHeight = height;
  window.visualViewport = new TrackedEvents();
  Object.assign(window.visualViewport, { width, height, offsetLeft: 0, offsetTop: 0 });
  const frames = new Map();
  let nextFrame = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.queueMicrotask = queueMicrotask;
  const observers = [];
  window.ResizeObserver = class {
    observed = new Set();
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(node) { this.observed.add(node); }
    disconnect() { this.observed.clear(); }
  };
  const document = new TrackedEvents();
  document.defaultView = window;
  const trigger = new Node('button', '', document);
  const replacement = new Node('button', '', document);
  const target = new Node('button', '', document);
  document.activeElement = trigger;
  const dialog = new Dialog(document);
  const calls = [];
  const guide = createOnboarding({
    dialog, icon: name => `<svg aria-hidden="true" data-icon="${name}"></svg>`,
    onStart: mode => calls.push(`start:${mode}`),
    onStep: key => {
      calls.push(`step:${key}`);
      if (focusDuringStep) target.focus();
      return { target: missingTarget ? null : target, title: `< ${key} & Repite`, description: `Controles de ${key}`, name: key };
    },
    onRestore: () => { calls.push('restore'); return replacementFocus ? replacement : null; },
    onComplete: () => calls.push('complete'),
    onChooseRoutine: () => calls.push('routine'),
    onTrain: () => calls.push('train'),
  });
  return {
    guide, dialog, trigger, replacement, target, calls, storage, values, writes, document, window, frames, observers,
    status: () => JSON.parse(storage.getItem(ONBOARDING_KEY)).status,
    click(action, mode) {
      const node = dialog.nodes.find(candidate => candidate.dataset.guideAction === action && (!mode || candidate.dataset.guideMode === mode));
      assert.ok(node, `Missing ${action} control`);
      dispatch(dialog, 'click', node, { detail: 1 });
    },
    flushFrame() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
    restore() {
      guide.close();
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      else delete globalThis.localStorage;
    },
  };
}

test('first-open chooser is modal; skip persists only its marker and restores opener focus', () => {
  const app = setup();
  try {
    app.guide.open();
    assert.equal(app.dialog.open, true);
    assert.equal(app.dialog.modal, true);
    assert.match(app.dialog.innerHTML, /Tutorial rápido/);
    assert.match(app.dialog.innerHTML, /Guía detallada/);
    assert.doesNotMatch(app.dialog.innerHTML, /serie de prueba/);
    assert.equal(app.status(), 'started');
    app.click('skip');
    assert.equal(app.status(), 'skipped');
    assert.equal(app.dialog.open, false);
    assert.equal(app.document.activeElement, app.trigger);
    assert.equal(app.values.get('gym-log-v2'), '{"existing":"training data must remain intact"}');
    assert.ok(app.writes.every(key => key === ONBOARDING_KEY));
    assert.equal(shouldShowOnboarding({ sessions: [], profile: {} }, app.storage), false);
    assert.deepEqual(app.calls, []);
  } finally { app.restore(); }
});

test('both tours navigate real sections using four or seven steps without creating a practice session', () => {
  const app = setup({ focusDuringStep: true });
  try {
    app.guide.open('simple');
    assert.equal(app.dialog.modal, false);
    assert.equal(app.dialog.classList.contains('guide-tour'), true);
    assert.match(app.dialog.innerHTML, /Paso 1 de 4/);
    assert.match(app.dialog.innerHTML, /&lt; routine &amp; Repite/);
    assert.doesNotMatch(app.dialog.innerHTML, /guide-demo/);
    assert.deepEqual(app.target.lastScroll, { block: 'start', inline: 'nearest', behavior: 'instant' });
    for (let step = 1; step < 4; step++) app.click('next');
    assert.deepEqual(app.calls.filter(call => call.startsWith('step:')), ['step:routine', 'step:sets', 'step:progress', 'step:history']);
    app.click('complete');
    app.guide.open('detailed');
    assert.match(app.dialog.innerHTML, /Paso 1 de 7/);
    for (let step = 1; step < 7; step++) app.click('next');
    assert.deepEqual(app.calls.filter(call => call.startsWith('step:')).slice(4), ['step:routine', 'step:start', 'step:sets', 'step:progress', 'step:history', 'step:profile', 'step:backup']);
    assert.ok(app.writes.every(key => key === ONBOARDING_KEY));
  } finally { app.restore(); }
});

test('back from the first step restores the initial UI before showing the chooser and captures again', () => {
  const app = setup();
  try {
    app.guide.open('simple');
    app.click('next'); app.click('back');
    assert.match(app.dialog.innerHTML, /Paso 1 de 4/);
    app.click('back');
    assert.equal(app.dialog.modal, true);
    assert.equal(app.dialog.classList.contains('guide-tour'), false);
    assert.equal(app.calls.filter(call => call === 'restore').length, 1);
    assert.equal(app.frames.size, 0);
    app.click('choose', 'detailed');
    assert.match(app.dialog.innerHTML, /Paso 1 de 7/);
    assert.equal(app.calls.filter(call => call.startsWith('start:')).length, 2);
  } finally { app.restore(); }
});

test('Escape and ordinary dismissal restore UI, focus a replacement opener and clean observers', () => {
  const app = setup({ replacementFocus: true });
  try {
    app.guide.open('detailed');
    assert.ok(app.frames.size > 0);
    assert.ok(app.observers.some(observer => observer.observed.size > 0));
    const escape = dispatch(app.document, 'keydown', app.target, { key: 'Escape' });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(app.dialog.open, false);
    assert.equal(app.status(), 'skipped');
    assert.equal(app.document.activeElement, app.replacement);
    assert.equal(app.frames.size, 0);
    assert.ok(app.observers.every(observer => observer.observed.size === 0));
    assert.equal(app.document.listeners.get('scroll').size, 0);
    assert.equal(app.window.listeners.get('resize').size, 0);
    assert.equal(app.window.visualViewport.listeners.get('scroll').size, 0);
    assert.equal(app.document.listeners.get('keydown').size, 0);
    app.guide.close();
    assert.equal(app.calls.filter(call => call === 'restore').length, 1);
  } finally { app.restore(); }
});

test('a real control click exits the tour without preventing the action or restoring the old screen', async () => {
  const app = setup();
  try {
    app.guide.open('simple');
    await Promise.resolve();
    const event = dispatch(app.document, 'click', app.target, { detail: 1 });
    assert.equal(event.defaultPrevented, false);
    assert.equal(app.dialog.open, false);
    assert.equal(app.status(), 'skipped');
    assert.ok(!app.calls.includes('restore'));
    assert.equal(app.frames.size, 0);
  } finally { app.restore(); }
});

test('keyboard focus outside exits without stealing focus; initial opener event does not dismiss', async () => {
  const app = setup();
  try {
    app.guide.open('simple');
    dispatch(app.document, 'click', app.trigger, { detail: 1 });
    assert.equal(app.dialog.open, true);
    await Promise.resolve();
    app.target.focus();
    assert.equal(app.dialog.open, false);
    assert.equal(app.document.activeElement, app.target);
    assert.ok(!app.calls.includes('restore'));
  } finally { app.restore(); }
});

test('tapping empty page space does not end the tour', async () => {
  const app = setup();
  try {
    app.guide.open('simple');
    await Promise.resolve();
    const background = new Node('div', '', app.document);
    dispatch(app.document, 'click', background, { detail: 1 });
    assert.equal(app.dialog.open, true);
    assert.equal(app.status(), 'started');
  } finally { app.restore(); }
});

test('mobile steps and viewport resizing align the target above the card without leaving styles or reacting to ordinary scroll', () => {
  const app = setup();
  try {
    app.target.style.scrollMarginTop = '17px';
    app.guide.open('simple');
    assert.equal(app.target.appliedScrollMargin, '100px');
    assert.equal(app.target.style.scrollMarginTop, '17px');
    const before = app.target.scrollCount;
    dispatch(app.document, 'scroll', app.target);
    app.flushFrame();
    assert.equal(app.target.scrollCount, before);
    app.window.visualViewport.offsetTop = 25;
    dispatch(app.window.visualViewport, 'resize', app.window.visualViewport);
    assert.equal(app.target.scrollCount, before + 1);
    assert.equal(app.target.appliedScrollMargin, '125px');
    assert.equal(app.target.style.scrollMarginTop, '17px');
    app.guide.close();
    assert.equal(app.frames.size, 0);
    dispatch(app.window.visualViewport, 'resize', app.window.visualViewport);
    assert.equal(app.target.scrollCount, before + 1);
  } finally { app.restore(); }
});

test('desktop steps retain centered target alignment', () => {
  const app = setup({ width: 1440, height: 900 });
  try {
    app.target.style.scrollMarginTop = '17px';
    app.guide.open('simple');
    assert.deepEqual(app.target.lastScroll, { block: 'center', inline: 'nearest', behavior: 'instant' });
    assert.equal(app.target.style.scrollMarginTop, '17px');
  } finally { app.restore(); }
});

test('completion preserves the current section and invokes its destination exactly once', () => {
  const app = setup();
  try {
    app.guide.open('simple');
    for (let step = 1; step < 4; step++) app.click('next');
    app.click('complete');
    app.guide.close();
    assert.equal(app.status(), 'completed');
    assert.equal(app.calls.filter(call => call === 'complete').length, 1);
    assert.ok(!app.calls.includes('restore'));
    app.guide.open('detailed');
    for (let step = 1; step < 7; step++) app.click('next');
    app.click('train');
    assert.equal(app.status(), 'completed');
    assert.equal(app.calls.filter(call => call === 'train').length, 1);
    assert.ok(!app.calls.includes('restore'));
  } finally { app.restore(); }
});

test('missing targets fall back to a usable centered card and delayed native close is harmless', () => {
  const app = setup({ missingTarget: true });
  try {
    app.guide.open(); app.click('choose', 'simple');
    app.dialog.dispatchEvent(new Event('close'));
    assert.equal(app.dialog.open, true);
    assert.equal(app.dialog.querySelector('.tour-spotlight').hidden, true);
    assert.equal(app.dialog.querySelector('.tour-card').style.left, '16px');
    assert.equal(app.dialog.querySelector('.tour-card').style.top, '282px');
    app.guide.close(); app.guide.open('detailed');
    app.dialog.dispatchEvent(new Event('close'));
    assert.equal(app.status(), 'started');
    assert.match(app.dialog.innerHTML, /Paso 1 de 7/);
  } finally { app.restore(); }
});

function assertUsable(result, viewport, cardHeight) {
  const { card, spotlight, shades } = result;
  assert.ok(card.left >= viewport.left);
  assert.ok(card.top >= viewport.top);
  assert.ok(card.left + card.width <= viewport.left + viewport.width);
  assert.ok(card.top + Math.min(cardHeight, card.maxHeight) <= viewport.top + viewport.height);
  for (const shade of Object.values(shades)) for (const number of Object.values(shade)) assert.ok(Number.isFinite(number) && number >= 0);
  if (spotlight) {
    const overlapX = card.left < spotlight.left + spotlight.width && card.left + card.width > spotlight.left;
    const overlapY = card.top < spotlight.top + spotlight.height && card.top + Math.min(cardHeight, card.maxHeight) > spotlight.top;
    assert.equal(overlapX && overlapY, false, 'Card must not cover the highlighted control');
  }
}

test('placement keeps a highlighted control separate from the card on small and desktop screens', () => {
  for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
    for (const fraction of [.05, .4, .85]) {
      const viewport = { left: 0, top: 0, width, height };
      const top = height * fraction;
      const target = { left: 24, right: width - 24, top, bottom: top + 48 };
      const result = positionTour({ viewport, target, cardHeight: 280 });
      assertUsable(result, viewport, 280);
      assert.ok(result.spotlight, 'A visible compact target remains highlighted');
    }
  }
});

test('placement accounts for keyboard visual viewport offsets and safely clips oversized targets', () => {
  const viewport = { left: 20, top: 190, width: 390, height: 350 };
  const target = { left: 30, top: 170, right: 390, bottom: 680 };
  assertUsable(positionTour({ viewport, target, cardHeight: 280 }), viewport, 280);
  const missing = positionTour({ viewport, target: null, cardHeight: 500 });
  assert.equal(missing.spotlight, null);
  assertUsable(missing, viewport, 500);
  assert.deepEqual(missing.shades.top, { left: 20, top: 190, width: 390, height: 350 });
});

test('a full mobile explanation can use 360px below an aligned set row without covering it', () => {
  const viewport = { left: 0, top: 0, width: 320, height: 568 };
  const target = { left: 24, right: 296, top: 100, bottom: 168 };
  const result = positionTour({ viewport, target, cardHeight: 360 });
  assert.equal(result.card.maxHeight, 360);
  assert.equal(result.card.top, 188);
  assertUsable(result, viewport, 360);
  assert.ok(result.spotlight);
});
