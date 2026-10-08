import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultRoutineData } from '../default-routine.js';
import { loadState, normalizeRoutine, importData } from '../data.js';

const exported = JSON.parse(readFileSync(new URL('../rutinas/bear-mode-reinicio.json', import.meta.url), 'utf8'));
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), get length() { return values.size; }, key: index => [...values.keys()][index] ?? null };
};
const trainable = day => day.exercises.filter(exercise => exercise.sets);
// Conservative estimate: one minute of work per set plus its rest, and 15 minutes of warm-up.
const estimatedMinutes = day => 15 + trainable(day).reduce((sum, exercise) => sum + exercise.sets * (1 + exercise.timer), 0);
const legCompound = /^(prensa|sentadilla|peso muerto)/i;

test('the importable JSON matches the plan in default-routine.js', () => {
  assert.equal(exported.app, 'gym-log');
  assert.equal(exported.version, 2);
  assert.equal(exported.kind, 'routine');
  assert.deepEqual(exported.data.routine, normalizeRoutine(defaultRoutineData));
});

test('importing the JSON replaces the routine and keeps the history', () => {
  const state = loadState({ days: [{ title: 'Antiguo', exercises: [{ id: 'banca', name: 'Press banca', sets: 3, reps: '6-8', timer: 2 }] }] }, memory()).state;
  state.sessions.push({ id: 's1', title: 'Antiguo', dayIndex: 0, startedAt: '2026-04-01T10:00:00.000Z', finishedAt: '2026-04-01T11:00:00.000Z', notes: '', exercises: [{ exerciseId: 'banca', name: 'Press banca', sets: [{ weight: 150, reps: 1, done: true }] }] });
  const { state: imported, summary } = importData(state, JSON.stringify(exported));
  assert.equal(summary.kind, 'routine');
  assert.equal(imported.routine.name, 'Bear Mode · Reinicio 6 días');
  assert.equal(imported.sessions.length, 1);
});

test('six training days from Monday to Saturday, Sunday off', () => {
  const days = defaultRoutineData.days;
  assert.equal(days.length, 7);
  assert.ok(days.slice(0, 6).every(day => trainable(day).length > 0));
  assert.match(days[6].title, /^Domingo/);
  assert.equal(trainable(days[6]).length, 0);
});

test('every session stays well inside the 90-minute limit', () => {
  for (const day of defaultRoutineData.days.filter(day => trainable(day).length)) {
    assert.ok(estimatedMinutes(day) <= 80, `${day.title}: ${estimatedMinutes(day)} min`);
  }
});

test('the plan respects the medical and biomechanical constraints', () => {
  const exercises = defaultRoutineData.days.flatMap(day => day.exercises);
  const ids = exercises.map(exercise => exercise.id);
  assert.equal(new Set(ids).size, ids.length);
  // Heavy leg compounds rest 3-4 minutes and never go to failure.
  for (const exercise of exercises.filter(exercise => legCompound.test(exercise.name))) {
    assert.ok(exercise.timer >= 3 && exercise.timer <= 4, exercise.name);
    assert.match(exercise.rir, /RIR 2/, exercise.name);
  }
  // No overhead pressing, no incline dumbbell curls, no deep loaded squats.
  for (const exercise of exercises) {
    assert.doesNotMatch(exercise.name, /militar|press de hombro|curl inclinado|sentadilla con barra|búlgara|zancada/i);
  }
  // Intensity techniques appear only on guided single-joint machines.
  for (const exercise of exercises.filter(exercise => /rest-pause|drop-set/i.test(exercise.note || ''))) {
    assert.match(exercise.name, /extensión de cuádriceps|curl femoral|curl predicador en máquina/i);
  }
  // Every leg day starts with the knee preparation.
  for (const day of defaultRoutineData.days.filter(day => /Pierna/.test(day.title))) {
    assert.match(day.exercises[0].name, /rodilla/i);
  }
});
