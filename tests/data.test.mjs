import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, MUSCLE_GROUPS, localDate, loadState, saveState, clearHistory, normalizeRoutine, estimateRM, setVolume, createDraftSets, markSetEdited, suggestNextSet, compareExerciseProgress, getPreviousExercise, summarizeSession, getExerciseHistory, createExport, importData } from '../data.js';

const routine = { days: [{ title: 'Empuje', exercises: [{ id: 'banca', name: 'Press banca', sets: 3, reps: '6-8', timer: 2 }] }] };
const fresh = () => loadState(routine, memory()).state;
const memory = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, values };
};
const session = (id = 's1', weight = 60, reps = 8, date = '2026-10-01') => ({
  id, title: 'Empuje', dayIndex: 0, startedAt: `${date}T10:00:00.000Z`, finishedAt: `${date}T11:00:00.000Z`, notes: '',
  exercises: [{ exerciseId: 'banca', name: 'Press banca', sets: [{ weight, reps, done: true }, { weight: 999, reps: 10, done: false }] }]
});

test('migrates old loads and routine without deleting original keys or inventing repetitions', () => {
  const old = JSON.stringify({ week: '3', notes: 'Mantener técnica', progress: { '0:banca': [{ name: 'Press banca', date: '02/10/2026', weight: 0 }, { name: 'Press banca', date: '31/02/2026', weight: 60 }] } });
  const custom = JSON.stringify({ name: 'Personal', days: routine.days });
  const storage = memory({ 'rutina-fuerza-elegante-v7-final': old, customRoutineData: custom });
  const { state, warnings } = loadState(routine, storage);
  assert.equal(state.routine.name, 'Personal');
  assert.equal(state.week, 3);
  assert.equal(state.notes, 'Mantener técnica');
  assert.deepEqual(state.legacyProgress, [{ exerciseId: '0:banca', name: 'Press banca', date: '2026-10-02', weight: 0, reps: null }]);
  assert.ok(warnings.some(warning => warning.includes('no pudo recuperarse')));
  saveState(state, storage);
  assert.equal(storage.getItem('rutina-fuerza-elegante-v7-final'), old);
  assert.equal(storage.getItem('customRoutineData'), custom);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(getExerciseHistory(state)[0].records[0].estimatedRM, null);
  assert.equal(getExerciseHistory(state)[0].records[0].volume, null);
});

