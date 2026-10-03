import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotion } from '../motion.js';

function event(type, values = {}) {
  return Object.assign(new Event(type), values);
}

class Root extends EventTarget {
  dataset = {};
}

class Media extends EventTarget {
  constructor(matches = false) { super(); this.matches = matches; }
  change(matches) {
    this.matches = matches;
    this.dispatchEvent(event('change', { matches }));
  }
}

function element() {
  const animations = [];
  const attributes = new Map();
  const node = {
    isConnected: true,
    animations,
    attributes,
    style: { transform: 'scaleX(0.5)' },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
    animate(frames, options) {
      let resolve, reject;
      const finished = new Promise((done, fail) => { resolve = done; reject = fail; });
      const animation = {
        frames, options, finished, cancellations: 0,
        cancel() { this.cancellations++; reject(new Error('animation cancelled')); },
        finish() { resolve(); }
      };
      animations.push(animation);
      return animation;
    }
  };
  return node;
}

test('keyboard and zero-detail clicks suppress animation until a pointer interaction', () => {
  const root = new Root();
  const motion = createMotion(root, new Media());
  const page = element();
  motion.page(page);
  assert.equal(page.animations.length, 1);
  root.dispatchEvent(event('keydown', { key: 'Tab' }));
  assert.equal(page.animations[0].cancellations, 1);
  motion.page(page);
  motion.content(page);
  assert.equal(page.animations.length, 1);
  assert.equal(root.dataset.input, 'keyboard');
  root.dispatchEvent(event('pointerdown'));
  motion.content(page);
  assert.equal(page.animations.length, 2);
  root.dispatchEvent(event('click', { detail: 0 }));
  assert.equal(page.animations[1].cancellations, 1);
  motion.page(page);
  assert.equal(page.animations.length, 2, 'assistive activation needs no physical keydown to suppress motion');
  root.dispatchEvent(event('pointerdown'));
  motion.page(page);
  assert.equal(page.animations.length, 3);
});

test('reduced motion permits opacity feedback and omits every spatial set effect', () => {
  const motion = createMotion(new Root(), new Media(true));
  const page = element(), content = element(), path = element(), progress = element();
  const button = { querySelector: () => path };
  motion.page(page, -1);
  motion.content(content);
  motion.setCompleted(button, progress, 0.2, 0.4, true);
  assert.equal(page.animations.length, 1);
  assert.equal(content.animations.length, 1);
  for (const animation of [...page.animations, ...content.animations]) {
    assert.ok(animation.frames.every(frame => Object.keys(frame).every(property => property === 'opacity')));
    assert.ok(animation.options.duration <= 100);
  }
  assert.equal(path.animations.length, 0);
  assert.equal(progress.animations.length, 0);
  assert.equal(path.attributes.size, 0);
});

test('set completion feedback animates presentation without changing semantic state or final progress', () => {
  const motion = createMotion(new Root(), new Media());
  const path = element(), progress = element();
  const button = element();
  button.attributes.set('aria-pressed', 'true');
  button.attributes.set('data-set-index', '2');
  button.querySelector = selector => selector === 'path' ? path : null;
  const before = [...button.attributes];
  const finalTransform = progress.style.transform;
  motion.setCompleted(button, progress, 0.25, 0.5, true);
  assert.deepEqual([...button.attributes], before);
  assert.equal(progress.style.transform, finalTransform);
  assert.equal(path.getAttribute('pathLength'), '1');
  assert.equal(path.animations[0].frames[1].strokeDashoffset, 0);
  assert.deepEqual(progress.animations[0].frames, [{ transform: 'scaleX(0.25)' }, { transform: 'scaleX(0.5)' }]);
  motion.setCompleted(button, progress, 0.5, 0.25, false);
  assert.equal(path.animations.length, 1, 'unchecking does not replay completion feedback');
  assert.deepEqual([...button.attributes], before);
});

test('missing or throwing animation support never blocks a subsequent interaction', () => {
  const motion = createMotion(new Root(), new Media());
  const unsupported = { isConnected: true };
  const throwing = { isConnected: true, animate() { throw new Error('unsupported browser effect'); } };
  assert.doesNotThrow(() => motion.page(unsupported));
  assert.doesNotThrow(() => motion.content(throwing));
  assert.doesNotThrow(() => motion.setCompleted({ querySelector: () => null }, throwing, 0, 1, true));
  const healthy = element();
  motion.page(healthy);
  assert.equal(healthy.animations.length, 1);
});

test('rapid page changes cancel obsolete animations while allowing the same page to animate again', async () => {
  const motion = createMotion(new Root(), new Media());
  const first = element(), second = element();
  motion.page(first);
  motion.page(second);
  assert.equal(first.animations[0].cancellations, 1);
  motion.page(second, -1);
  assert.equal(second.animations[0].cancellations, 1);
  assert.equal(second.animations.length, 2);
  await Promise.resolve();
  await Promise.resolve();
  motion.page(first);
  assert.equal(second.animations[1].cancellations, 1, 'settling a cancelled animation cannot unregister its newer replacement');
  assert.equal(first.animations.length, 2);
  assert.equal(first.animations[1].cancellations, 0);
});

test('enabling reduced motion during playback cancels outstanding effects immediately', () => {
  const media = new Media();
  const motion = createMotion(new Root(), media);
  const page = element(), content = element();
  motion.page(page);
  motion.content(content);
  media.change(true);
  assert.equal(page.animations[0].cancellations, 1);
  assert.equal(content.animations[0].cancellations, 1);
  motion.page(page);
  assert.ok(page.animations[1].frames.every(frame => !Object.hasOwn(frame, 'transform')));
  media.change(false);
  motion.page(page);
  assert.equal(page.animations[1].cancellations, 1);
  assert.ok(Object.hasOwn(page.animations[2].frames[0], 'transform'));
});
