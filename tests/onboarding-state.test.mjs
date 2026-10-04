import assert from 'node:assert/strict';
import test from 'node:test';
import { ONBOARDING_KEY, shouldShowOnboarding, markOnboardingSeen } from '../onboarding-state.js';

const fresh = () => ({ schemaVersion: 2, routine: { name: 'Mi rutina', days: [] }, sessions: [], legacyProgress: [], activeSession: null, profile: { displayName: '', handle: '' }, notes: '', week: 1, selectedDay: 0 });
function memory(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('a genuine first visit can show onboarding without writing or mutating training state', () => {
  const state = fresh();
  const before = JSON.stringify(state);
  const storage = memory();
  assert.equal(shouldShowOnboarding(state, storage), true);
  assert.equal(JSON.stringify(state), before);
  assert.equal(storage.values.size, 0);
  state.notes = '   ';
  state.profile.displayName = '  ';
  assert.equal(shouldShowOnboarding(state, storage), true, 'whitespace alone is not personal data');
});

test('existing history, migrated loads, active training, profile and personal preferences suppress automatic onboarding', () => {
  const variations = [
    { sessions: [{ id: 'training' }] },
    { legacyProgress: [{ weight: 50 }] },
    { activeSession: { id: 'active' } },
    { profile: { displayName: 'Yanki', handle: '' } },
    { profile: { displayName: '', handle: '@yanki' } },
    { notes: 'Mantener la técnica' },
    { week: 4 }
  ];
  for (const variation of variations) {
    const state = { ...fresh(), ...variation };
    assert.equal(shouldShowOnboarding(state, memory()), false);
  }
});

test('any previous storage source suppresses onboarding even if the recovered state appears empty', () => {
  for (const key of ['gym-log-v2', 'rutina-fuerza-elegante-v7-final', 'customRoutineData']) {
    for (const raw of [JSON.stringify({ days: [], progress: {} }), '{corrupt', '']) {
      const storage = memory({ [key]: raw });
      assert.equal(shouldShowOnboarding(fresh(), storage), false);
      assert.equal(storage.getItem(key), raw, 'source data is never rewritten');
    }
  }
});

test('started, skipped and completed markers prevent repeated automatic opening after reload', () => {
  for (const status of ['started', 'skipped', 'completed']) {
    const storage = memory();
    assert.equal(shouldShowOnboarding(fresh(), storage), true);
    assert.equal(markOnboardingSeen(status, storage), true);
    const marker = JSON.parse(storage.getItem(ONBOARDING_KEY));
    assert.equal(marker.version, 1);
    assert.equal(marker.status, status);
    assert.ok(Number.isFinite(new Date(marker.seenAt).getTime()));
    assert.equal(shouldShowOnboarding(fresh(), storage), false);
  }
  const storage = memory();
  assert.equal(markOnboardingSeen(undefined, storage), true);
  assert.equal(JSON.parse(storage.getItem(ONBOARDING_KEY)).status, 'started');
});

test('corrupt markers and malformed state fail closed while invalid status never writes', () => {
  for (const marker of ['{broken', '', 'null', '{}', '{"status":"unknown"}']) {
    assert.equal(shouldShowOnboarding(fresh(), memory({ [ONBOARDING_KEY]: marker })), false);
  }
  for (const state of [null, [], { sessions: {} }, { profile: 'broken' }, { legacyProgress: null }]) {
    assert.equal(shouldShowOnboarding(state, memory()), false);
  }
  const storage = memory();
  assert.equal(markOnboardingSeen('unknown', storage), false);
  assert.equal(storage.values.size, 0);
});

test('blocked, full and unavailable storage never throw or report a successful write', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(shouldShowOnboarding(fresh(), blocked), false);
  assert.equal(markOnboardingSeen('started', blocked), false);
  const full = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(markOnboardingSeen('completed', full), false);
  const ignoredWrite = { getItem: () => null, setItem() {} };
  assert.equal(markOnboardingSeen('skipped', ignoredWrite), false);
  assert.equal(shouldShowOnboarding(fresh(), null), false);
  assert.equal(markOnboardingSeen('started', null), false);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.equal(shouldShowOnboarding(fresh()), false);
    assert.equal(markOnboardingSeen(), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('the marker is independent from every training source and can be updated for a manual replay', () => {
  const originals = { 'gym-log-v2': '{training}', 'rutina-fuerza-elegante-v7-final': '{legacy}', customRoutineData: '{routine}', 'gym-log-v2-recovery': '{recovery}' };
  const storage = memory(originals);
  assert.equal(markOnboardingSeen('skipped', storage), true);
  assert.equal(markOnboardingSeen('completed', storage), true);
  assert.equal(markOnboardingSeen('started', storage), true);
  assert.equal(JSON.parse(storage.getItem(ONBOARDING_KEY)).status, 'started');
  for (const [key, value] of Object.entries(originals)) assert.equal(storage.getItem(key), value);
  assert.equal(storage.values.size, Object.keys(originals).length + 1);
});