test('local date uses device calendar and rejects invalid Date objects', () => {
  assert.equal(localDate(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.throws(() => localDate(new Date('invalid')), /fecha/);
});

test('session totals include completed sets only, retain zero loads and use bounded Epley', () => {
  assert.equal(estimateRM(100, 1), 100);
  assert.equal(estimateRM(60, 10), 80);
  assert.equal(estimateRM(100, 13), null);
  assert.equal(estimateRM(100, null), null);
  assert.equal(estimateRM(0, 8), 0);
  const completed = session();
  completed.exercises[0].sets.push({ weight: 0, reps: 12, done: true });
  const summary = summarizeSession(completed);
  assert.equal(summary.volume, 480);
  assert.equal(summary.sets, 2);
  assert.equal(summary.exerciseCount, 1);
  assert.equal(summary.durationSeconds, 3600);
  assert.equal(summary.recordCount, 0, 'first workout establishes baseline');
  const zero = fresh();
  zero.sessions = [session('zero', 0, 8)];
  assert.equal(getExerciseHistory(zero)[0].records[0].weight, 0);
});

test('PR counts each exercise once and compares both loads and RM against relevant history', () => {
  const current = session('s2', 65, 10, '2026-10-02');
  const previous = session('s1', 60, 10);
  assert.equal(summarizeSession(current, [previous]).recordCount, 1);
  const repPR = session('s2', 60, 12, '2026-10-02');
  assert.equal(summarizeSession(repPR, [previous]).records[0].type, 'estimatedRM');
  const legacy = [{ exerciseId: '0:banca', name: 'Press banca', date: '2026-09-01', weight: 80, reps: null }];
  assert.equal(summarizeSession(current, [], legacy).recordCount, 0, 'legacy weight does not invent an RM baseline');
  assert.equal(summarizeSession(session('s3', 85, 5, '2026-10-02'), [], legacy).recordCount, 1);
  assert.equal(summarizeSession(previous, [current]).recordCount, 0, 'future sessions cannot establish previous PRs');
  const repeated = session('repeat', 65, 10, '2026-10-02');
  repeated.exercises.push({ exerciseId: 'banca-extra', name: 'PRESS BANCA', sets: [{ weight: 75, reps: 8, done: true }] });
  const repeatedSummary = summarizeSession(repeated, [previous]);
  assert.equal(repeatedSummary.recordCount, 1);
  assert.equal(repeatedSummary.records[0].weight, 75, 'repeated exercises share their strongest result');
});

test('history groups accents and case across day-specific exercise IDs', () => {
  const state = fresh();
  const a = session('a');
  const b = session('b', 65, 8, '2026-10-02');
  a.exercises[0].name = 'Elevación lateral';
  b.exercises[0].name = '  ELEVACION   LATERAL ';
  b.exercises[0].exerciseId = 'otro-dia:lateral';
  state.sessions = [b, a];
  const history = getExerciseHistory(state);
  assert.equal(history.length, 1);
  assert.equal(history[0].records.length, 2);
  assert.ok(history[0].records[0].date < history[0].records[1].date);
});

test('routine import preserves existing history, active workout and profile without mutating inputs', () => {
  const state = fresh();
  state.sessions.push(session());
  state.activeSession = { ...session('draft'), finishedAt: null, restEndsAt: '2026-10-03T11:01:00Z', restName: 'Press banca' };
  state.profile.displayName = 'Yanki';
  const before = JSON.stringify(state);
  const newRoutine = { name: 'Nueva', days: [{ title: 'Nuevo empuje', exercises: routine.days[0].exercises }] };
  const imported = importData(state, newRoutine).state;
  assert.equal(imported.routine.name, 'Nueva');
  assert.deepEqual(imported.sessions, state.sessions);
  assert.equal(imported.activeSession.id, 'draft');
  assert.equal(imported.activeSession.restName, 'Press banca');
  assert.equal(imported.profile.displayName, 'Yanki');
  assert.equal(JSON.stringify(state), before);
});

test('progress merge is idempotent, retains conflicting IDs and does not overwrite existing profile', () => {
  const state = fresh();
  state.sessions.push(session());
  state.profile.displayName = 'Propietario';
  const incoming = fresh();
  incoming.sessions = [session('s1', 70), session('same-content-new-id')];
  incoming.profile = { displayName: 'Entrenador', handle: '@amigo' };
  const payload = createExport(incoming, 'progress');
  const before = JSON.stringify(payload);
  const merged = importData(state, payload).state;
  assert.equal(merged.sessions.length, 2, 'equal content dedupes even with a different ID');
  assert.equal(new Set(merged.sessions.map(item => item.id)).size, 2);
  assert.equal(merged.profile.displayName, 'Propietario');
  assert.equal(merged.profile.handle, '@amigo');
  assert.deepEqual(importData(merged, payload).state, merged);
  assert.equal(JSON.stringify(payload), before);
});

test('backup roundtrip restores active timer and profile; routine and progress exports have only their data', () => {
  const state = fresh();
  state.activeSession = { ...session('draft'), finishedAt: null, restEndsAt: '2026-10-03T11:01:00Z', restName: 'Press banca' };
  state.profile.handle = '@yanki';
  const backup = createExport(state, 'backup');
  const restored = importData(fresh(), JSON.stringify(backup), 'replace').state;
  assert.equal(restored.activeSession.restEndsAt, '2026-10-03T11:01:00.000Z');
  assert.equal(restored.profile.handle, '@yanki');
  assert.deepEqual(Object.keys(createExport(state, 'routine').data), ['routine']);
  assert.deepEqual(Object.keys(createExport(state, 'progress').data), ['sessions', 'legacyProgress', 'profile']);
});

test('invalid import is atomic and rejects unsafe keys, invalid calendar dates and numbers', () => {
  const state = fresh();
  const before = JSON.stringify(state);
  assert.throws(() => importData(state, JSON.parse('{"days":[],"__proto__":{"polluted":true}}')), /propiedad/);
  assert.equal({}.polluted, undefined);
  const data = fresh();
  data.sessions.push(session());
  let payload = createExport(data, 'progress');
  payload.data.sessions[0].startedAt = '2026-02-31T10:00:00Z';
  assert.throws(() => importData(state, payload), /fecha ISO/);
  payload = createExport(data, 'progress');
  payload.data.sessions[0].exercises[0].sets[0].weight = -1;
  assert.throws(() => importData(state, payload), /peso/);
  payload = createExport(data, 'progress');
  payload.data.sessions[0].exercises[0].sets[0].reps = 2.5;
  assert.throws(() => importData(state, payload), /repeticiones/);
  assert.throws(() => importData(state, '{broken'), /JSON válido/);
  assert.throws(() => importData(state, ' '.repeat(10 * 1024 * 1024 + 1)), /10 MB/);
  assert.equal(JSON.stringify(state), before);
});

test('routine validation rejects duplicate exercise IDs, impossible limits and poisoned objects', () => {
  const duplicate = { days: [{ title: 'Día', exercises: [{ id: 'a', name: 'Uno' }, { id: 'a', name: 'Dos' }] }] };
  assert.throws(() => normalizeRoutine(duplicate), /mismo identificador/);
  assert.throws(() => normalizeRoutine({ days: [] }), /al menos un día/);
  assert.throws(() => normalizeRoutine({ days: [{ title: 'Día', exercises: [{ name: 'Uno', sets: 1000 }] }] }), /series/);
  assert.throws(() => normalizeRoutine(Object.create({ days: routine.days })), /estructura/);
});

test('storage corruption preserves old data and write failures surface to caller', () => {
  const storage = memory({ [STORAGE_KEY]: '{invalid' });
  const { state, warnings, recovery } = loadState(routine, storage);
  assert.ok(warnings.length);
  assert.equal(storage.getItem(STORAGE_KEY), '{invalid');
  assert.equal(recovery.raw, '{invalid');
  assert.equal(storage.getItem(recovery.key), '{invalid');
  saveState(state, storage);
  assert.equal(storage.getItem(recovery.key), '{invalid', 'a later save cannot destroy the damaged source');
  assert.throws(() => saveState(state, { setItem() { throw new Error('quota'); } }), /No se pudo guardar/);
});

test('damaged storage recovery never overwrites an existing different source', () => {
  const firstKey = `${STORAGE_KEY}-recovery`;
  const storage = memory({ [STORAGE_KEY]: '{new-invalid', [firstKey]: '{first-invalid' });
  const loaded = loadState(routine, storage);
  assert.equal(storage.getItem(firstKey), '{first-invalid');
  assert.notEqual(loaded.recovery.key, firstKey);
  assert.equal(storage.getItem(loaded.recovery.key), '{new-invalid');
  const noWrites = memory({ [STORAGE_KEY]: '{invalid' });
  noWrites.setItem = () => { throw new Error('quota'); };
  const withoutRecovery = loadState(routine, noWrites);
  assert.equal(withoutRecovery.recovery.key, null);
  assert.equal(withoutRecovery.recovery.raw, '{invalid');
  assert.ok(withoutRecovery.warnings.some(warning => warning.includes('No se pudo copiar')));
});

test('old raw progress exports merge idempotently without fabricated sessions or history loss', () => {
  const state = fresh();
  state.sessions.push(session());
  const payload = { progress: { '0:banca': [{ name: 'Press banca', date: '30/09/2026', weight: 70 }] }, notes: 'Entrenar tranquilo', week: '4', '0:banca': { completed: [true] } };
  const before = JSON.stringify(payload);
  const imported = importData(state, payload);
  assert.equal(imported.summary.kind, 'progress');
  assert.equal(imported.state.sessions.length, 1);
  assert.equal(imported.state.legacyProgress.length, 1);
  assert.equal(imported.state.legacyProgress[0].reps, null);
  assert.equal(imported.state.legacyProgress[0].date, '2026-09-30');
  assert.equal(imported.state.notes, 'Entrenar tranquilo');
  assert.equal(imported.state.week, 4);
  assert.deepEqual(importData(imported.state, payload).state, imported.state);
  assert.equal(JSON.stringify(payload), before);
  payload.progress['0:banca'][0].date = '31/09/2026';
  assert.throws(() => importData(state, payload), /fecha del registro/);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.legacyProgress.length, 0);
});

test('completed imported sets require both values and finished history requires a completed set', () => {
  const source = fresh();
  source.sessions = [session()];
  const missingWeight = createExport(source, 'progress');
  missingWeight.data.sessions[0].exercises[0].sets[0].weight = null;
  assert.throws(() => importData(fresh(), missingWeight), /serie completada necesita/);
  const missingReps = createExport(source, 'progress');
  missingReps.data.sessions[0].exercises[0].sets[0].reps = null;
  assert.throws(() => importData(fresh(), missingReps), /serie completada necesita/);
  const empty = createExport(source, 'progress');
  empty.data.sessions[0].exercises[0].sets[0].done = false;
  assert.throws(() => importData(fresh(), empty), /al menos una serie completada/);
});

test('active backup must match a real routine day and all trainable exercise IDs', () => {
  const source = fresh();
  source.activeSession = { ...session('draft'), finishedAt: null };
  const wrongDay = createExport(source, 'backup');
  wrongDay.data.activeSession.dayIndex = 1;
  assert.throws(() => importData(fresh(), wrongDay), /ningún día/);
  const wrongExercise = createExport(source, 'backup');
  wrongExercise.data.activeSession.exercises[0].exerciseId = 'squat';
  assert.throws(() => importData(fresh(), wrongExercise), /no corresponden a la rutina/);
  const missingExercise = createExport(source, 'backup');
  missingExercise.data.routine.days[0].exercises.push({ id: 'fly', name: 'Aperturas', sets: 2 });
  assert.throws(() => importData(fresh(), missingExercise), /no corresponden a la rutina/);
  const before = JSON.stringify(source);
  assert.throws(() => importData(source, { days: [{ title: 'Pierna', exercises: [{ id: 'squat', name: 'Sentadilla', sets: 3 }] }] }), /no corresponden a la rutina/);
  assert.equal(JSON.stringify(source), before, 'incompatible routine import is atomic');
});

test('optional muscle labels survive exports and imports without inventing labels for old history', () => {
  for (const group of MUSCLE_GROUPS) {
    const plan = { days: [{ title: 'Día', exercises: [{ id: 'a', name: 'Ejercicio', sets: 3, muscleGroup: group }] }] };
    assert.equal(normalizeRoutine(plan).days[0].exercises[0].muscleGroup, group);
  }
  const state = fresh();
  state.routine.days[0].exercises[0].muscleGroup = 'pecho';
  state.sessions = [session('labelled'), session('historical', 65, 8, '2026-10-02')];
  state.sessions[0].exercises[0].muscleGroup = 'pecho';
  state.activeSession = { ...session('draft'), finishedAt: null };
  state.activeSession.exercises[0].muscleGroup = 'pecho';
  const restored = importData(fresh(), createExport(state, 'backup'), 'replace').state;
  assert.equal(restored.routine.days[0].exercises[0].muscleGroup, 'pecho');
  assert.equal(restored.sessions[0].exercises[0].muscleGroup, 'pecho');
  assert.equal(restored.activeSession.exercises[0].muscleGroup, 'pecho');
  assert.equal(Object.hasOwn(restored.sessions[1].exercises[0], 'muscleGroup'), false);
  assert.equal(importData(fresh(), createExport(state, 'progress')).state.sessions[0].exercises[0].muscleGroup, 'pecho');
  const invalidRoutine = structuredClone(state.routine);
  invalidRoutine.days[0].exercises[0].muscleGroup = 'piernas';
  assert.throws(() => normalizeRoutine(invalidRoutine), /grupo muscular no es válido/);
  const invalidSession = createExport(state, 'progress');
  invalidSession.data.sessions[0].exercises[0].muscleGroup = null;
  assert.throws(() => importData(fresh(), invalidSession), /grupo muscular/);
});

test('first open selects current weekday, clamped to the routine, and migration restores lastOpenedDay', () => {
  const sevenDays = { days: Array.from({ length: 7 }, (_, index) => ({ title: `Día ${index}`, exercises: [] })) };
  const weekday = (new Date().getDay() + 6) % 7;
  assert.equal(loadState(sevenDays, memory()).state.selectedDay, weekday);
  const short = { days: sevenDays.days.slice(0, 2) };
  assert.equal(loadState(short, memory()).state.selectedDay, Math.min(weekday, 1));
  const valid = memory({ 'rutina-fuerza-elegante-v7-final': JSON.stringify({ lastOpenedDay: '2' }) });
  assert.equal(loadState(sevenDays, valid).state.selectedDay, 2);
  const invalid = memory({ 'rutina-fuerza-elegante-v7-final': JSON.stringify({ lastOpenedDay: 30 }) });
  assert.equal(loadState(short, invalid).state.selectedDay, Math.min(weekday, 1));
  const custom = memory({ customRoutineData: JSON.stringify(short) });
  assert.equal(loadState(sevenDays, custom).state.selectedDay, Math.min(weekday, 1));
});

test('backup merge restores week and selected day only when the destination is empty', () => {
  const plan = { days: Array.from({ length: 7 }, (_, index) => ({ title: `Día ${index}`, exercises: [] })) };
  const source = loadState(plan, memory()).state;
  source.week = 4;
  source.selectedDay = 2;
  source.sessions = [session('source')];
  const backup = createExport(source, 'backup');
  const empty = loadState(plan, memory()).state;
  empty.selectedDay = 0;
  const restored = importData(empty, backup).state;
  assert.equal(restored.week, 4);
  assert.equal(restored.selectedDay, 2);
  const withHistory = structuredClone(empty);
  withHistory.sessions = [session('existing', 55)];
  withHistory.week = 1;
  withHistory.selectedDay = 3;
  const merged = importData(withHistory, backup).state;
  assert.equal(merged.week, 1);
  assert.equal(merged.selectedDay, 3);
  assert.equal(merged.sessions.length, 2);
  const withPreferences = structuredClone(empty);
  withPreferences.week = 5;
  withPreferences.selectedDay = 6;
  assert.equal(importData(withPreferences, backup).state.week, 5);
  assert.equal(importData(withPreferences, backup).state.selectedDay, 6);
});

test('saved recovery remains available after a repaired state is persisted and reopened', () => {
  const storage = memory({ [STORAGE_KEY]: '{invalid' });
  const damaged = loadState(routine, storage);
  saveState(damaged.state, storage);
  const reopened = loadState(routine, storage);
  assert.deepEqual(reopened.recovery, damaged.recovery);
  assert.equal(reopened.warnings.length, 0, 'valid app data can load while offering its older source');
  storage.setItem(`${STORAGE_KEY}-recovery-9999999999999`, '{most-recent');
  const latest = loadState(routine, storage);
  assert.equal(latest.recovery.raw, '{most-recent');
  assert.equal(latest.recovery.key, `${STORAGE_KEY}-recovery-9999999999999`);
  const simpleStorage = { getItem: key => storage.getItem(key) };
  assert.equal(loadState(routine, simpleStorage).recovery.raw, '{invalid', 'minimal storage adapters still expose the original recovery key');
});

test('two dumbbells double volume while load and estimated RM retain the weight of one', () => {
  assert.equal(setVolume({ weight: 20, reps: 10 }), 200);
  assert.equal(setVolume({ weight: 20, reps: 10 }, 'perDumbbell'), 400);
  assert.equal(setVolume({ weight: 0, reps: 10 }, 'perDumbbell'), 0);
  assert.equal(setVolume({ weight: 20, reps: null }, 'perDumbbell'), 0);
  const completed = session('db', 30, 10);
  completed.exercises[0].weightMode = 'perDumbbell';
  assert.equal(summarizeSession(completed).volume, 600);
  const state = fresh();
  state.sessions = [completed];
  const group = getExerciseHistory(state)[0];
  assert.equal(group.weightMode, 'perDumbbell');
  assert.equal(group.records[0].weight, 30);
  assert.equal(group.records[0].volume, 600);
  assert.equal(group.records[0].estimatedRM, 40);
});

test('history and PR baselines stay separate for different weight conventions', () => {
  const total = session('total', 60, 10);
  const perDumbbell = session('db', 25, 10);
  perDumbbell.exercises[0].weightMode = 'perDumbbell';
  const state = fresh();
  state.sessions = [total, perDumbbell];
  state.legacyProgress = [{ exerciseId: '0:banca', name: 'Press banca', date: '2026-09-01', weight: 80, reps: null }];
  const history = getExerciseHistory(state);
  assert.equal(history.length, 2);
  assert.equal(new Set(history.map(group => group.id)).size, 2);
  assert.equal(history.find(group => group.weightMode === 'total').records.length, 2);
  const current = session('new-db', 30, 10, '2026-10-02');
  current.exercises[0].weightMode = 'perDumbbell';
  assert.equal(summarizeSession(current, [total], state.legacyProgress).recordCount, 0, 'different modes cannot establish a PR baseline');
  const summary = summarizeSession(current, [total, perDumbbell], state.legacyProgress);
  assert.equal(summary.recordCount, 1);
  assert.equal(summary.records[0].weightMode, 'perDumbbell');
  assert.equal(summary.records[0].weight, 30);
  assert.equal(summary.records[0].estimatedRM, 40);
});

test('weight modes survive backup and progress imports, validate strictly, and total stays retrocompatible', () => {
  const state = fresh();
  state.routine.days[0].exercises[0].weightMode = 'perDumbbell';
  state.sessions = [session()];
  state.sessions[0].exercises[0].weightMode = 'perDumbbell';
  state.activeSession = { ...session('draft'), finishedAt: null };
  state.activeSession.exercises[0].weightMode = 'perDumbbell';
  const restored = importData(fresh(), createExport(state, 'backup'), 'replace').state;
  assert.equal(restored.routine.days[0].exercises[0].weightMode, 'perDumbbell');
  assert.equal(restored.sessions[0].exercises[0].weightMode, 'perDumbbell');
  assert.equal(restored.activeSession.exercises[0].weightMode, 'perDumbbell');
  assert.equal(importData(fresh(), createExport(state, 'progress')).state.sessions[0].exercises[0].weightMode, 'perDumbbell');
  const invalidRoutine = structuredClone(state.routine);
  invalidRoutine.days[0].exercises[0].weightMode = 'oneDumbbell';
  assert.throws(() => normalizeRoutine(invalidRoutine), /modo de peso/);
  const invalidSession = createExport(state, 'progress');
  invalidSession.data.sessions[0].exercises[0].weightMode = null;
  assert.throws(() => importData(fresh(), invalidSession), /modo de peso/);
  const old = fresh();
  old.sessions = [session()];
  const explicitTotal = createExport(old, 'progress');
  explicitTotal.data.sessions[0].exercises[0].weightMode = 'total';
  assert.equal(importData(old, explicitTotal).state.sessions.length, 1, 'missing and explicit total modes represent the same session content');
  assert.equal(getExerciseHistory(old)[0].weightMode, 'total');
});

test('clearHistory saves an empty history, preserves active training and preferences, and purges old sources', () => {
  const state = fresh();
  state.sessions = [session()];
  state.legacyProgress = [{ exerciseId: '0:banca', name: 'Press banca', date: '2026-09-01', weight: 70, reps: null }];
  state.activeSession = { ...session('draft'), finishedAt: null, restEndsAt: '2026-10-03T11:01:00.000Z', restName: 'Press banca' };
  state.activeSession.exercises[0].sets.forEach(set => { set.edited = { weight: true, reps: true }; });
  state.profile = { displayName: 'Yanki', handle: '@yanki' };
  state.notes = 'Conservar mis notas';
  state.week = 4;
  const before = JSON.stringify(state);
  const storage = memory({
    'rutina-fuerza-elegante-v7-final': JSON.stringify({ progress: { '0:banca': [{ name: 'Press banca', date: '01/09/2026', weight: 70 }] } }),
    [`${STORAGE_KEY}-recovery`]: '{damaged-history',
    [`${STORAGE_KEY}-recovery-1234`]: '{another-history',
    customRoutineData: JSON.stringify(routine),
    'repite-theme': 'light'
  });
  const cleared = clearHistory(state, storage);
  assert.deepEqual(cleared.sessions, []);
  assert.deepEqual(cleared.legacyProgress, []);
  assert.deepEqual(cleared.activeSession, state.activeSession);
  assert.deepEqual(cleared.routine, state.routine);
  assert.deepEqual(cleared.profile, state.profile);
  assert.equal(cleared.notes, state.notes);
  assert.equal(cleared.week, 4);
  assert.equal(JSON.stringify(state), before, 'caller input remains untouched');
  assert.equal(storage.getItem('rutina-fuerza-elegante-v7-final'), null);
  assert.equal(storage.getItem(`${STORAGE_KEY}-recovery`), null);
  assert.equal(storage.getItem(`${STORAGE_KEY}-recovery-1234`), null);
  assert.ok(storage.getItem('customRoutineData'));
  assert.equal(storage.getItem('repite-theme'), 'light');
  const reopened = loadState(routine, storage);
  assert.deepEqual(reopened.state.sessions, []);
  assert.deepEqual(reopened.state.legacyProgress, []);
  assert.deepEqual(reopened.state.activeSession, state.activeSession);
  assert.equal(reopened.recovery, undefined);
});

test('clearHistory never removes source data when the new empty state cannot be saved', () => {
  const state = fresh();
  state.sessions = [session()];
  const storage = memory({ 'rutina-fuerza-elegante-v7-final': 'original-history', [`${STORAGE_KEY}-recovery`]: 'original-copy' });
  let removed = 0;
  storage.setItem = () => { throw new Error('quota'); };
  storage.removeItem = () => { removed++; };
  assert.throws(() => clearHistory(state, storage), /No se pudo guardar/);
  assert.equal(removed, 0);
  assert.equal(storage.getItem('rutina-fuerza-elegante-v7-final'), 'original-history');
  assert.equal(storage.getItem(`${STORAGE_KEY}-recovery`), 'original-copy');
  assert.equal(state.sessions.length, 1);
});

test('clearHistory reports incomplete cleanup with its already-persisted state for the UI', () => {
  const state = fresh();
  state.sessions = [session()];
  const recoveryKey = `${STORAGE_KEY}-recovery`;
  const storage = memory({ 'rutina-fuerza-elegante-v7-final': 'original-history', [recoveryKey]: 'protected-copy' });
  const remove = storage.removeItem;
  storage.removeItem = key => { if (key === recoveryKey) throw new Error('cannot delete'); else remove(key); };
  assert.throws(() => clearHistory(state, storage), error => {
    assert.equal(error.cleanupIncomplete, true);
    assert.deepEqual(error.state.sessions, []);
    assert.deepEqual(error.failedKeys, [recoveryKey]);
    assert.match(error.message, /no se pudieron borrar todas las copias/);
    return true;
  });
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)).sessions, []);
  assert.equal(storage.getItem('rutina-fuerza-elegante-v7-final'), null);
  assert.equal(storage.getItem(recoveryKey), 'protected-copy');
});

