import assert from 'node:assert/strict';
import test from 'node:test';
import { createOnboarding } from '../onboarding.js';
import { ONBOARDING_KEY, shouldShowOnboarding } from '../onboarding-state.js';

class Node {
  constructor(tag, attributes, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.dataset = {};
    this.isConnected = true;
    this.textContent = '';
    for (const match of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ''] = match;
      this.attributes.set(name, value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
    this.value = this.attributes.get('value') || '';
    this.hidden = this.attributes.has('hidden');
    this.disabled = this.attributes.has('disabled');
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  focus(options) { this.ownerDocument.activeElement = this; this.lastFocus = options; }
  closest(selector) { return selector === '[data-guide-action]' && this.dataset.guideAction ? this : null; }
  getAnimations() { return []; }
}

class Dialog extends EventTarget {
  dataset = {};
  open = false;
  nodes = [];
  scrollTop = 0;
  constructor(ownerDocument) { super(); this.ownerDocument = ownerDocument; }
  set innerHTML(html) {
    for (const node of this.nodes) node.isConnected = false;
    this.html = html;
    this.nodes = [...html.matchAll(/<(h2|div|section|input|button|strong|p)\b([^>]*)>/g)].map(([, tag, attributes]) => new Node(tag, attributes, this.ownerDocument));
  }
  get innerHTML() { return this.html; }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.nodes.find(node => node.getAttribute('id') === selector.slice(1)) || null;
    if (selector.startsWith('.')) return this.nodes.find(node => (node.getAttribute('class') || '').split(' ').includes(selector.slice(1))) || null;
    const action = selector.match(/^\[data-guide-action="([^"]+)"\]$/)?.[1];
    return this.nodes.find(node => node.dataset.guideAction === action) || null;
  }
  contains(node) { return this.nodes.includes(node); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
}

function dispatch(dialog, type, target, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  return dialog.dispatchEvent(event);
}

function setup() {
  const originals = new Map(['localStorage', 'setInterval', 'clearInterval'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalNow = Date.now;
  let now = 1000000;
  Date.now = () => now;
  const values = new Map([['gym-log-v2', '{"existing":"training data must remain intact"}']]);
  const writes = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push(key); values.set(key, value); } };
  const timers = new Map();
  let timerId = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'setInterval', { configurable: true, value: callback => { timers.set(++timerId, callback); return timerId; } });
  Object.defineProperty(globalThis, 'clearInterval', { configurable: true, value: id => timers.delete(id) });
  const document = { activeElement: null };
  const trigger = new Node('button', '', document);
  document.activeElement = trigger;
  const dialog = new Dialog(document);
  const calls = [];
  const guide = createOnboarding({ dialog, icon: name => `<svg aria-hidden="true" data-icon="${name}"></svg>`, onChooseRoutine: () => calls.push('routine'), onTrain: () => calls.push('train') });
  return {
    guide, dialog, trigger, calls, storage, timers, values, writes,
    status: () => JSON.parse(storage.getItem(ONBOARDING_KEY)).status,
    click(action, mode) {
      const node = dialog.nodes.find(candidate => candidate.dataset.guideAction === action && (!mode || candidate.dataset.guideMode === mode));
      assert.ok(node, `Missing ${action} control`);
      dispatch(dialog, 'click', node, { detail: 1 });
    },
    input(id, value) { const node = dialog.querySelector(`#${id}`); node.value = value; dispatch(dialog, 'input', node); },
    tick(seconds) { now += seconds * 1000; for (const callback of [...timers.values()]) callback(); },
    restore() {
      guide.close();
      Date.now = originalNow;
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('first open offers both guides; skip is persisted without touching training data', () => {
  const app = setup();
  try {
    app.guide.open();
    assert.equal(app.dialog.open, true);
    assert.match(app.dialog.innerHTML, /Tutorial rápido/);
    assert.match(app.dialog.innerHTML, /Guía detallada/);
    assert.equal(app.status(), 'started');
    assert.equal(app.dialog.ownerDocument.activeElement.getAttribute('id'), 'guide-title');
    app.click('skip');
    assert.equal(app.status(), 'skipped');
    assert.equal(app.dialog.open, false);
    assert.equal(app.dialog.ownerDocument.activeElement, app.trigger);
    assert.equal(app.values.get('gym-log-v2'), '{"existing":"training data must remain intact"}');
    assert.ok(app.writes.every(key => key === ONBOARDING_KEY));
    assert.equal(shouldShowOnboarding({ sessions: [], profile: {} }, app.storage), false);
    assert.deepEqual(app.calls, []);
  } finally { app.restore(); }
});

test('simple and detailed guides expose four and seven steps and can change mode', () => {
  const app = setup();
  try {
    app.guide.open('simple');
    assert.match(app.dialog.innerHTML, /Paso 1 de 4/);
    assert.match(app.dialog.innerHTML, /Un plan que encaje contigo/);
    app.click('back');
    assert.match(app.dialog.innerHTML, /¿Cómo quieres empezar\?/);
    app.click('choose', 'detailed');
    assert.match(app.dialog.innerHTML, /Paso 1 de 7/);
    app.click('next');
    assert.match(app.dialog.innerHTML, /Paso 2 de 7/);
    app.guide.close();
    app.guide.open('detailed');
    assert.match(app.dialog.innerHTML, /Paso 1 de 7/);
    assert.equal(app.status(), 'started');
  } finally { app.restore(); }
});

test('practice validates inputs, uses edited load for suggestion, and counts elapsed time rather than ticks', () => {
  const app = setup();
  try {
    app.guide.open('simple'); app.click('next');
    app.input('guide-demo-weight', '70');
    app.input('guide-demo-reps', '2.5');
    app.click('demo-complete');
    assert.equal(app.timers.size, 0);
    assert.equal(app.dialog.querySelector('#guide-demo-reps').getAttribute('aria-invalid'), 'true');
    assert.equal(app.dialog.querySelector('.guide-demo-next').hidden, true);
    assert.equal(app.dialog.querySelector('[data-guide-action="demo-complete"]').disabled, false);
    app.input('guide-demo-reps', '12'); app.click('demo-complete');
    assert.equal(app.dialog.querySelector('#guide-demo-suggestion').textContent, '70 kg × 12 repeticiones');
    assert.equal(app.dialog.querySelector('#guide-demo-clock').textContent, '01:30');
    assert.equal(app.timers.size, 1);
    app.tick(35);
    assert.equal(app.dialog.querySelector('#guide-demo-clock').textContent, '00:55');
    app.tick(60);
    assert.equal(app.dialog.querySelector('#guide-demo-clock').textContent, '00:00');
    assert.equal(app.timers.size, 0);
    assert.match(app.dialog.querySelector('#guide-demo-status').textContent, /terminado/);
    assert.ok(app.writes.every(key => key === ONBOARDING_KEY));
  } finally { app.restore(); }
});

test('practice can always be skipped and its timer is cleaned on navigation or close', () => {
  const app = setup();
  try {
    app.guide.open('simple'); app.click('next');
    app.input('guide-demo-weight', ''); app.click('demo-complete');
    app.click('next');
    assert.match(app.dialog.innerHTML, /Paso 3 de 4/);
    assert.equal(app.timers.size, 0);
    app.click('back'); app.click('demo-complete');
    assert.equal(app.dialog.querySelector('#guide-demo-suggestion').textContent, '60 kg × 10 repeticiones');
    assert.equal(app.timers.size, 1);
    app.click('next');
    assert.equal(app.timers.size, 0);
    app.click('back'); app.click('demo-complete');
    assert.equal(app.timers.size, 1);
    app.guide.close();
    assert.equal(app.timers.size, 0);
    assert.equal(app.status(), 'skipped');
  } finally { app.restore(); }
});

test('Escape and native close clean the practice timer and persist a single dismissal', () => {
  const app = setup();
  try {
    app.guide.open('simple'); app.click('next'); app.click('demo-complete');
    assert.equal(app.dialog.dispatchEvent(new Event('cancel', { cancelable: true })), false);
    assert.equal(app.dialog.open, false);
    assert.equal(app.timers.size, 0);
    assert.equal(app.status(), 'skipped');
    const count = app.writes.length;
    app.dialog.dispatchEvent(new Event('close'));
    assert.equal(app.writes.length, count);
    app.guide.open('simple'); app.click('next'); app.click('demo-complete');
    app.dialog.close();
    assert.equal(app.timers.size, 0);
    assert.equal(app.status(), 'skipped');
  } finally { app.restore(); }
});

test('final actions mark completion and call the selected destination exactly once', () => {
  const app = setup();
  try {
    app.guide.open('simple');
    for (let step = 1; step < 4; step++) app.click('next');
    assert.match(app.dialog.innerHTML, /Guardar imagen/);
    assert.match(app.dialog.innerHTML, /Copia completa/);
    app.click('routine');
    assert.equal(app.status(), 'completed');
    assert.equal(app.dialog.open, false);
    assert.deepEqual(app.calls, ['routine']);
    app.guide.close();
    assert.equal(app.status(), 'completed');
    app.guide.open('detailed');
    for (let step = 1; step < 7; step++) app.click('next');
    assert.match(app.dialog.innerHTML, /sin mezclarlo/);
    app.click('train');
    assert.equal(app.status(), 'completed');
    assert.deepEqual(app.calls, ['routine', 'train']);
    assert.ok(app.writes.every(key => key === ONBOARDING_KEY));
  } finally { app.restore(); }
});

test('a delayed native close event cannot dismiss a newly reopened guide', () => {
  const app = setup();
  try {
    app.guide.open(); app.guide.close(); app.guide.open('simple');
    app.dialog.dispatchEvent(new Event('close'));
    assert.equal(app.dialog.open, true);
    assert.equal(app.status(), 'started');
    assert.match(app.dialog.innerHTML, /Paso 1 de 4/);
  } finally { app.restore(); }
});
