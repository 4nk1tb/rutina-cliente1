import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTINE_TEMPLATES } from '../routine-templates.js';
import { MUSCLE_GROUPS, normalizeRoutine } from '../data.js';

const options = () => ROUTINE_TEMPLATES.flatMap(template => template.options);
const exercises = routine => routine.days.flatMap(day => day.exercises);

test('the template picker offers full body 2/3, upper/lower 4 and PPL 3/6 days', () => {
  assert.deepEqual(ROUTINE_TEMPLATES.map(template => [template.id, template.options.map(option => option.days)]), [
    ['full-body', [2, 3]], ['upper-lower', [4]], ['push-pull-legs', [3, 6]],
  ]);
  for (const template of ROUTINE_TEMPLATES) {
    assert.ok(template.name && template.description);
    for (const option of template.options) {
      assert.equal(option.label, `${option.days} días`);
      assert.equal(option.routine.days.length, option.days);
      assert.equal(new Set(option.routine.days.map(day => day.title)).size, option.days);
      assert.ok(option.routine.days.every(day => day.exercises.length === 6));
    }
  }
});

test('every option passes routine normalization without losing exercise metadata', () => {
  for (const option of options()) {
    const before = JSON.stringify(option.routine);
    const clean = normalizeRoutine(option.routine);
    assert.deepEqual(clean, option.routine);
    assert.equal(JSON.stringify(option.routine), before, 'normalization leaves the catalog unchanged');
  }
});

test('exercise IDs remain unique across days and all template variants', () => {
  const ids = options().flatMap(option => exercises(option.routine).map(exercise => exercise.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.length > 0 && id.length <= 128));
});

test('muscle labels and load modes are explicit, with per-dumbbell loads only for two dumbbells', () => {
  let paired = 0;
  let total = 0;
  for (const option of options()) {
    for (const exercise of exercises(option.routine)) {
      assert.ok(MUSCLE_GROUPS.includes(exercise.muscleGroup), `${exercise.name}: valid muscle label`);
      if (exercise.weightMode === 'perDumbbell') {
        paired++;
        assert.match(exercise.name, /dos mancuernas/i);
      } else {
        total++;
        assert.equal(exercise.weightMode, 'total');
        assert.doesNotMatch(exercise.name, /dos mancuernas/i);
      }
      assert.equal(exercise.sets, 3);
      assert.equal(exercise.reps, '8-12');
      assert.equal(exercise.rir, 'RIR 2');
      assert.ok([90, 120].includes(exercise.timer * 60));
      assert.equal(exercise.rest, `${exercise.timer * 60} s`);
    }
  }
  assert.ok(paired > 0 && total > 0);
});

test('editing a selected routine cannot change templates or another selected plan', () => {
  const catalog = JSON.stringify(ROUTINE_TEMPLATES);
  const selected = normalizeRoutine(options()[0].routine);
  const anotherSelection = normalizeRoutine(options()[0].routine);
  selected.name = 'Mi plan';
  selected.days[0].title = 'Mi día';
  selected.days[0].exercises[0].name = 'Mi ejercicio';
  selected.days[0].exercises[0].sets = 5;
  selected.days[1].exercises.push({ id: 'added', name: 'Añadido', sets: 2 });
  assert.equal(JSON.stringify(ROUTINE_TEMPLATES), catalog);
  assert.deepEqual(anotherSelection, options()[0].routine);
});

test('template options do not share mutable routine, day, list or exercise objects', () => {
  const objects = [];
  for (const option of options()) {
    objects.push(option, option.routine, option.routine.days);
    for (const day of option.routine.days) objects.push(day, day.exercises, ...day.exercises);
  }
  assert.equal(new Set(objects).size, objects.length);
  const serializableCopy = JSON.parse(JSON.stringify(ROUTINE_TEMPLATES));
  assert.deepEqual(serializableCopy, ROUTINE_TEMPLATES);
});