test('draft suggestions retain different prior loads by completed-set position and repeat the last for extras', () => {
  const previous = [{ weight: 0, reps: 15, done: true }, { weight: 999, reps: 1, done: false }, { weight: 20, reps: 10, done: true }, { weight: 25, reps: 8, done: true }];
  const before = JSON.stringify(previous);
  const drafts = createDraftSets(5, previous);
  assert.deepEqual(drafts.map(set => [set.weight, set.reps]), [[0, 15], [20, 10], [25, 8], [25, 8], [25, 8]]);
  assert.ok(drafts.every(set => set.done === false && Object.keys(set.edited).length === 0));
  assert.equal(JSON.stringify(previous), before);
  drafts[0].edited.weight = true;
  assert.deepEqual(drafts[1].edited, {}, 'each draft owns its independent edit flags');
  assert.deepEqual(createDraftSets(2), [{ weight: null, reps: null, done: false, edited: {} }, { weight: null, reps: null, done: false, edited: {} }]);
  assert.throws(() => createDraftSets(1.5), /número de series/);
});

test('next-set suggestions protect each manually edited field, including an explicitly cleared value', () => {
  const sets = createDraftSets(2);
  Object.assign(sets[0], { weight: 20, reps: 10, done: true });
  sets[1].weight = 30;
  markSetEdited(sets[1], 'weight');
  assert.equal(suggestNextSet(sets, 0), true);
  assert.equal(sets[1].weight, 30);
  assert.equal(sets[1].reps, 10);
  sets[1].weight = null;
  markSetEdited(sets[1], 'weight');
  sets[0].weight = 0;
  sets[0].reps = 12;
  assert.equal(suggestNextSet(sets, 0), true);
  assert.equal(sets[1].weight, null, 'cleared manual values must not be repopulated');
  assert.equal(sets[1].reps, 12);
  sets[1].reps = null;
  markSetEdited(sets[1], 'reps');
  assert.equal(suggestNextSet(sets, 0), false);
  assert.equal(sets[1].reps, null);
  const zero = createDraftSets(2);
  Object.assign(zero[0], { weight: 0, reps: 8, done: true });
  assert.equal(suggestNextSet(zero, 0), true);
  assert.equal(zero[1].weight, 0);
  assert.equal(zero[1].done, false);
});

