// Portable, local-first storage. All imports are validated before touching state.
export const STORAGE_KEY = 'gym-log-v2';
export const MUSCLE_GROUPS = Object.freeze(['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps', 'isquios', 'gluteos', 'gemelos', 'core', 'otros']);
export const WEIGHT_MODES = Object.freeze(['total', 'perDumbbell']);
const LEGACY_KEY = 'rutina-fuerza-elegante-v7-final';
const LIMITS = { bytes: 10 * 1024 * 1024, days: 31, exercises: 100, sets: 100, sessions: 5000, legacy: 50000 };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };

function inspectJson(value) {
  const visited = new Set();
  const queue = [{ value, depth: 0 }];
  let count = 0;
  while (queue.length) {
    const { value: item, depth } = queue.pop();
    if (++count > 500000 || depth > 20) fail('El archivo contiene demasiados datos o una estructura demasiado profunda.');
    if (item === null || item === undefined || typeof item === 'string' || typeof item === 'boolean') continue;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('Hay un número no válido en los datos.'); continue; }
    if (typeof item !== 'object') fail('El archivo debe contener solamente datos JSON.');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) fail('La estructura del archivo no es válida.');
    if (visited.has(item)) continue;
    visited.add(item);
    for (const key of Object.keys(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('El archivo contiene una propiedad no permitida.');
      queue.push({ value: item[key], depth: depth + 1 });
    }
  }
  let serialized;
  try { serialized = JSON.stringify(value); } catch { fail('No se pueden leer los datos JSON.'); }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > LIMITS.bytes) fail('El archivo supera el límite de 10 MB.');
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} debe ser un objeto.`);
  return value;
}

function array(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} debe ser una lista con un máximo de ${maximum} elementos.`);
  return value;
}

function string(value, maximum, label, fallback = undefined) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.length > maximum) fail(`${label} debe ser texto de hasta ${maximum} caracteres.`);
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function requiredString(value, maximum, label) {
  const result = string(value, maximum, label);
  if (!result) fail(`${label} no puede estar vacío.`);
  return result;
}

function number(value, minimum, maximum, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) fail(`${label} debe ser un número ${integer ? 'entero ' : ''}entre ${minimum} y ${maximum}.`);
  return value;
}

function optionalNumber(value, minimum, maximum, label, integer = false) {
  return value === null || value === undefined ? null : number(value, minimum, maximum, label, integer);
}