test('out-of-order suggestions affect only the immediate next draft and never skip completed sets', () => {
  const sets = createDraftSets(4);
  Object.assign(sets[1], { weight: 50, reps: 8, done: true });
  assert.equal(suggestNextSet(sets, 1), true);
  assert.equal(sets[0].weight, null);
  assert.equal(sets[2].weight, 50);
  assert.equal(sets[3].weight, null);
  Object.assign(sets[0], { weight: 40, reps: 10, done: true });
  const snapshot = JSON.stringify(sets);
  assert.equal(suggestNextSet(sets, 0), false, 'a completed next row is not replaced or skipped');
  assert.equal(JSON.stringify(sets), snapshot);
  assert.equal(suggestNextSet(sets, 3), false);
  assert.equal(suggestNextSet(sets, -1), false);
  sets[2].done = true;
  sets[2].reps = null;
  assert.equal(suggestNextSet(sets, 2), false, 'incomplete source data cannot become a suggestion');
  assert.equal(sets[3].weight, null);
});

test('active edit flags survive storage and backups, while old filled drafts remain protected', () => {
  const state = fresh();
  state.activeSession = { ...session('draft'), finishedAt: null };
  state.activeSession.exercises[0].sets = createDraftSets(2);
  const next = state.activeSession.exercises[0].sets[1];
  markSetEdited(next, 'weight');
  const storage = memory();
  saveState(state, storage);
  const reloaded = loadState(routine, storage).state;
  assert.deepEqual(reloaded.activeSession.exercises[0].sets[1].edited, { weight: true });
  assert.equal(reloaded.activeSession.exercises[0].sets[1].weight, null);
  const restored = importData(fresh(), createExport(state, 'backup'), 'replace').state;
  assert.deepEqual(restored.activeSession.exercises[0].sets[1].edited, { weight: true });
  const old = fresh();
  old.activeSession = { ...session('old-draft'), finishedAt: null };
  old.activeSession.exercises[0].sets = [{ weight: 60, reps: 8, done: true }, { weight: null, reps: 6, done: false }, { weight: null, reps: null, done: false }];
  const oldStorage = memory({ [STORAGE_KEY]: JSON.stringify(old) });
  const migrated = loadState(routine, oldStorage).state.activeSession.exercises[0].sets;
  assert.deepEqual(migrated[0].edited, { weight: true, reps: true });
  assert.deepEqual(migrated[1].edited, { reps: true });
  assert.deepEqual(migrated[2].edited, {});
  suggestNextSet(migrated, 0);
  assert.equal(migrated[1].weight, 60);
  assert.equal(migrated[1].reps, 6);
});

test('completed history exports strip draft provenance and active flags validate strictly', () => {
  const state = fresh();
  state.sessions = [session()];
  state.sessions[0].exercises[0].sets[0].edited = { weight: true, reps: false };
  const progress = createExport(state, 'progress');
  assert.ok(progress.data.sessions[0].exercises[0].sets.every(set => !Object.hasOwn(set, 'edited')));
  const storage = memory();
  saveState(state, storage);
  assert.ok(loadState(routine, storage).state.sessions[0].exercises[0].sets.every(set => !Object.hasOwn(set, 'edited')));
  state.activeSession = { ...session('draft'), finishedAt: null };
  state.activeSession.exercises[0].sets[0].edited = { weight: false, reps: true };
  assert.deepEqual(createExport(state, 'backup').data.activeSession.exercises[0].sets[0].edited, { weight: false, reps: true });
  for (const invalid of [[], true, { weight: 'yes' }, { other: true }]) {
    state.activeSession.exercises[0].sets[0].edited = invalid;
    assert.throws(() => createExport(state, 'backup'), /edición/);
  }
});

test('progress comparisons use the strongest valid completed set and preserve both measures', () => {
  const current = { name: 'Press banca', sets: [{ weight: 20, reps: 15, done: true }, { weight: 30, reps: 6, done: true }, { weight: 30, reps: 10, done: true }, { weight: 999, reps: 10, done: false }, { weight: 1000, reps: null, done: true }] };
  const previous = { name: '  PRESS  BÁNCA ', sets: [{ weight: 25, reps: 10, done: true }] };
  assert.deepEqual(compareExerciseProgress(current, previous), { kind: 'weight', delta: 5, current: { weight: 30, reps: 10 }, previous: { weight: 25, reps: 10 } });
  assert.equal(compareExerciseProgress({ name: current.name, sets: [{ weight: 20, reps: 10, done: true }] }, previous).delta, -5);
  assert.equal(compareExerciseProgress({ name: current.name, sets: [{ weight: 30, reps: 10, done: false }] }, previous), null);
});