function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDate(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) fail('La fecha no es válida.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateOnly(value, allowOldFormat = false) {
  if (allowOldFormat && typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split('/');
    value = `${year}-${month}-${day}`;
  }
  if (typeof value !== 'string' || !validCalendarDate(value)) fail('La fecha del registro no es válida. Usa AAAA-MM-DD.');
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validCalendarDate(value.slice(0, 10))) fail(`${label} debe ser una fecha ISO válida.`);
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number);
  const offset = value.match(/[+-](\d{2}):(\d{2})$/);
  if (hour > 23 || minute > 59 || second > 59 || (offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59))) fail(`${label} no es válida.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(`${label} no es válida.`);
  return date.toISOString();
}

const normalizedName = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nameId = name => normalizedName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ejercicio';
function muscleGroup(value) {
  const clean = string(value, 20, 'El grupo muscular');
  if (!MUSCLE_GROUPS.includes(clean)) fail('El grupo muscular no es válido.');
  return clean;
}
function weightMode(value = 'total') {
  const clean = string(value, 20, 'El modo de peso');
  if (!WEIGHT_MODES.includes(clean)) fail('El modo de peso debe ser total o perDumbbell.');
  return clean;
}
const exerciseKey = (name, mode = 'total') => JSON.stringify([normalizedName(name), weightMode(mode)]);

function normalizedEdited(set) {
  if (set.edited === undefined) {
    // Old drafts had no provenance. Preserve filled values as manually entered.
    return { ...(set.weight !== null && set.weight !== undefined ? { weight: true } : {}), ...(set.reps !== null && set.reps !== undefined ? { reps: true } : {}) };
  }
  object(set.edited, 'Las marcas de edición de la serie');
  const clean = {};
  for (const [field, edited] of Object.entries(set.edited)) {
    if (!['weight', 'reps'].includes(field) || typeof edited !== 'boolean') fail('Las marcas de edición solo admiten peso y repeticiones con valores booleanos.');
    clean[field] = edited;
  }
  return clean;
}

export function createDraftSets(count, previousSets = []) {
  number(count, 0, LIMITS.sets, 'El número de series', true);
  const previous = array(previousSets, LIMITS.sets, 'Las series anteriores').filter(set => set?.done === true).map(set => ({
    weight: optionalNumber(set.weight, 0, 10000, 'El peso anterior'),
    reps: optionalNumber(set.reps, 1, 1000, 'Las repeticiones anteriores', true)
  }));
  return Array.from({ length: count }, (_, index) => {
    const suggestion = previous[index] || previous.at(-1);
    return { weight: suggestion?.weight ?? null, reps: suggestion?.reps ?? null, done: false, edited: {} };
  });
}

export function markSetEdited(set, field) {
  object(set, 'La serie');
  if (!['weight', 'reps'].includes(field)) fail('Solo se puede marcar la edición del peso o las repeticiones.');
  set.edited = { ...normalizedEdited(set), [field]: true };
  return set;
}

export function suggestNextSet(sets, completedIndex) {
  if (!Array.isArray(sets) || !Number.isInteger(completedIndex) || completedIndex < 0 || completedIndex >= sets.length - 1) return false;
  const source = sets[completedIndex], next = sets[completedIndex + 1];
  if (!source || source.done !== true || !Number.isFinite(source.weight) || source.weight < 0 || source.weight > 10000 || !Number.isInteger(source.reps) || source.reps < 1 || source.reps > 1000 || !next || next.done !== false) return false;
  const edited = normalizedEdited(next);
  let changed = false;
  for (const field of ['weight', 'reps']) {
    if (!edited[field] && next[field] !== source[field]) { next[field] = source[field]; changed = true; }
  }
  next.edited = edited;
  return changed;
}

export function normalizeRoutine(data) {
  inspectJson(data);
  object(data, 'La rutina');
  const days = array(data.days, LIMITS.days, 'Los días');
  if (!days.length) fail('La rutina necesita al menos un día.');
  return {
    name: requiredString(data.name === undefined ? 'Mi rutina' : data.name, 100, 'El nombre de la rutina'),
    days: days.map((day, dayIndex) => {
      object(day, 'El día');
      const ids = new Set();
      return {
        title: requiredString(day.title, 120, 'El título del día'),
        exercises: array(day.exercises, LIMITS.exercises, 'Los ejercicios del día').map((exercise, index) => {
          object(exercise, 'El ejercicio');
          const name = requiredString(exercise.name, 160, 'El nombre del ejercicio');
          const id = exercise.id === undefined ? `${nameId(name)}-${dayIndex}-${index}` : requiredString(exercise.id, 128, 'El identificador del ejercicio');
          if (ids.has(id)) fail('Un día no puede tener dos ejercicios con el mismo identificador.');
          ids.add(id);
          const clean = { id, name };
          if (exercise.muscleGroup !== undefined) clean.muscleGroup = muscleGroup(exercise.muscleGroup);
          if (exercise.weightMode !== undefined) clean.weightMode = weightMode(exercise.weightMode);
          if (exercise.sets !== undefined) clean.sets = number(exercise.sets, 1, LIMITS.sets, 'Las series', true);
          for (const key of ['reps', 'rir', 'rest']) {
            if (exercise[key] !== undefined) {
              if (typeof exercise[key] === 'number') clean[key] = String(number(exercise[key], 0, 1000, key, key === 'reps'));
              else clean[key] = string(exercise[key], 80, `El campo ${key}`);
            }
          }
          if (exercise.timer !== undefined) clean.timer = number(exercise.timer, 0, 60, 'El descanso en minutos');
          if (exercise.note !== undefined) clean.note = string(exercise.note, 2000, 'La nota del ejercicio');
          return clean;
        })
      };
    })
  };
}

function normalizeSession(value, active = false) {
  object(value, 'La sesión');
  const startedAt = timestamp(value.startedAt, 'El inicio de la sesión');
  const finishedAt = value.finishedAt === null ? null : timestamp(value.finishedAt, 'El final de la sesión');
  if (finishedAt && new Date(finishedAt) < new Date(startedAt)) fail('La sesión no puede terminar antes de empezar.');
  const ids = new Set();
  const exercises = array(value.exercises, LIMITS.exercises, 'Los ejercicios de la sesión').map(exercise => {
    object(exercise, 'El ejercicio de la sesión');
    const exerciseId = requiredString(exercise.exerciseId, 128, 'El identificador del ejercicio');
    if (ids.has(exerciseId)) fail('La sesión contiene ejercicios con identificadores repetidos.');
    ids.add(exerciseId);
    const cleanExercise = {
      exerciseId,
      name: requiredString(exercise.name, 160, 'El nombre del ejercicio'),
      sets: array(exercise.sets, LIMITS.sets, 'Las series de la sesión').map(set => {
        object(set, 'La serie');
        if (typeof set.done !== 'boolean') fail('La serie debe indicar si está completada.');
        const clean = {
          weight: optionalNumber(set.weight, 0, 10000, 'El peso'),
          reps: optionalNumber(set.reps, 1, 1000, 'Las repeticiones', true),
          done: set.done
        };
        if (clean.done && (clean.weight === null || clean.reps === null)) fail('Una serie completada necesita un peso y unas repeticiones válidas.');
        if (active) clean.edited = normalizedEdited(set);
        return clean;
      })
    };
    if (exercise.muscleGroup !== undefined) cleanExercise.muscleGroup = muscleGroup(exercise.muscleGroup);
    if (exercise.weightMode !== undefined) cleanExercise.weightMode = weightMode(exercise.weightMode);
    return cleanExercise;
  });
  const session = {
    id: requiredString(value.id, 128, 'El identificador de la sesión'),
    title: requiredString(value.title, 120, 'El título de la sesión'),
    dayIndex: number(value.dayIndex, 0, LIMITS.days - 1, 'El día de la sesión', true),
    startedAt,
    finishedAt,
    notes: string(value.notes, 10000, 'Las notas de la sesión', ''),
    exercises
  };
  if (active) {
    if (value.restEndsAt !== undefined) session.restEndsAt = value.restEndsAt === null ? null : timestamp(value.restEndsAt, 'El final del descanso');
    if (value.restName !== undefined) session.restName = string(value.restName, 160, 'El nombre del descanso');
  }
  if (finishedAt && !exercises.some(exercise => exercise.sets.some(set => set.done))) fail('Una sesión guardada necesita al menos una serie completada.');
  return session;
}

function normalizeLegacy(record, allowOldFormat = false) {
  object(record, 'El registro antiguo');
  return {
    exerciseId: requiredString(record.exerciseId, 128, 'El identificador del registro'),
    name: requiredString(record.name, 160, 'El nombre del ejercicio'),
    date: dateOnly(record.date, allowOldFormat),
    weight: number(record.weight, 0, 10000, 'El peso del registro'),
    reps: record.reps === undefined || record.reps === null ? null : number(record.reps, 1, 1000, 'Las repeticiones del registro', true)
  };
}

function normalizeProfile(value = {}) {
  object(value, 'El perfil');
  return { displayName: string(value.displayName, 80, 'El nombre del perfil', ''), handle: string(value.handle, 80, 'El usuario del perfil', '') };
}

function normalizeState(value) {
  inspectJson(value);
  object(value, 'Los datos');
  if (value.schemaVersion !== 2) fail('La versión de los datos no es compatible.');
  const routine = normalizeRoutine(value.routine);
  const sessions = array(value.sessions, LIMITS.sessions, 'Las sesiones').map(session => normalizeSession(session));
  const uniqueIds = new Set();
  for (const session of sessions) {
    if (uniqueIds.has(session.id)) fail('Hay sesiones con identificadores repetidos.');
    uniqueIds.add(session.id);
    if (!session.finishedAt) fail('Una sesión del historial debe tener fecha de finalización.');
  }
  const activeSession = value.activeSession === null || value.activeSession === undefined ? null : normalizeSession(value.activeSession, true);
  if (activeSession && (activeSession.finishedAt || uniqueIds.has(activeSession.id))) fail('La sesión activa no es válida.');
  if (activeSession) {
    const day = routine.days[activeSession.dayIndex];
    if (!day) fail('La sesión activa no corresponde a ningún día de la rutina.');
    const planned = day.exercises.filter(exercise => exercise.sets);
    const matching = planned.length === activeSession.exercises.length && planned.every(exercise => activeSession.exercises.some(entry => entry.exerciseId === exercise.id && normalizedName(entry.name) === normalizedName(exercise.name)));
    if (!planned.length || !matching) fail('Los ejercicios de la sesión activa no corresponden a la rutina. Termina la sesión antes de cambiar el plan.');
  }
  return {
    schemaVersion: 2,
    routine,
    sessions,
    activeSession,
    legacyProgress: array(value.legacyProgress || [], LIMITS.legacy, 'Los registros antiguos').map(record => normalizeLegacy(record)),
    profile: normalizeProfile(value.profile),
    selectedDay: Math.min(number(value.selectedDay === undefined ? 0 : value.selectedDay, 0, LIMITS.days - 1, 'El día seleccionado', true), routine.days.length - 1),
    week: number(value.week === undefined ? 1 : value.week, 1, 1000, 'La semana', true),
    notes: string(value.notes, 10000, 'Las notas', '')
  };
}

function emptyState(routine) {
  const clean = normalizeRoutine(routine);
  const today = (new Date().getDay() + 6) % 7;
  return { schemaVersion: 2, routine: clean, sessions: [], activeSession: null, legacyProgress: [], profile: { displayName: '', handle: '' }, selectedDay: Math.min(today, clean.days.length - 1), week: 1, notes: '' };
}

function parseJson(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > LIMITS.bytes) fail('El archivo supera el límite de 10 MB.');
  let value;
  try { value = JSON.parse(text); } catch { fail('El archivo no contiene JSON válido.'); }
  inspectJson(value);
  return value;
}

export function loadState(defaultRoutine, storage = globalThis.localStorage) {
  const warnings = [];
  let recovery = null;
  let state = emptyState(defaultRoutine);
  const read = key => {
    try { return storage?.getItem(key) ?? null; }
    catch { warnings.push('No se puede acceder al almacenamiento de este dispositivo.'); return null; }
  };
  const findRecovery = () => {
    const base = `${STORAGE_KEY}-recovery`;
    const keys = new Set([base]);
    try {
      if (Number.isInteger(storage?.length)) {
        for (let index = 0; index < Math.min(storage.length, 10000); index++) {
          const key = storage.key(index);
          if (typeof key === 'string' && (key === base || new RegExp(`^${base}-\\d+(?:-\\d+)?$`).test(key))) keys.add(key);
        }
      }
    } catch { warnings.push('No se pudo revisar alguna copia de recuperación del dispositivo.'); }
    const rank = key => key === base ? 0 : Number(key.slice(base.length + 1).split('-')[0]);
    for (const key of [...keys].sort((a, b) => rank(b) - rank(a) || b.localeCompare(a))) {
      const raw = read(key);
      if (raw !== null) return { raw, key };
    }
    return null;
  };
  const saved = read(STORAGE_KEY);
  if (saved !== null) {
    try {
      const loaded = normalizeState(parseJson(saved));
      const existingRecovery = findRecovery();
      return { state: loaded, warnings: [...new Set(warnings)], ...(existingRecovery ? { recovery: existingRecovery } : {}) };
    }
    catch (error) {
      warnings.push(`No se pudo cargar la copia actual: ${error.message}`);
      recovery = { raw: saved, key: null };
      try {
        if (!storage || typeof storage.setItem !== 'function') throw new Error('Sin almacenamiento');
        const base = `${STORAGE_KEY}-recovery`;
        const existing = storage.getItem(base);
        let key = base;
        if (existing !== null && existing !== saved) {
          key = `${base}-${Date.now()}`;
          let suffix = 1;
          while (storage.getItem(key) !== null) key = `${base}-${Date.now()}-${suffix++}`;
        }
        if (storage.getItem(key) === null) storage.setItem(key, saved);
        recovery.key = key;
        warnings.push('Se ha guardado una copia recuperable de los datos dañados en este dispositivo.');
      } catch { warnings.push('No se pudo copiar la fuente dañada. Guarda una copia de recuperación antes de continuar.'); }
    }
  }
  const custom = read('customRoutineData');
  if (custom !== null) {
    try { state.routine = normalizeRoutine(parseJson(custom)); }
    catch (error) { warnings.push(`No se pudo recuperar la rutina personalizada: ${error.message}`); }
  }
  state.selectedDay = Math.min(state.selectedDay, state.routine.days.length - 1);
  const old = read(LEGACY_KEY);
  if (old !== null) {
    try {
      const legacy = object(parseJson(old), 'Los datos antiguos');
      if (legacy.lastOpenedDay !== undefined && legacy.lastOpenedDay !== null && legacy.lastOpenedDay !== '') {
        const day = Number(legacy.lastOpenedDay);
        if (Number.isInteger(day) && day >= 0 && day < state.routine.days.length) state.selectedDay = day;
      }
      if (legacy.notes !== undefined) state.notes = string(legacy.notes, 10000, 'Las notas antiguas');
      if (legacy.week !== undefined) state.week = number(Number(legacy.week), 1, 1000, 'La semana antigua', true);
      const progress = object(legacy.progress || {}, 'El progreso antiguo');
      for (const [exerciseId, entries] of Object.entries(progress)) {
        for (const entry of array(entries, LIMITS.legacy, 'Los registros antiguos')) {
          try {
            const fallback = state.routine.days.flatMap(day => day.exercises).find(exercise => exercise.id === exerciseId.replace(/^\d+:/, ''))?.name || exerciseId.replace(/^\d+:/, '');
            if (state.legacyProgress.length >= LIMITS.legacy) fail('Hay demasiados registros antiguos.');
            state.legacyProgress.push(normalizeLegacy({ exerciseId, name: entry.name || fallback, date: entry.date, weight: entry.weight, reps: null }, true));
          } catch (error) { warnings.push(`Un registro antiguo no pudo recuperarse: ${error.message}`); }
        }
      }
      if (state.legacyProgress.length) warnings.push(`Se han recuperado ${state.legacyProgress.length} registros de cargas. Los registros antiguos no incluyen repeticiones.`);
    } catch (error) { warnings.push(`No se pudo recuperar parte de los datos antiguos: ${error.message}`); }
  }
  return { state, warnings: [...new Set(warnings)], ...(recovery ? { recovery } : {}) };
}

export function saveState(state, storage = globalThis.localStorage) {
  const clean = normalizeState(state);
  if (!storage || typeof storage.setItem !== 'function') fail('El almacenamiento del dispositivo no está disponible. Exporta una copia de seguridad.');
  try { storage.setItem(STORAGE_KEY, JSON.stringify(clean)); }
  catch { fail('No se pudo guardar el entrenamiento. Puede que el almacenamiento esté lleno; exporta una copia de seguridad.'); }
}

// Save the emptied history first. If old sources cannot all be removed, the
// caller receives the persisted state on error.state and can show a warning.
export function clearHistory(state, storage = globalThis.localStorage) {
  const clean = normalizeState(state);
  clean.sessions = [];
  clean.legacyProgress = [];
  if (!storage || typeof storage.removeItem !== 'function') fail('No se puede borrar el historial: el almacenamiento del dispositivo no permite eliminar sus copias.');
  const recoveryPrefix = `${STORAGE_KEY}-recovery`;
  const keys = new Set([LEGACY_KEY, recoveryPrefix]);
  try {
    if (Number.isInteger(storage.length) && typeof storage.key === 'function') {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (typeof key === 'string' && key.startsWith(recoveryPrefix)) keys.add(key);
      }
    }
  } catch { fail('No se pudieron revisar las copias guardadas. El historial no se ha borrado.'); }
  saveState(clean, storage);
  const failedKeys = [];
  for (const key of keys) {
    try {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) failedKeys.push(key);
    } catch { failedKeys.push(key); }
  }
  if (failedKeys.length) {
    const error = new Error('El historial actual se ha vaciado, pero no se pudieron borrar todas las copias antiguas del dispositivo. Intenta borrarlo de nuevo antes de cerrar la app.');
    error.state = clean;
    error.cleanupIncomplete = true;
    error.failedKeys = failedKeys;
    throw error;
  }
  return clean;
}

export function estimateRM(weight, reps) {
  if (!Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// The caller selects completed sets. A per-dumbbell load describes two equal
// dumbbells; recorded load and estimated RM remain the weight of one dumbbell.
export function setVolume(set, mode = 'total') {
  const multiplier = weightMode(mode) === 'perDumbbell' ? 2 : 1;
  if (!set || !Number.isFinite(set.weight) || set.weight < 0 || !Number.isInteger(set.reps) || set.reps < 1) return 0;
  return set.weight * set.reps * multiplier;
}

function validCompletedSets(exercise) {
  if (!Array.isArray(exercise?.sets)) return [];
  return exercise.sets.filter(set => set?.done === true && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10000 && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000);
}

function bestCompletedSet(exercise) {
  return validCompletedSets(exercise).reduce((best, set) => !best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best, null);
}

export function compareExerciseProgress(exercise, previousExercise) {
  const best = bestCompletedSet(exercise);
  if (!best) return null;
  const current = { weight: best.weight, reps: best.reps };
  const sameIdentity = typeof exercise.name === 'string' && typeof previousExercise?.name === 'string' && exerciseKey(exercise.name, exercise.weightMode) === exerciseKey(previousExercise.name, previousExercise.weightMode);
  const priorBest = sameIdentity ? bestCompletedSet(previousExercise) : null;
  if (!priorBest) return { kind: 'baseline', delta: null, current, previous: null };
  const previous = { weight: priorBest.weight, reps: priorBest.reps };
  if (current.weight === previous.weight) {
    const delta = current.reps - previous.reps;
    return { kind: delta === 0 ? 'same' : 'reps', delta, current, previous };
  }
  if (current.reps === previous.reps) return { kind: 'weight', delta: current.weight - previous.weight, current, previous };
  return { kind: 'mixed', delta: null, current, previous };
}

export function getPreviousExercise(state, name, mode = 'total', beforeTime = Date.now(), excludeSessionId) {
  if (typeof name !== 'string' || !Array.isArray(state?.sessions)) return null;
  const requested = beforeTime instanceof Date ? beforeTime.getTime() : typeof beforeTime === 'number' ? beforeTime : new Date(beforeTime).getTime();
  if (!Number.isFinite(requested)) return null;
  const cutoff = Math.min(requested, Date.now());
  const key = exerciseKey(name, mode);
  const prior = state.sessions.map((session, index) => ({ session, index, time: session?.finishedAt ? new Date(session.finishedAt).getTime() : NaN }))
    .filter(({ session, time }) => session.id !== excludeSessionId && Number.isFinite(time) && time < cutoff)
    .sort((a, b) => b.time - a.time || String(b.session.id).localeCompare(String(a.session.id)) || a.index - b.index);
  for (const { session } of prior) {
    const matches = (Array.isArray(session.exercises) ? session.exercises : []).filter(exercise => typeof exercise?.name === 'string' && exerciseKey(exercise.name, exercise.weightMode) === key && validCompletedSets(exercise).length);
    if (!matches.length) continue;
    return {
      ...matches[0],
      weightMode: weightMode(mode),
      sets: matches.flatMap(exercise => validCompletedSets(exercise).map(set => ({ weight: set.weight, reps: set.reps, done: true }))),
      sessionId: session.id,
      finishedAt: new Date(session.finishedAt).toISOString()
    };
  }
  // Weight-only legacy data cannot establish a load/repetition comparison.
  return null;
}

function exerciseStats(exercise) {
  const done = exercise.sets.filter(set => set.done);
  const weighted = done.filter(set => Number.isFinite(set.weight) && set.weight >= 0);
  let best = null;
  let bestRM = null;
  for (const set of weighted) {
    const rm = estimateRM(set.weight, set.reps);
    if (rm !== null && (bestRM === null || rm > bestRM)) bestRM = rm;
    if (!best || set.weight > best.weight || (set.weight === best.weight && (set.reps || 0) > (best.reps || 0))) best = set;
  }
  return {
    sets: done.length,
    weight: best?.weight ?? null,
    reps: best?.reps ?? null,
    volume: weighted.reduce((sum, set) => sum + setVolume(set, exercise.weightMode), 0),
    estimatedRM: bestRM
  };
}

export function getExerciseHistory(state) {
  const groups = new Map();
  const getGroup = (name, mode = 'total') => {
    const cleanMode = weightMode(mode);
    const key = exerciseKey(name, cleanMode);
    if (!groups.has(key)) groups.set(key, { id: `${normalizedName(name)}${cleanMode === 'perDumbbell' ? '::perDumbbell' : ''}`, name, weightMode: cleanMode, records: [] });
    return groups.get(key);
  };
  for (const session of state.sessions || []) {
    if (!session.finishedAt) continue;
    const inSession = new Map();
    for (const exercise of session.exercises) {
      const stats = exerciseStats(exercise);
      if (!stats.sets || stats.weight === null) continue;
      const group = getGroup(exercise.name, exercise.weightMode);
      if (!inSession.has(group.id)) inSession.set(group.id, { group, record: { date: localDate(new Date(session.finishedAt)), finishedAt: new Date(session.finishedAt).toISOString(), weight: stats.weight, reps: stats.reps, volume: stats.volume, estimatedRM: stats.estimatedRM, sessionId: session.id } });
      else {
        const record = inSession.get(group.id).record;
        record.volume += stats.volume;
        if (stats.weight > record.weight || (stats.weight === record.weight && (stats.reps ?? 0) > (record.reps ?? 0))) { record.weight = stats.weight; record.reps = stats.reps; }
        if (stats.estimatedRM !== null && (record.estimatedRM === null || stats.estimatedRM > record.estimatedRM)) record.estimatedRM = stats.estimatedRM;
      }
    }
    for (const { group, record } of inSession.values()) group.records.push(record);
  }
  for (const record of state.legacyProgress || []) {
    getGroup(record.name).records.push({ date: record.date, finishedAt: null, weight: record.weight, reps: record.reps ?? null, volume: record.reps === null || record.reps === undefined ? null : setVolume(record), estimatedRM: estimateRM(record.weight, record.reps), sessionId: null });
  }
  return [...groups.values()].map(group => ({ ...group, records: group.records.sort((a, b) => a.date.localeCompare(b.date) || String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')) || String(a.sessionId || '').localeCompare(String(b.sessionId || ''))) }));
}

export function summarizeSession(session, priorSessions = [], legacyProgress = []) {
  let volume = 0;
  let sets = 0;
  let exerciseCount = 0;
  const records = [];
  const history = new Map(getExerciseHistory({ sessions: priorSessions.filter(prior => prior.id !== session.id && prior.finishedAt && new Date(prior.finishedAt) <= new Date(session.startedAt)), legacyProgress: legacyProgress.filter(record => record.date <= localDate(new Date(session.startedAt))) }).map(group => [exerciseKey(group.name, group.weightMode), group.records]));
  const candidates = new Map();
  for (const exercise of session.exercises) {
    const stats = exerciseStats(exercise);
    volume += stats.volume;
    sets += stats.sets;
    if (stats.sets) exerciseCount++;
    const key = exerciseKey(exercise.name, exercise.weightMode);
    if (stats.weight === null) continue;
    if (!candidates.has(key)) candidates.set(key, { exercise, weight: stats.weight, estimatedRM: stats.estimatedRM });
    else {
      const candidate = candidates.get(key);
      if (stats.weight > candidate.weight) { candidate.weight = stats.weight; candidate.exercise = exercise; }
      if (stats.estimatedRM !== null && (candidate.estimatedRM === null || stats.estimatedRM > candidate.estimatedRM)) candidate.estimatedRM = stats.estimatedRM;
    }
  }
  for (const [key, candidate] of candidates) {
    const { exercise, weight, estimatedRM } = candidate;
    const previous = history.get(key) || [];
    if (!previous.length) continue;
    const weights = previous.map(record => record.weight).filter(Number.isFinite);
    const rms = previous.map(record => record.estimatedRM).filter(Number.isFinite);
    const weightPR = weights.length > 0 && weight > Math.max(...weights);
    const rmPR = estimatedRM !== null && rms.length > 0 && estimatedRM > Math.max(...rms);
    if (weightPR || rmPR) {
      records.push({ exerciseId: exercise.exerciseId, name: exercise.name, weightMode: weightMode(exercise.weightMode), weight, estimatedRM, type: weightPR ? 'weight' : 'estimatedRM' });
    }
  }
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : Date.now();
  const durationSeconds = Math.max(0, Math.floor((end - new Date(session.startedAt).getTime()) / 1000));
  return { volume, sets, exerciseCount, durationSeconds, records, recordCount: records.length };
}

export function createExport(state, kind) {
  if (!['routine', 'progress', 'backup'].includes(kind)) fail('El tipo de exportación no es válido.');
  const clean = normalizeState(state);
  const data = kind === 'routine' ? { routine: clean.routine } : kind === 'progress' ? { sessions: clean.sessions, legacyProgress: clean.legacyProgress, profile: clean.profile } : clean;
  return { app: 'gym-log', version: 2, kind, exportedAt: new Date().toISOString(), data: clone(data) };
}

function hash(text) {
  let result = 2166136261;
  for (let index = 0; index < text.length; index++) result = Math.imul(result ^ text.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}

const sessionContent = session => JSON.stringify({ ...session, id: undefined, exercises: session.exercises.map(exercise => ({ ...exercise, weightMode: weightMode(exercise.weightMode) })) });
const legacyContent = record => JSON.stringify([normalizedName(record.name), record.date, record.weight, record.reps]);

function mergeSessions(current, incoming) {
  const result = clone(current);
  const ids = new Set(current.map(session => session.id));
  const contents = new Set(current.map(sessionContent));
  for (const session of incoming) {
    const content = sessionContent(session);
    if (contents.has(content)) continue;
    const next = clone(session);
    if (ids.has(next.id)) {
      const base = `${next.id.slice(0, 105)}-import-${hash(content)}`;
      next.id = base;
      let suffix = 1;
      while (ids.has(next.id)) next.id = `${base}-${suffix++}`;
    }
    result.push(next);
    ids.add(next.id);
    contents.add(content);
  }
  if (result.length > LIMITS.sessions) fail('La fusión supera el límite de 5000 sesiones.');
  return result;
}

function mergeLegacy(current, incoming) {
  const result = clone(current);
  const contents = new Set(current.map(legacyContent));
  for (const record of incoming) {
    const content = legacyContent(record);
    if (!contents.has(content)) { result.push(clone(record)); contents.add(content); }
  }
  if (result.length > LIMITS.legacy) fail('La fusión supera el límite de registros antiguos.');
  return result;
}

export function importData(state, payload, mode = 'merge') {
  if (!['merge', 'replace'].includes(mode)) fail('El modo de importación no es válido.');
  const original = normalizeState(state);
  const emptyDestination = !original.sessions.length && !original.legacyProgress.length && !original.activeSession && !original.notes && !original.profile.displayName && !original.profile.handle && original.week === 1;
  const imported = typeof payload === 'string' ? parseJson(payload) : payload;
  inspectJson(imported);
  object(imported, 'El archivo');
  let kind;
  let data;
  let oldNotes;
  let oldWeek;
  if (own(imported, 'days')) { kind = 'routine'; data = { routine: normalizeRoutine(imported) }; }
  else if (own(imported, 'progress') && !own(imported, 'app')) {
    const progress = object(imported.progress, 'El progreso antiguo');
    const legacyProgress = [];
    for (const [exerciseId, entries] of Object.entries(progress)) {
      for (const entry of array(entries, LIMITS.legacy, 'Los registros antiguos importados')) {
        object(entry, 'El registro antiguo importado');
        if (legacyProgress.length >= LIMITS.legacy) fail('El archivo supera el límite de registros antiguos.');
        const fallback = original.routine.days.flatMap(day => day.exercises).find(exercise => exercise.id === exerciseId.replace(/^\d+:/, ''))?.name || exerciseId.replace(/^\d+:/, '');
        legacyProgress.push(normalizeLegacy({ exerciseId, name: entry.name || fallback, date: entry.date, weight: entry.weight, reps: null }, true));
      }
    }
    if (imported.notes !== undefined) oldNotes = string(imported.notes, 10000, 'Las notas antiguas importadas');
    if (imported.week !== undefined) oldWeek = number(Number(imported.week), 1, 1000, 'La semana antigua importada', true);
    kind = 'progress';
    data = { sessions: [], legacyProgress, profile: { displayName: '', handle: '' } };
  }
  else {
    if (imported.app !== 'gym-log' || imported.version !== 2 || !['routine', 'progress', 'backup'].includes(imported.kind)) fail('El archivo no es una exportación compatible de esta app.');
    kind = imported.kind;
    data = object(imported.data, 'El contenido del archivo');
    if (kind === 'backup') data = normalizeState(data);
    else if (kind === 'routine') data = { routine: normalizeRoutine(data.routine) };
    else {
      const sessions = array(data.sessions, LIMITS.sessions, 'Las sesiones importadas').map(session => normalizeSession(session));
      if (sessions.some(session => !session.finishedAt)) fail('El historial importado contiene una sesión sin finalizar.');
      data = { sessions, legacyProgress: array(data.legacyProgress || [], LIMITS.legacy, 'Los registros importados').map(record => normalizeLegacy(record)), profile: normalizeProfile(data.profile) };
    }
  }
  let result = clone(original);
  if (kind === 'backup' && mode === 'replace') result = clone(data);
  else {
    if (kind === 'routine' || kind === 'backup') {
      result.routine = clone(data.routine);
      result.selectedDay = Math.min(result.selectedDay, result.routine.days.length - 1);
    }
    if (kind === 'progress' || kind === 'backup') {
      result.sessions = mode === 'replace' ? mergeSessions([], data.sessions) : mergeSessions(result.sessions, data.sessions);
      result.legacyProgress = mode === 'replace' ? mergeLegacy([], data.legacyProgress) : mergeLegacy(result.legacyProgress, data.legacyProgress);
      if (mode === 'replace') result.profile = clone(data.profile);
      else for (const key of ['displayName', 'handle']) if (!result.profile[key]) result.profile[key] = data.profile[key];
      if (kind === 'backup') {
        if (!result.activeSession && data.activeSession && !result.sessions.some(session => session.id === data.activeSession.id)) result.activeSession = clone(data.activeSession);
        if (!result.notes) result.notes = data.notes;
        if (emptyDestination) { result.week = data.week; result.selectedDay = data.selectedDay; }
      }
    }
  }
  // A completed imported session supersedes an active draft with the same ID.
  if (result.activeSession && result.sessions.some(session => session.id === result.activeSession.id)) result.activeSession = null;
  if (oldNotes !== undefined && (mode === 'replace' || !result.notes)) result.notes = oldNotes;
  if (oldWeek !== undefined && (mode === 'replace' || result.week === 1)) result.week = oldWeek;
  result = normalizeState(result);
  return { state: result, summary: { kind, addedSessions: Math.max(0, result.sessions.length - original.sessions.length), addedLegacy: Math.max(0, result.legacyProgress.length - original.legacyProgress.length), routineUpdated: kind === 'routine' || kind === 'backup', mode } };
}