test('equal loads compare repetitions, equal sets are unchanged, and changing both measures stays mixed', () => {
  const exercise = (weight, reps, count = 1) => ({ name: 'Press banca', sets: Array.from({ length: count }, () => ({ weight, reps, done: true })) });
  assert.deepEqual(compareExerciseProgress(exercise(30, 10), exercise(30, 8, 5)), { kind: 'reps', delta: 2, current: { weight: 30, reps: 10 }, previous: { weight: 30, reps: 8 } });
  assert.equal(compareExerciseProgress(exercise(30, 8), exercise(30, 10)).delta, -2);
  assert.equal(compareExerciseProgress(exercise(30, 10), exercise(30, 10, 3)).kind, 'same');
  assert.equal(compareExerciseProgress(exercise(30, 10), exercise(30, 10)).delta, 0);
  assert.deepEqual(compareExerciseProgress(exercise(35, 8), exercise(30, 10)), { kind: 'mixed', delta: null, current: { weight: 35, reps: 8 }, previous: { weight: 30, reps: 10 } });
  assert.equal(compareExerciseProgress(exercise(35, 12), exercise(30, 10)).kind, 'mixed', 'more load and more reps are described without declaring an inferred improvement');
});

test('zero loads are comparable but different modes, different exercises and weight-only history are baselines', () => {
  const current = { name: 'Elevación lateral', weightMode: 'perDumbbell', sets: [{ weight: 0, reps: 12, done: true }] };
  const previous = { ...current, sets: [{ weight: 0, reps: 10, done: true }] };
  assert.equal(compareExerciseProgress(current, previous).kind, 'reps');
  assert.equal(compareExerciseProgress(current, previous).delta, 2);
  assert.equal(compareExerciseProgress(current, { ...previous, weightMode: 'total' }).kind, 'baseline');
  assert.equal(compareExerciseProgress(current, { ...previous, name: 'Curl bíceps' }).kind, 'baseline');
  assert.equal(compareExerciseProgress(current, { ...previous, sets: [{ weight: 30, reps: null, done: true }] }).kind, 'baseline');
  assert.equal(compareExerciseProgress(current, null).previous, null);
});

test('previous-exercise lookup orders sessions by completion time and aggregates only matching valid duplicates', () => {
  const now = Date.now();
  const priorSession = (id, ago, mode = 'perDumbbell') => {
    const value = session(id, 20, 8);
    value.startedAt = new Date(now - ago - 3600000).toISOString();
    value.finishedAt = new Date(now - ago).toISOString();
    value.exercises[0].weightMode = mode;
    return value;
  };
  const older = priorSession('older', 600000);
  const latest = priorSession('latest', 120000);
  latest.exercises.push({ exerciseId: 'duplicate', name: ' PRESS BÁNCA ', weightMode: 'perDumbbell', sets: [{ weight: 25, reps: 10, done: true }, { weight: 999, reps: 1, done: false }] });
  latest.exercises.push({ exerciseId: 'other-mode', name: 'Press banca', weightMode: 'total', sets: [{ weight: 500, reps: 10, done: true }] });
  const empty = priorSession('empty-newer', 60000);
  empty.exercises[0].sets.forEach(set => { set.done = false; });
  const state = fresh();
  state.sessions = [latest, empty, older];
  const before = JSON.stringify(state);
  const found = getPreviousExercise(state, 'press banca', 'perDumbbell');
  assert.equal(found.sessionId, 'latest');
  assert.deepEqual(found.sets.map(set => [set.weight, set.reps]), [[20, 8], [25, 10]]);
  assert.equal(getPreviousExercise(state, 'press banca', 'perDumbbell', latest.finishedAt).sessionId, 'older');
  assert.equal(getPreviousExercise(state, 'press banca', 'perDumbbell', undefined, 'latest').sessionId, 'older');
  assert.equal(JSON.stringify(state), before);
});

test('previous-exercise bounds reject future and invalid timestamps and never fabricate legacy repetitions', () => {
  const now = Date.now();
  const past = session('past');
  past.finishedAt = new Date(now - 120000).toISOString();
  const future = session('future', 100, 10);
  future.finishedAt = new Date(now + 3600000).toISOString();
  const invalid = session('invalid');
  invalid.finishedAt = 'not-a-date';
  const state = fresh();
  state.sessions = [future, past, invalid];
  assert.equal(getPreviousExercise(state, 'Press banca', 'total', now + 7200000).sessionId, 'past');
  assert.equal(getPreviousExercise(state, 'Press banca', 'total', new Date(now - 180000)), null);
  assert.equal(getPreviousExercise(state, 'Press banca', 'total', 'invalid'), null);
  state.sessions = [];
  state.legacyProgress = [{ exerciseId: 'banca', name: 'Press banca', date: localDate(), weight: 80, reps: null }];
  assert.equal(getPreviousExercise(state, 'Press banca'), null);
});

test('same-day exercise history uses timestamps instead of random IDs and keeps legacy records before sessions', () => {
  const early = session('z-early', 20, 10);
  early.startedAt = new Date(2026, 9, 1, 9).toISOString();
  early.finishedAt = new Date(2026, 9, 1, 10).toISOString();
  const late = session('a-late', 30, 10);
  late.startedAt = new Date(2026, 9, 1, 11).toISOString();
  late.finishedAt = new Date(2026, 9, 1, 12).toISOString();
  const state = fresh();
  state.sessions = [late, early];
  state.legacyProgress = [{ exerciseId: '0:banca', name: 'Press banca', date: localDate(new Date(early.finishedAt)), weight: 10, reps: null }];
  const records = getExerciseHistory(state)[0].records;
  assert.deepEqual(records.map(record => record.sessionId), [null, 'z-early', 'a-late']);
  assert.equal(records[0].finishedAt, null);
  assert.equal(records[0].reps, null);
  assert.equal(records[2].finishedAt, late.finishedAt);
});

test('aggregated exercise history resolves equal-load duplicates using the higher repetitions', () => {
  const value = session('duplicates', 30, 6);
  value.exercises.push({ exerciseId: 'banca-extra', name: 'PRESS BANCA', sets: [{ weight: 30, reps: 10, done: true }] });
  const state = fresh();
  state.sessions = [value];
  const records = getExerciseHistory(state)[0].records;
  assert.equal(records.length, 1);
  assert.equal(records[0].weight, 30);
  assert.equal(records[0].reps, 10);
  assert.equal(records[0].volume, 480);
});
