import { defaultRoutineData } from './default-routine.js';
import { loadState, saveState, localDate, normalizeRoutine, getExerciseHistory, summarizeSession, createExport, importData, clearHistory } from './data.js';
import { ROUTINE_TEMPLATES } from './routine-templates.js';
import { renderShareCard, downloadCanvas, copyCanvas, shareCanvas } from './share.js';
import { createMotion } from './motion.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const uiMotion = createMotion(document.documentElement);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const num = (value, digits = 1) => Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: digits });
const dateLabel = (value, options = {}) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...options });
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const muscleLabels = { pecho: 'Pecho', espalda: 'Espalda', hombros: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', cuadriceps: 'Cuádriceps', isquios: 'Isquios', gluteos: 'Glúteos', gemelos: 'Gemelos', core: 'Core', otros: 'Otros' };
const timeLabel = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`;
const durationLabel = seconds => seconds >= 3600 ? `${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min` : `${Math.max(0, Math.floor(seconds / 60))} min`;
const paths = {
  dumbbell: '<path d="M7 8v8M4 9v6M17 8v8M20 9v6M7 12h10"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 4 2 4-6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z"/>',
  trophy: '<path d="M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v6M8 21h8"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dumbbell}</svg>`; }
let state;
let warnings = [];
let storageRecovery = null;
try { ({ state, warnings, recovery: storageRecovery } = loadState(defaultRoutineData)); }
catch { state = { schemaVersion: 2, routine: structuredClone(defaultRoutineData), sessions: [], activeSession: null, legacyProgress: [], profile: { displayName: '', handle: '' }, selectedDay: 0, week: 1, notes: '' }; warnings.push('No se pudo acceder al almacenamiento. Exporta tus datos antes de cerrar.'); }
// Adopt the explicit weight convention of known exercises in the original plan.
// Completed and active sessions retain the convention captured when recorded.
if (!state.activeSession) {
  const defaults = defaultRoutineData.days.flatMap(day => day.exercises);
  for (const exercise of state.routine.days.flatMap(day => day.exercises)) {
    const original = defaults.find(item => item.id === exercise.id && item.name === exercise.name);
    if (!exercise.weightMode && original?.weightMode) exercise.weightMode = original.weightMode;
  }
}
let route = 'train';
let selectedExercise = null;
let chartMetric = 'weight';
let chartRange = 'all';
let reviewState = null;
let toastTimeout;
let dialogAction = null;
let sharedSession = null;
let sharePhoto = null;
let shareRender = Promise.resolve();
let shareRevision = 0;
let restTotal = 90;

function toast(message, error = false) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
}
function commit(change) {
  const previous = structuredClone(state);
  try { change(state); saveState(state); return true; }
  catch (error) { state = previous; toast(error.message || 'No se pudo guardar. Exporta una copia de tus datos.', true); return false; }
}
function currentDay() { return state.routine.days[state.selectedDay] || state.routine.days[0]; }
function isCurrentActive() { return state.activeSession?.dayIndex === state.selectedDay; }
function sessionSummary(session, source = state) {
  const prior = source.sessions.filter(s => s.id !== session.id && new Date(s.finishedAt) < new Date(session.finishedAt || Date.now()));
  return summarizeSession(session, prior, source.legacyProgress);
}
function setTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  $('meta[name="theme-color"]').content = theme === 'light' ? '#f5f4ef' : '#171916';
  $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  $('#theme-toggle').setAttribute('aria-label', theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro');
  $$('[data-action="theme"]').forEach(button => {
    button.classList.toggle('active', button.dataset.value === theme);
    button.setAttribute('aria-pressed', String(button.dataset.value === theme));
  });
  if (persist) { try { localStorage.setItem('repite-theme', theme); } catch {} }
}
function navigate(next, scroll = true) {
  const previous = route;
  route = next;
  if (!['progress', 'history'].includes(route)) reviewState = null;
  $$('.page').forEach(page => { page.hidden = page.id !== `${route}-page`; page.classList.toggle('active', !page.hidden); });
  $$('[data-route]').forEach(button => {
    button.classList.toggle('active', button.dataset.route === route);
    if (button.closest('nav')) button.setAttribute('aria-current', button.dataset.route === route ? 'page' : 'false');
  });
  renderPage();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  if (previous !== next) {
    const order = ['train', 'progress', 'history', 'routine', 'settings'];
    uiMotion.page($(`#${route}-page`), Math.sign(order.indexOf(next) - order.indexOf(previous)) || 1);
  }
}
function renderPage() {
  $('#profile-initial').textContent = state.profile.displayName ? state.profile.displayName.slice(0, 2).toUpperCase() : 'Tú';
  ({ train: renderTrain, progress: renderProgress, history: renderHistory, routine: renderRoutine, settings: renderSettings })[route]?.();
}
function pageHead(eyebrow, title, subtitle, action = '') {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lede">${subtitle}</p></div>${action ? `<div class="head-actions">${action}</div>` : ''}</div>`;
}
function stat(label, value, unit = '') { return `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}<small class="stat-unit">${unit}</small></strong></div>`; }
function completedSets(session) { return session?.exercises.flatMap(ex => ex.sets.filter(set => set.done)) || []; }
function weightUnit(exercise) { return exercise.weightMode === 'perDumbbell' ? 'kg por mancuerna' : 'kg'; }
function lastExercise(name, weightMode = 'total') {
  const same = value => value.toLocaleLowerCase('es') === name.toLocaleLowerCase('es');
  return [...state.sessions].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)).flatMap(s => s.exercises).find(ex => same(ex.name) && (ex.weightMode || 'total') === weightMode);
}
function reviewBanner() {
  return reviewState ? `<div class="info-box review-banner"><div><b>Revisando ${esc(reviewState.profile.displayName || reviewState.profile.handle || 'seguimiento importado')}</b><p class="caption">Vista de consulta. Estos datos no se han mezclado con los tuyos.</p></div><button class="btn secondary small" data-action="end-review">Volver a mis datos</button></div>` : '';
}
function weekStrip(source = state) {
  const trained = new Set(source.sessions.map(s => localDate(new Date(s.finishedAt))));
  const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(); date.setDate(date.getDate() - 6 + i); return date; });
  const count = days.filter(date => trained.has(localDate(date))).length;
  return `<div class="week-strip">${days.map(date => `<div class="week-day ${trained.has(localDate(date)) ? 'trained' : ''}"><span>${esc(date.toLocaleDateString('es', { weekday: 'narrow' }))}</span><b>${trained.has(localDate(date)) ? icon('check') : date.getDate()}</b></div>`).join('')}</div><p class="caption">${count} ${count === 1 ? 'día entrenado' : 'días entrenados'} en los últimos 7 días</p>`;
}
function renderTrain() {
  const previousTabScroll = $('.day-tabs')?.scrollLeft || 0;
  const day = currentDay();
  const active = isCurrentActive() ? state.activeSession : null;
  const done = completedSets(active);
  const expected = active?.exercises.reduce((sum, ex) => sum + ex.sets.length, 0) || day.exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);
  const volume = active ? summarizeSession(active).volume : 0;
  const trainable = day.exercises.some(ex => ex.sets);
  const title = day.title.split('•').slice(-1)[0].trim();
  const startButton = active ? `<button class="btn primary" data-action="finish-session">Terminar sesión ${icon('check')}</button>` : state.activeSession ? '<button class="btn primary" data-action="resume-session">Volver a la sesión</button>' : trainable ? `<button class="btn primary" data-action="start-session">Empezar entrenamiento ${icon('arrow')}</button>` : '<button class="btn secondary" data-route="routine">Editar mi rutina</button>';
  $('#train-page').innerHTML = pageHead(esc(dateLabel(new Date().toISOString(), { weekday: 'long', year: 'numeric' })), esc(title), active ? 'Una serie a la vez. Todo cuenta.' : 'Tu plan está listo. Hoy también cuenta.', startButton) + `
    <div class="day-tabs" role="group" aria-label="Días de tu rutina">${state.routine.days.map((d, i) => `<button class="day-tab ${i === state.selectedDay ? 'active' : ''}" data-action="select-day" data-day="${i}" aria-pressed="${i === state.selectedDay}"><span class="day-abbr">${esc(d.title.split('•')[0].trim())}</span><span class="day-label">${d.exercises.filter(ex => ex.sets).length} ejercicios</span>${state.activeSession?.dayIndex === i ? '<span class="day-count">En curso</span>' : ''}</button>`).join('')}</div>
    ${state.activeSession && !active ? `<div class="info-box">Tienes una sesión en curso: <b>${esc(state.activeSession.title)}</b>. <button class="btn subtle small" data-action="resume-session">Continuar</button></div>` : ''}
    <div class="workout-layout"><div class="exercise-list">${day.exercises.map((ex, exIndex) => exerciseHTML(ex, exIndex, active)).join('')}</div>
    <aside class="session-aside"><section class="panel session-hero"><div class="panel-heading"><span class="eyebrow">${active ? 'Sesión en curso' : 'Tu sesión'}</span><span class="badge">${active ? 'En marcha' : 'A tu ritmo'}</span></div><h2 class="session-title">${esc(title)}</h2><div class="stats-row">${stat('Series', `${done.length}<span class="muted">/${expected}</span>`)}${stat('Volumen', num(volume), ' kg')}</div><div class="session-progress"><div class="progress-track"><span style="transform:scaleX(${expected ? done.length / expected : 0})"></span></div><span class="caption">${active ? `${Math.round(expected ? done.length / expected * 100 : 0)} % completado` : 'Empieza para registrar tus series'}</span></div>${active ? `<div class="session-clock">${icon('clock')}<span id="session-elapsed">${durationLabel((Date.now() - new Date(active.startedAt)) / 1000)}</span></div><button class="btn subtle small" data-action="discard-session">Descartar sesión en curso</button>` : ''}</section>
    <section class="panel"><h2 class="section-title">Tu constancia</h2>${weekStrip()}<button class="btn subtle small" data-route="progress">Ver mi progreso ${icon('arrow')}</button></section>
    <section class="panel"><label class="field">Notas ${active ? 'de esta sesión' : 'personales'}<textarea id="session-notes" placeholder="Cómo te has sentido, algo que recordar…" maxlength="5000">${esc(active?.notes ?? state.notes)}</textarea></label><details><summary>Mi plan de 6 semanas</summary><label class="field">Semana<select id="plan-week">${[1, 2, 3, 4, 5, 6].map(w => `<option value="${w}" ${Number(state.week) === w ? 'selected' : ''}>${w}${w === 4 ? ' · Descarga' : ''}</option>`).join('')}</select></label><p class="caption">${weekHint()}</p><p class="caption">RIR: repeticiones que te quedan antes del fallo. Tu rutina puede indicar un objetivo.</p></details></section></aside></div>`;
  const strip = $('.day-tabs'); strip.scrollLeft = previousTabScroll;
  const activeTab = $('.day-tab.active', strip);
  const box = strip.getBoundingClientRect(), tabBox = activeTab.getBoundingClientRect();
  if (tabBox.left < box.left) strip.scrollLeft -= box.left - tabBox.left;
  else if (tabBox.right > box.right) strip.scrollLeft += tabBox.right - box.right;
}
function weekHint() {
  return ({ 1: 'Plan original: compuestos RIR 2–3 y accesorios RIR 1–2.', 2: 'Plan original: compuestos RIR 1–2 y accesorios RIR 0–1.', 3: 'Plan original: compuestos RIR 1–2 y accesorios RIR 0–1.', 4: 'Semana de descarga del plan original: menos series y mayor margen de esfuerzo.', 5: 'Últimas semanas del plan original. Compara tus cargas con las primeras sesiones.', 6: 'Cierra el bloque y revisa tu progreso antes de preparar el siguiente.' })[state.week] || '';
}
function exerciseHTML(ex, exIndex, active) {
  const savedEx = active?.exercises.find(e => e.exerciseId === ex.id);
  const previous = lastExercise(ex.name, ex.weightMode)?.sets.filter(s => s.done) || [];
  const sets = savedEx?.sets || Array.from({ length: ex.sets || 0 }, () => ({ weight: null, reps: null, done: false }));
  return `<article class="exercise-card" data-exercise-index="${exIndex}"><div class="exercise-heading"><span class="exercise-number">${String(exIndex + 1).padStart(2, '0')}</span><div class="exercise-info"><h2 class="exercise-name">${esc(ex.name)}</h2>${ex.sets ? `<p class="exercise-meta">${sets.length} series <span>·</span> ${esc(ex.reps)} reps <span>·</span> ${esc(ex.rir || '')} <span>·</span> ${num((ex.timer || 1.5) * 60, 0)} s descanso</p>` : ''}</div></div>
    ${ex.sets ? `<div class="set-table"><div class="set-labels"><span>Serie</span><span>Anterior</span><span>${ex.weightMode === 'perDumbbell' ? 'kg/ud.' : 'kg'}</span><span>Reps</span><span class="sr-only">Completar</span></div>${sets.map((set, index) => `<div class="set-row ${set.done ? 'is-done' : ''}" data-set-index="${index}"><span class="set-index">${index + 1}</span><span class="previous-set">${previous[index] ? `${num(previous[index].weight)} × ${previous[index].reps}` : '—'}</span><label class="set-input"><span class="sr-only">Peso (${weightUnit(ex)}) de la serie ${index + 1} de ${esc(ex.name)}</span><input type="number" inputmode="decimal" min="0" max="5000" step="0.25" placeholder="${previous[index]?.weight ?? '—'}" value="${set.weight ?? ''}" data-field="weight" ${!active || set.done ? 'disabled' : ''}></label><label class="set-input"><span class="sr-only">Repeticiones de la serie ${index + 1} de ${esc(ex.name)}</span><input type="number" inputmode="numeric" min="1" max="500" step="1" placeholder="${esc(ex.reps || '—')}" value="${set.reps ?? ''}" data-field="reps" ${!active || set.done ? 'disabled' : ''}></label><button class="set-complete" data-action="complete-set" data-exercise-index="${exIndex}" data-set-index="${index}" aria-label="${set.done ? 'Desmarcar' : 'Completar'} serie ${index + 1} de ${esc(ex.name)}" aria-pressed="${set.done}" ${!active ? 'disabled' : ''}>${icon('check')}</button></div>`).join('')}</div><div class="set-footer"><button class="mini-btn" data-action="add-set" data-exercise-index="${exIndex}" ${!active ? 'disabled' : ''}>${icon('plus')} Añadir serie</button>${active && sets.length > 1 ? `<button class="mini-btn" data-action="remove-set" data-exercise-index="${exIndex}">Quitar última</button>` : ""}${active ? `<button class="mini-btn" data-action="manual-rest" data-exercise-index="${exIndex}">${icon('clock')} Descansar</button>` : '<span class="caption">El descanso empieza al completar una serie</span>'}</div>` : ''}
    ${ex.weightMode === 'perDumbbell' ? '<p class="caption exercise-note">Peso de una mancuerna. El volumen cuenta las dos.</p>' : ''}${ex.note ? `<p class="exercise-note">${esc(ex.note)}</p>` : ''}</article>`;
}
function startSession() {
  if (state.activeSession) return;
  const day = currentDay();
  const exercises = day.exercises.filter(ex => ex.sets).map(ex => {
    const previous = lastExercise(ex.name, ex.weightMode)?.sets.filter(s => s.done) || [];
    return { exerciseId: ex.id, name: ex.name, weightMode: ex.weightMode || 'total', ...(ex.muscleGroup ? { muscleGroup: ex.muscleGroup } : {}), sets: Array.from({ length: ex.sets }, (_, index) => ({ weight: previous[index]?.weight ?? null, reps: previous[index]?.reps ?? null, done: false })) };
  });
  if (!exercises.length) return;
  if (commit(s => { s.activeSession = { id: uid(), title: day.title, dayIndex: s.selectedDay, startedAt: new Date().toISOString(), finishedAt: null, notes: '', exercises, restEndsAt: null, restName: '' }; })) {
    renderTrain(); toast('Sesión iniciada. Registra el peso y las repeticiones de cada serie.');
  }
}
function completeSet(button) {
  if (!isCurrentActive()) return;
  const ex = currentDay().exercises[Number(button.dataset.exerciseIndex)];
  const index = Number(button.dataset.setIndex);
  const entry = state.activeSession.exercises.find(e => e.exerciseId === ex.id);
  const set = entry.sets[index];
  const row = button.closest('.set-row');
  const weightText = $('[data-field="weight"]', row).value;
  const repsText = $('[data-field="reps"]', row).value;
  const weight = weightText === '' ? null : Number(weightText);
  const reps = repsText === '' ? null : Number(repsText);
  if (!set.done && (weight === null || reps === null || !Number.isFinite(weight) || weight < 0 || weight > 5000 || !Number.isInteger(reps) || reps < 1 || reps > 500)) {
    toast('Añade un peso válido (0 kg es posible) y las repeticiones de esta serie.', true);
    const field = weight === null || weight < 0 || weight > 5000 ? 'weight' : 'reps';
    $(`[data-field="${field}"]`, row)?.focus(); return;
  }
  const completing = !set.done;
  const expected = state.activeSession.exercises.reduce((sum, entry) => sum + entry.sets.length, 0);
  const before = completedSets(state.activeSession).length / expected;
  if (commit(() => { if (completing) { set.weight = weight; set.reps = reps; } set.done = completing; })) {
    if (completing) startRest(ex);
    renderTrain();
    const replacement = $(`[data-action="complete-set"][data-exercise-index="${button.dataset.exerciseIndex}"][data-set-index="${index}"]`);
    replacement?.focus({ preventScroll: true });
    uiMotion.setCompleted(replacement, $('.progress-track > span'), before, completedSets(state.activeSession).length / expected, completing);
  }
}
function startRest(ex) {
  restTotal = Math.round((ex.timer || 1.5) * 60);
  commit(s => { s.activeSession.restEndsAt = new Date(Date.now() + restTotal * 1000).toISOString(); s.activeSession.restName = ex.name; });
  tick();
}
function stopRest() {
  if (state.activeSession?.restEndsAt) commit(s => { s.activeSession.restEndsAt = null; });
  $('#rest-timer').hidden = true; document.body.classList.remove('has-timer'); document.title = 'Repite · Tu entrenamiento, a tu ritmo';
}
function tick() {
  const elapsed = $('#session-elapsed');
  if (elapsed && state.activeSession) elapsed.textContent = durationLabel((Date.now() - new Date(state.activeSession.startedAt)) / 1000);
  const end = state.activeSession?.restEndsAt;
  if (!end) { $('#rest-timer').hidden = true; document.body.classList.remove('has-timer'); return; }
  const left = Math.max(0, Math.ceil((new Date(end) - Date.now()) / 1000));
  if (!left) { stopRest(); toast('Descanso terminado. Cuando quieras, la siguiente serie.'); return; }
  $('#rest-timer').hidden = false; document.body.classList.add('has-timer');
  $('#timer-value').textContent = timeLabel(left);
  $('#timer-label').textContent = state.activeSession.restName || 'Descanso';
  $('#timer-ring-progress').style.strokeDashoffset = String(126 * (1 - Math.min(1, left / restTotal)));
  document.title = `${timeLabel(left)} · Descanso · Repite`;
}
function showDialog(label, title, body, buttonText = '', action = null, danger = false) {
  $('#dialog-label').textContent = label;
  $('#dialog-title').textContent = title;
  $('#dialog-body').innerHTML = body;
  $('#dialog-footer').innerHTML = `<button class="btn secondary" data-action="close-dialog">${buttonText ? 'Cancelar' : 'Cerrar'}</button>${buttonText ? `<button class="btn ${danger ? 'danger' : 'primary'}" id="dialog-confirm">${buttonText}</button>` : ''}`;
  dialogAction = action;
  if (!$('#app-dialog').open) $('#app-dialog').showModal();
}
function finishSession() {
  if (!completedSets(state.activeSession).length) { toast('Completa al menos una serie antes de guardar la sesión.', true); return; }
  const session = structuredClone(state.activeSession);
  session.finishedAt = new Date().toISOString();
  const summary = sessionSummary(session);
  const total = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  showDialog('Bien hecho', 'Otra sesión que cuenta.', `<div class="stats-row">${stat('Duración', durationLabel(summary.durationSeconds))}${stat('Volumen', num(summary.volume), ' kg')}${stat('Series', summary.sets)}</div><p class="lede">${esc(session.title)}</p>${summary.recordCount ? `<p class="record-tag">${icon('trophy')} ${summary.recordCount} ${summary.recordCount === 1 ? 'ejercicio con nuevo récord' : 'ejercicios con nuevos récords'}</p>` : ''}<p class="caption">${total > summary.sets ? 'Las series sin completar no se incluirán en tus estadísticas.' : 'Tus series quedarán guardadas en el historial.'}</p>`, 'Guardar entrenamiento', () => {
    if (!commit(s => { delete session.restEndsAt; delete session.restName; s.sessions.push(session); s.activeSession = null; })) return;
    $('#app-dialog').close(); stopRest(); renderTrain(); toast('Entrenamiento guardado.'); openShare(session);
  });
}
function sparkline(records, width = 130, height = 40) {
  const values = records.slice(-12).map(r => r.weight).filter(Number.isFinite);
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((v, i) => `${6 + i * (width - 12) / (values.length - 1 || 1)},${height - 6 - (v - min) / range * (height - 12)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function renderProgress() {
  const source = reviewState || state;
  const groups = getExerciseHistory(source);
  const month = localDate().slice(0, 7);
  const monthly = source.sessions.filter(s => localDate(new Date(s.finishedAt)).startsWith(month));
  const volume = monthly.reduce((sum, s) => sum + summarizeSession(s).volume, 0);
  $('#progress-page').innerHTML = reviewBanner() + pageHead('Todo lo que estás construyendo', reviewState ? 'Su progreso.' : 'Tu progreso.', 'Menos suposiciones. Más perspectiva.', reviewState ? '' : `<button class="btn secondary" data-action="share-week">${icon('share')} Compartir semana</button>`) + `
    <div class="dashboard-grid"><div class="metric-card">${stat('Sesiones este mes', monthly.length)}</div><div class="metric-card">${stat('Volumen este mes', num(volume), ' kg')}</div><div class="metric-card">${stat('Ejercicios registrados', groups.length)}</div></div>
    <div class="panel"><div class="panel-heading"><h2 class="section-title">Últimos 7 días</h2><span class="caption">Cada día cuenta una vez</span></div>${weekStrip(source)}</div>
    ${groups.length ? `<div class="section-heading"><h2 class="section-title">Ejercicio a ejercicio</h2><span class="caption">Carga · volumen · 1RM estimado</span></div><div class="exercise-progress-list">${groups.map(group => {
      const last = group.records.at(-1);
      const best = Math.max(...group.records.map(r => r.weight));
      return `<button class="exercise-progress-item" data-action="exercise-progress" data-id="${esc(group.id)}"><div class="exercise-progress-top"><div><h3>${esc(group.name)}</h3><p class="caption">${group.records.length} registros · Máximo ${num(best)} ${weightUnit(group)}</p></div><span class="progress-last">${num(last.weight)}<small> ${weightUnit(group)}</small></span></div>${sparkline(group.records)}<span class="caption">Ver evolución ${icon('arrow')}</span></button>`;
    }).join('')}</div>` : emptyState('chart', 'Tu progreso empieza con una sesión.', 'Registra peso y repeticiones. Aquí verás tus cargas, volumen y marcas personales.', '<button class="btn primary" data-route="train">Ir a entrenar</button>')}`;
  if (selectedExercise && groups.some(g => g.id === selectedExercise)) renderExerciseProgress();
}
function emptyState(symbol, title, description, button = '') { return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h2>${title}</h2><p>${description}</p>${button}</div>`; }
function renderExerciseProgress() {
  const group = getExerciseHistory(reviewState || state).find(g => g.id === selectedExercise);
  if (!group) { selectedExercise = null; renderProgress(); return; }
  const cutoff = Date.now() - Number(chartRange === 'all' ? 99999 : chartRange) * 86400000;
  const records = group.records.filter(r => new Date(`${r.date.slice(0, 10)}T12:00:00`) >= cutoff);
  const valid = records.filter(r => Number.isFinite(r[chartMetric]));
  const units = chartMetric === 'volume' ? 'kg·rep' : weightUnit(group);
  const bestWeight = Math.max(...group.records.map(r => r.weight));
  const rms = group.records.map(r => r.estimatedRM).filter(Number.isFinite);
  const first = valid[0]?.[chartMetric], last = valid.at(-1)?.[chartMetric];
  const change = first > 0 && valid.length > 1 ? (last - first) / first * 100 : null;
  $('#progress-page').innerHTML = reviewBanner() + `<button class="btn subtle back-button" data-action="progress-back">${icon('back')} Todos los ejercicios</button>` + pageHead('Tu evolución', esc(group.name), `${group.records.length} registros guardados.`, '') + `
    <div class="dashboard-grid"><div class="metric-card">${stat('Mayor carga', num(bestWeight), group.weightMode === 'perDumbbell' ? ' kg/ud.' : ' kg')}</div><div class="metric-card">${stat('Mejor 1RM estimado', rms.length ? num(Math.max(...rms)) : '—', rms.length ? (group.weightMode === 'perDumbbell' ? ' kg/ud.' : ' kg') : '')}</div><div class="metric-card">${stat('Cambio en el periodo', change === null ? '—' : `${change > 0 ? '+' : ''}${num(change)} %`)}</div></div>
    <section class="chart-panel panel"><div class="chart-controls"><div class="segmented" aria-label="Métrica">${[['weight', 'Carga'], ['estimatedRM', '1RM'], ['volume', 'Volumen']].map(([key, label]) => `<button data-action="chart-metric" data-value="${key}" class="${chartMetric === key ? 'active' : ''}" aria-pressed="${chartMetric === key}">${label}</button>`).join('')}</div><label class="field compact"><span class="sr-only">Periodo del gráfico</span><select id="chart-range"><option value="all" ${chartRange === 'all' ? 'selected' : ''}>Todo el historial</option><option value="30" ${chartRange === '30' ? 'selected' : ''}>30 días</option><option value="90" ${chartRange === '90' ? 'selected' : ''}>90 días</option></select></label></div>
    ${valid.length ? chartSVG(valid, chartMetric, units) : '<div class="empty-state"><h3>Sin datos para esta métrica.</h3><p>El 1RM requiere peso y entre 1 y 12 repeticiones. Los registros antiguos solo contienen la carga.</p></div>'}
    <p class="caption">${chartMetric === 'estimatedRM' ? '1RM aproximado con Epley: peso × (1 + repeticiones / 30). Se calcula con series de 1 a 12 reps; una repetición usa el peso real.' : chartMetric === 'volume' ? `Volumen de las series completadas: peso × repeticiones${group.weightMode === 'perDumbbell' ? ' × 2 mancuernas' : ''}. No disponible en registros antiguos sin repeticiones.` : 'Mayor carga registrada en cada sesión. No se mezcla el peso de ejercicios distintos.'}</p></section>
    <div class="section-heading"><h2 class="section-title">Tus registros</h2><span class="caption">Los datos antiguos se conservan</span></div><div class="table-scroll"><table class="chart-table"><thead><tr><th>Fecha</th><th>Carga</th><th>Reps</th><th>Volumen</th><th>1RM est.</th></tr></thead><tbody>${[...records].reverse().map(r => `<tr><td>${esc(dateLabel(r.date, { year: 'numeric' }))}</td><td>${num(r.weight)} ${group.weightMode === 'perDumbbell' ? 'kg/ud.' : 'kg'}</td><td>${r.reps ?? '—'}</td><td>${Number.isFinite(r.volume) ? num(r.volume) : '—'}</td><td>${Number.isFinite(r.estimatedRM) ? `${num(r.estimatedRM)} kg` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function chartSVG(records, metric, units) {
  const data = records.slice(-30);
  const width = Math.min(760, Math.max(300, document.documentElement.clientWidth - 100));
  const height = 260, pad = { left: 48, right: 26, top: 30, bottom: 42 };
  const values = data.map(r => r[metric]);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, max * 0.15, 1);
  const low = Math.max(0, min - span * 0.25), high = max + span * 0.25;
  const x = i => data.length === 1 ? width / 2 : pad.left + i / (data.length - 1) * (width - pad.left - pad.right);
  const y = value => height - pad.bottom - (value - low) / (high - low) * (height - pad.top - pad.bottom);
  const points = data.map((r, i) => `${x(i)},${y(r[metric])}`).join(' ');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${metric === 'weight' ? 'la carga' : metric === 'volume' ? 'volumen' : '1RM estimado'}, ${data.length} registros. Datos en la tabla inferior.">${Array.from({ length: 4 }, (_, i) => { const value = low + (high - low) * i / 3; return `<line class="chart-grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-label" x="${pad.left - 10}" y="${y(value) + 4}" text-anchor="end">${num(value, 0)}</text>`; }).join('')}<polygon class="chart-area" points="${x(0)},${height - pad.bottom} ${points} ${x(data.length - 1)},${height - pad.bottom}"/><polyline class="chart-line" points="${points}"/>${data.map((r, i) => `<circle class="chart-point" cx="${x(i)}" cy="${y(r[metric])}" r="4"><title>${esc(dateLabel(r.date))}: ${num(r[metric])} ${units}</title></circle>${i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2) ? `<text class="chart-label" x="${x(i)}" y="${height - 13}" text-anchor="middle">${esc(dateLabel(r.date))}</text>` : ''}`).join('')}</svg>`;
}
function renderHistory() {
  const source = reviewState || state;
  const sessions = [...source.sessions].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
  $('#history-page').innerHTML = reviewBanner() + pageHead('Lo que ya has hecho', reviewState ? 'Sus sesiones.' : 'Tu historial.', `${sessions.length} ${sessions.length === 1 ? 'sesión guardada' : 'sesiones guardadas'}. Cada entrenamiento tiene su propia historia.`, reviewState ? '' : '<button class="btn secondary" data-action="export" data-kind="progress">'+icon('download')+' Exportar seguimiento</button>') + (sessions.length ? `<div class="history-list">${sessions.map(session => {
    const summary = sessionSummary(session, source);
    return `<article class="history-card"><div class="history-date"><b>${new Date(session.finishedAt).getDate()}</b><span>${esc(new Date(session.finishedAt).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }))}</span></div><div class="history-content"><h2>${esc(session.title)}</h2><div class="history-stats"><span>${durationLabel(summary.durationSeconds)}</span><span>${num(summary.volume)} kg</span><span>${summary.sets} series</span>${summary.recordCount ? `<span class="record-tag">${icon('trophy')} ${summary.recordCount} récords</span>` : ''}</div><p class="caption">${summary.exerciseCount} ejercicios${session.notes ? ` · ${esc(session.notes.slice(0, 90))}` : ''}</p></div><div class="button-row"><button class="icon-btn" data-action="session-detail" data-id="${esc(session.id)}" aria-label="Ver sesión ${esc(session.title)}">${icon('list')}</button><button class="icon-btn" data-action="share-session" data-id="${esc(session.id)}" aria-label="Compartir sesión ${esc(session.title)}">${icon('share')}</button></div></article>`;
  }).join('')}</div>` : emptyState('calendar', 'Aquí se queda tu esfuerzo.', 'Al terminar una sesión, guárdala. Podrás revisarla, compartirla o enviársela a tu entrenador.', '<button class="btn primary" data-route="train">Mi próxima sesión</button>')) + (source.legacyProgress.length ? '<p class="info-box">Las cargas del historial anterior están disponibles en Progreso. No tenían series, repeticiones ni duración, así que se conservan como registros antiguos.</p>' : '');
}
function showSession(session) {
  const summary = sessionSummary(session, reviewState || state);
  showDialog(dateLabel(session.finishedAt, { year: 'numeric' }), session.title, `<div class="stats-row">${stat('Duración', durationLabel(summary.durationSeconds))}${stat('Volumen', num(summary.volume), ' kg')}${stat('Series', summary.sets)}</div>${session.exercises.filter(ex => ex.sets.some(s => s.done)).map(ex => `<section class="session-detail-exercise"><h3>${esc(ex.name)}</h3><p class="caption">${ex.sets.filter(s => s.done).map(s => `${num(s.weight)} ${weightUnit(ex)} × ${s.reps}`).join(' &nbsp;·&nbsp; ')}</p></section>`).join('')}${session.notes ? `<p class="info-box">${esc(session.notes)}</p>` : ''}`, reviewState ? '' : 'Compartir sesión', reviewState ? null : () => { $('#app-dialog').close(); openShare(session); });
}
function renderRoutine() {
  $('#routine-page').innerHTML = pageHead('Un plan que se adapta a ti', 'Tu rutina.', esc(state.routine.name || 'Mi rutina'), `<button class="btn secondary" data-action="import">Importar rutina</button><button class="btn primary" data-action="add-day">${icon('plus')} Añadir día</button>`) + `
    <div class="button-row routine-toolbar"><button class="btn subtle small" data-action="rename-routine">${icon('edit')} Nombre del plan</button><button class="btn subtle small" data-action="export" data-kind="routine">${icon('share')} Exportar rutina</button><button class="btn secondary small" data-action="routine-templates">Elegir una plantilla</button><button class="btn subtle small" data-action="blank-routine">Crear desde cero</button><button class="btn subtle small" data-action="original-routine">Usar plan original</button></div>
    <div class="routine-days">${state.routine.days.map((day, dayIndex) => `<section class="routine-day panel"><div class="routine-day-header"><div><p class="eyebrow">Día ${dayIndex + 1}</p><h2>${esc(day.title)}</h2></div><button class="icon-btn" data-action="edit-day" data-day="${dayIndex}" aria-label="Editar ${esc(day.title)}">${icon('edit')}</button></div>${day.exercises.map((ex, index) => `<div class="routine-exercise-row"><div><h3>${esc(ex.name)}</h3><p class="caption">${ex.sets ? `${ex.sets} series · ${esc(ex.reps)} reps · ${num((ex.timer || 1.5) * 60, 0)} s descanso` : esc(ex.note || 'Nota de la rutina')}</p></div><button class="icon-btn" data-action="edit-exercise" data-day="${dayIndex}" data-index="${index}" aria-label="Editar ${esc(ex.name)}">${icon('edit')}</button></div>`).join('') || '<p class="routine-empty caption">Añade tu primer ejercicio.</p>'}<button class="btn subtle small" data-action="add-exercise" data-day="${dayIndex}">${icon('plus')} Añadir ejercicio</button></section>`).join('')}</div>`;
}
function canEditRoutine() { if (state.activeSession) { toast('Termina o descarta tu sesión en curso antes de cambiar la rutina.', true); return false; } return true; }
function dayEditor(index = null) {
  if (!canEditRoutine()) return;
  showDialog('Mi rutina', index === null ? 'Añadir un día' : 'Editar día', `<label class="field">Nombre del día<input id="day-name" maxlength="100" value="${esc(index === null ? '' : state.routine.days[index].title)}" placeholder="Por ejemplo: Lunes · Torso"></label><p id="form-error" class="form-error" role="alert"></p>${index !== null && state.routine.days.length > 1 ? `<button class="btn danger small" data-action="delete-day" data-day="${index}">Eliminar día de la rutina</button>` : ''}`, 'Guardar día', () => {
    const title = $('#day-name').value.trim();
    if (!title) { $('#form-error').textContent = 'Escribe un nombre para el día.'; return; }
    if (state.routine.days.length >= 31 && index === null) { $('#form-error').textContent = 'La rutina admite hasta 31 días.'; return; }
    if (commit(s => { if (index === null) s.routine.days.push({ title, exercises: [] }); else s.routine.days[index].title = title; })) { $('#app-dialog').close(); renderRoutine(); }
  });
}
function exerciseEditor(dayIndex, index = null) {
  if (!canEditRoutine()) return;
  const ex = index === null ? {} : state.routine.days[dayIndex].exercises[index];
  showDialog('Mi rutina', index === null ? 'Nuevo ejercicio' : 'Editar ejercicio', `<div class="form-grid"><label class="field full">Nombre<input id="ex-name" maxlength="140" value="${esc(ex.name)}" placeholder="Press banca con barra"></label><label class="field">Series<input id="ex-sets" type="number" inputmode="numeric" min="1" max="30" value="${ex.sets || 3}"></label><label class="field">Repeticiones objetivo<input id="ex-reps" maxlength="20" value="${esc(ex.reps || '8-12')}"></label><label class="field">Descanso (segundos)<input id="ex-rest" type="number" inputmode="numeric" min="10" max="900" value="${Math.round((ex.timer || 1.5) * 60)}"></label><label class="field">RIR (opcional)<input id="ex-rir" maxlength="30" value="${esc(ex.rir || '')}" placeholder="RIR 2"></label><label class="field full">Cómo registras el peso<select id="ex-weight-mode"><option value="total" ${ex.weightMode !== 'perDumbbell' ? 'selected' : ''}>Carga total · barra, máquina o una mancuerna</option><option value="perDumbbell" ${ex.weightMode === 'perDumbbell' ? 'selected' : ''}>Dos mancuernas · peso de una</option></select><span class="caption">Con dos mancuernas, el volumen cuenta ambas. La carga y el 1RM se muestran por mancuerna.</span></label><label class="field full">Grupo muscular (opcional)<select id="ex-muscle"><option value="">Sin especificar</option>${Object.entries(muscleLabels).map(([value,label]) => `<option value="${value}" ${ex.muscleGroup === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field full">Nota (opcional)<textarea id="ex-note" maxlength="1000">${esc(ex.note)}</textarea></label></div><p id="form-error" class="form-error" role="alert"></p>${index !== null ? `<button class="btn danger small" data-action="delete-exercise" data-day="${dayIndex}" data-index="${index}">Eliminar ejercicio del plan</button>` : ''}`, 'Guardar ejercicio', () => {
    const name = $('#ex-name').value.trim(), sets = Number($('#ex-sets').value), rest = Number($('#ex-rest').value), reps = $('#ex-reps').value.trim();
    if (!name || !reps || !Number.isInteger(sets) || sets < 1 || sets > 30 || !Number.isFinite(rest) || rest < 10 || rest > 900) { $('#form-error').textContent = 'Completa el nombre, 1–30 series, repeticiones y un descanso de 10–900 segundos.'; return; }
    if (index === null && state.routine.days[dayIndex].exercises.length >= 50) { $('#form-error').textContent = 'El día admite hasta 50 ejercicios.'; return; }
    const muscleGroup = $('#ex-muscle').value;
    const next = { id: ex.id || uid(), name, sets, reps, weightMode: $('#ex-weight-mode').value, timer: rest / 60, rest: `${rest} s`, rir: $('#ex-rir').value.trim(), note: $('#ex-note').value.trim(), ...(muscleGroup ? { muscleGroup } : {}) };
    if (commit(s => { if (index === null) s.routine.days[dayIndex].exercises.push(next); else s.routine.days[dayIndex].exercises[index] = next; })) { $('#app-dialog').close(); renderRoutine(); }
  });
}
function replaceRoutine(routine) {
  if (!canEditRoutine()) return;
  showDialog('Cambiar plan', 'Preparar una nueva rutina', '<p>La rutina actual se sustituirá. Tu historial y tus marcas se conservarán. Puedes exportar el plan actual antes de continuar.</p>', 'Usar esta rutina', () => {
    if (commit(s => { s.routine = normalizeRoutine(routine); s.selectedDay = 0; })) { $('#app-dialog').close(); renderRoutine(); toast('Rutina preparada. Tu historial se ha conservado.'); }
  });
}
function chooseTemplate() {
  if (!canEditRoutine()) return;
  showDialog('Un punto de partida', 'Elige cómo entrenar.', `<p>Son planes base editables. Puedes revisar los ejercicios antes de elegir y adaptar las series, los descansos y los días.</p><div class="template-options">${ROUTINE_TEMPLATES.map(template => `<section class="template-option"><h3>${esc(template.name)}</h3><p class="caption">${esc(template.description)}</p><div class="button-row">${template.options.map(option => `<button class="btn secondary small" data-action="preview-template" data-template="${esc(template.id)}" data-days="${option.days}">${esc(option.label)}</button>`).join('')}</div></section>`).join('')}</div>`);
}
function previewTemplate(id, days) {
  const template = ROUTINE_TEMPLATES.find(item => item.id === id);
  const option = template?.options.find(item => item.days === days);
  if (!option || !canEditRoutine()) return;
  showDialog('Plantilla editable', option.routine.name, `<p>Este plan sustituirá tu rutina actual y conservará tus entrenamientos guardados.</p><div class="template-options">${option.routine.days.map(day => `<section class="template-option"><h3>${esc(day.title)}</h3><p class="caption">${day.exercises.map(ex => esc(ex.name)).join(' · ')}</p></section>`).join('')}</div>`, 'Usar esta plantilla', () => {
    if (commit(s => { s.routine = normalizeRoutine(structuredClone(option.routine)); s.selectedDay = 0; })) { $('#app-dialog').close(); renderRoutine(); toast('Plantilla preparada. Puedes adaptar todos sus ejercicios.'); }
  });
}
function confirmClearHistory() {
  showDialog('Borrar historial', '¿Estás seguro?', `<p>Se borrarán <b>${state.sessions.length} ${state.sessions.length === 1 ? 'sesión' : 'sesiones'}</b>, <b>${state.legacyProgress.length} ${state.legacyProgress.length === 1 ? 'carga antigua' : 'cargas antiguas'}</b>, sus gráficas, marcas y copias de recuperación guardadas en este navegador.</p><p>La rutina, tu perfil y la sesión en curso se conservarán. Esta acción no se puede deshacer desde la app. Si quieres recuperar el historial después, exporta una copia antes de borrar.</p><p id="form-error" class="form-error" role="alert"></p>`, 'Sí, borrar mi historial', () => {
    try {
      state = clearHistory(state);
      storageRecovery = null; reviewState = null; selectedExercise = null;
      $('#app-dialog').close(); renderSettings(); toast('Tu historial se ha borrado.');
    } catch (error) {
      if (error.state) { state = error.state; reviewState = null; selectedExercise = null; }
      $('#form-error').textContent = error.message || 'No se pudo borrar el historial. Inténtalo otra vez.';
    }
  }, true);
  const backup = document.createElement('button'); backup.className = 'btn secondary'; backup.textContent = 'Exportar copia antes';
  backup.addEventListener('click', () => downloadJSON('backup'));
  $('#dialog-footer').prepend(backup);
  $('[data-action="close-dialog"]', $('#dialog-footer')).focus();
}
function renderSettings() {
  $('#settings-page').innerHTML = pageHead('Tu espacio', 'A tu manera.', 'Tu perfil, tu estilo y tus datos, siempre contigo.') + (storageRecovery?.raw ? '<div class="info-box"><p>Hay una copia de datos que no se pudo leer. Puedes descargar el archivo original para recuperarlo.</p><button class="btn secondary small" data-action="export-recovery">Descargar original para recuperar</button></div>' : '') + `
    <div class="settings-grid"><section class="settings-panel panel"><h2 class="section-title">Tu perfil</h2><p class="caption">Este @usuario aparecerá por defecto en tus imágenes.</p><form id="profile-form"><label class="field">Nombre<input name="displayName" autocomplete="nickname" maxlength="80" placeholder="Cómo te llamas" value="${esc(state.profile.displayName)}"></label><label class="field">@usuario<input name="handle" autocapitalize="none" spellcheck="false" maxlength="60" placeholder="@tuusuario" value="${esc(state.profile.handle)}"></label><button class="btn primary" type="submit">Guardar perfil</button></form></section>
    <section class="settings-panel panel"><h2 class="section-title">Apariencia</h2><p class="caption">Un espacio tranquilo para concentrarte.</p><div class="segmented"><button data-action="theme" data-value="dark" class="${document.documentElement.dataset.theme === 'dark' ? 'active' : ''}">${icon('moon')} Oscuro</button><button data-action="theme" data-value="light" class="${document.documentElement.dataset.theme === 'light' ? 'active' : ''}">${icon('sun')} Claro</button></div><h3 class="section-subtitle">En tu iPhone</h3><p class="caption">Abre la app en Safari, pulsa Compartir y «Añadir a pantalla de inicio». Después de la primera visita, podrás usarla sin conexión.</p></section>
    <section class="settings-panel panel full"><h2 class="section-title">Tus datos van contigo.</h2><p class="caption">Guarda una copia, cambia de dispositivo o envía tu seguimiento a un entrenador. Los archivos se importan desde aquí.</p><div class="export-options">${[['routine', 'Solo la rutina', 'Días, ejercicios, series objetivo y descansos.'], ['progress', 'Seguimiento y progresión', 'Sesiones, pesos, repeticiones y registros antiguos.'], ['backup', 'Copia completa', 'Rutina, historial, perfil y sesión en curso.']].map(([kind, label, description]) => `<div class="export-option"><div><h3>${label}</h3><p class="caption">${description}</p></div><button class="btn secondary small" data-action="export" data-kind="${kind}">${icon('download')} Exportar</button></div>`).join('')}</div><button class="btn primary" data-action="import">Importar archivo JSON</button><p class="info-box">Al importar seguimiento, se añade sin duplicar sesiones. Importar una rutina conserva tu historial. Los datos se guardan en este dispositivo: exporta una copia para llevarlos a otro.</p></section><section class="settings-panel panel full"><h2 class="section-title">Empezar un historial nuevo</h2><p class="caption">Puedes borrar tus sesiones, cargas antiguas y copias de recuperación guardadas en este navegador. La app pedirá confirmación antes de hacerlo.</p><button class="btn danger" data-action="clear-history">Borrar todo mi historial</button></section></div>`;
}
function downloadJSON(kind) {
  try {
    const blob = new Blob([JSON.stringify(createExport(state, kind), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `repite-${kind}-${localDate()}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Archivo exportado. Puedes enviarlo a tus amigos o entrenador.');
  } catch (error) { toast(error.message, true); }
}
async function previewImport(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('El archivo supera el límite de 10 MB.', true); return; }
  try {
    const payload = JSON.parse(await file.text());
    const result = importData(state, payload, 'merge');
    if (state.activeSession && result.summary.routineUpdated) { toast('Termina tu sesión antes de importar una rutina.', true); return; }
    const incoming = importData({ ...structuredClone(state), sessions: [], legacyProgress: [], activeSession: null, profile: { displayName: '', handle: '' } }, payload, 'merge').state;
    showDialog('Revisar importación', 'Tus datos, sin perder lo anterior.', `<p>${incoming.profile.displayName || incoming.profile.handle ? `Seguimiento de <b>${esc(incoming.profile.displayName || incoming.profile.handle)}</b>. ` : ''}Puedes combinarlo con tus datos${incoming.sessions.length || incoming.legacyProgress.length ? ' o consultarlo por separado para revisar el progreso de un cliente o amigo' : ''}.</p><div class="stats-row">${stat('Sesiones nuevas', result.summary.addedSessions || 0)}${stat('Registros antiguos', result.summary.addedLegacy || 0)}</div><p class="info-box">${result.summary.routineUpdated ? 'Al importar, se sustituirá el plan. Tu historial se conserva.' : 'La rutina actual se conserva.'}</p>`, 'Añadir a mis datos', () => {
      if (commit(() => { state = result.state; })) { $('#app-dialog').close(); selectedExercise = null; renderPage(); toast('Datos importados. Tu historial se ha conservado.'); }
    });
    if (incoming.sessions.length || incoming.legacyProgress.length) {
      const view = document.createElement('button'); view.className = 'btn secondary'; view.textContent = 'Ver sin mezclar';
      view.addEventListener('click', () => { reviewState = incoming; selectedExercise = null; $('#app-dialog').close(); navigate('progress'); });
      $('#dialog-footer').prepend(view);
    }
  } catch (error) { toast(error.message || 'El archivo no contiene datos válidos de entrenamiento.', true); }
}
function openShare(session, type = 'session') {
  sharedSession = session;
  sharePhoto = null;
  $('#share-photo').value = '';
  $('#share-photo-status').textContent = 'La foto se procesa en tu dispositivo.';
  $('#share-type').value = type; $('#share-style').value = 'transparent'; $('#share-format').value = 'sticker'; $('#share-theme').value = 'dark'; $('#share-handle').value = state.profile.handle || '';
  $('#share-status').textContent = 'Puedes colocar el PNG sobre una foto en tus historias.';
  $('#share-dialog').showModal(); updateShare();
}
function updateShare() {
  if (!sharedSession) return;
  const style = $('#share-style').value;
  if (style === 'photo' && !sharePhoto) {
    $('#share-status').textContent = 'Elige una foto para usar este fondo.';
  } else $('#share-status').textContent = style === 'transparent' ? 'PNG con transparencia real. Elige texto claro u oscuro según tu foto.' : 'La fecha y tu @usuario se incluyen en la imagen.';
  const options = { type: $('#share-type').value, style: style === 'photo' && !sharePhoto ? 'card' : style, theme: $('#share-theme').value, format: $('#share-format').value, session: sharedSession, summary: sessionSummary(sharedSession), profile: { ...state.profile, handle: $('#share-handle').value.trim() }, photo: sharePhoto, sessions: state.sessions, date: new Date(), brand: 'Repite' };
  $('.share-preview').dataset.previewTheme = options.theme;
  const revision = ++shareRevision;
  ['share-native', 'share-download', 'share-copy'].forEach(id => { $(`#${id}`).disabled = true; });
  shareRender = shareRender.catch(() => {}).then(() => renderShareCard($('#share-canvas'), options)).then(() => {
    if (revision === shareRevision) ['share-native', 'share-download', 'share-copy'].forEach(id => { $(`#${id}`).disabled = false; });
  }).catch(error => { $('#share-status').textContent = error.message || 'No se pudo crear la imagen.'; throw error; });
  shareRender.catch(() => {});
}
async function loadSharePhoto(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { $('#share-status').textContent = 'Elige una foto de menos de 25 MB.'; return; }
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image(); photo.src = url; await photo.decode(); sharePhoto = photo;
    $('#share-style').value = 'photo'; $('#share-photo-status').textContent = file.name; updateShare();
  } catch { $('#share-status').textContent = 'No se pudo abrir esta foto. Prueba una imagen JPEG o PNG.'; }
  finally { URL.revokeObjectURL(url); }
}

document.addEventListener('click', event => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) { selectedExercise = null; navigate(routeButton.dataset.route); return; }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  switch (action) {
    case 'select-day': {
      const changed = state.selectedDay !== Number(button.dataset.day);
      if (commit(s => { s.selectedDay = Number(button.dataset.day); })) { renderTrain(); if (changed) uiMotion.content($('.workout-layout')); } break;
    }
    case 'start-session': startSession(); break;
    case 'resume-session': commit(s => { s.selectedDay = s.activeSession.dayIndex; }); navigate('train'); break;
    case 'complete-set': completeSet(button); break;
    case 'add-set': {
      const ex = currentDay().exercises[Number(button.dataset.exerciseIndex)];
      const entry = state.activeSession?.exercises.find(e => e.exerciseId === ex.id);
      if (!entry) break;
      if (entry.sets.length >= 30) { toast('Puedes registrar hasta 30 series por ejercicio.', true); break; }
      if (commit(() => entry.sets.push({ weight: null, reps: null, done: false }))) renderTrain(); break;
    }
    case 'manual-rest': startRest(currentDay().exercises[Number(button.dataset.exerciseIndex)]); break;
    case 'remove-set': {
      const ex = currentDay().exercises[Number(button.dataset.exerciseIndex)];
      const entry = state.activeSession?.exercises.find(e => e.exerciseId === ex.id);
      if (!entry || entry.sets.length <= 1) break;
      if (entry.sets.at(-1).done) { toast('Desmarca la última serie antes de quitarla.'); break; }
      if (commit(() => entry.sets.pop())) renderTrain(); break;
    }
    case 'finish-session': finishSession(); break;
    case 'discard-session': showDialog('Sesión en curso', 'Descartar este entrenamiento', '<p>Se eliminarán las series de esta sesión que todavía no has guardado. Tu historial anterior se conserva.</p>', 'Descartar sesión', () => { if (commit(s => { s.activeSession = null; })) { $('#app-dialog').close(); stopRest(); renderTrain(); } }, true); break;
    case 'exercise-progress': selectedExercise = button.dataset.id; chartMetric = 'weight'; chartRange = 'all'; renderExerciseProgress(); window.scrollTo({ top: 0, behavior: 'instant' }); uiMotion.page($('#progress-page')); break;
    case 'progress-back': selectedExercise = null; renderProgress(); window.scrollTo({ top: 0, behavior: 'instant' }); uiMotion.page($('#progress-page'), -1); break;
    case 'chart-metric': chartMetric = button.dataset.value; renderExerciseProgress(); uiMotion.content($('.chart-panel')); break;
    case 'session-detail': showSession((reviewState || state).sessions.find(s => s.id === button.dataset.id)); break;
    case 'share-session': if (reviewState) toast('Vuelve a tus datos para compartir desde tu perfil.'); else openShare(state.sessions.find(s => s.id === button.dataset.id)); break;
    case 'end-review': reviewState = null; selectedExercise = null; renderPage(); break;
    case 'share-week': {
      const latest = [...state.sessions].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt))[0];
      if (!latest) toast('Guarda una sesión para compartir tu constancia.'); else openShare(latest, 'week'); break;
    }
    case 'add-day': dayEditor(); break;
    case 'edit-day': dayEditor(Number(button.dataset.day)); break;
    case 'add-exercise': exerciseEditor(Number(button.dataset.day)); break;
    case 'edit-exercise': exerciseEditor(Number(button.dataset.day), Number(button.dataset.index)); break;
    case 'delete-day': {
      const day = Number(button.dataset.day);
      showDialog('Mi rutina', 'Eliminar este día', `<p>Se eliminará «${esc(state.routine.days[day].title)}» del plan. Los entrenamientos ya guardados se conservan.</p>`, 'Eliminar día', () => { if (commit(s => { s.routine.days.splice(day, 1); s.selectedDay = Math.min(s.selectedDay, s.routine.days.length - 1); })) { $('#app-dialog').close(); renderRoutine(); } }, true); break;
    }
    case 'delete-exercise': {
      const day = Number(button.dataset.day), index = Number(button.dataset.index);
      showDialog('Mi rutina', 'Eliminar este ejercicio', '<p>Se quitará del plan. Sus registros anteriores se conservarán.</p>', 'Eliminar ejercicio', () => { if (commit(s => s.routine.days[day].exercises.splice(index, 1))) { $('#app-dialog').close(); renderRoutine(); } }, true); break;
    }
    case 'rename-routine': if (canEditRoutine()) showDialog('Mi rutina', 'Nombre de tu plan', `<label class="field">Nombre<input id="routine-name" maxlength="100" value="${esc(state.routine.name || 'Mi rutina')}"></label>`, 'Guardar nombre', () => { const name = $('#routine-name').value.trim(); if (!name) return; if (commit(s => { s.routine.name = name; })) { $('#app-dialog').close(); renderRoutine(); } }); break;
    case 'routine-templates': chooseTemplate(); break;
    case 'preview-template': previewTemplate(button.dataset.template, Number(button.dataset.days)); break;
    case 'clear-history': confirmClearHistory(); break;
    case 'blank-routine': replaceRoutine({ name: 'Mi nueva rutina', days: [{ title: 'Día 1', exercises: [] }] }); break;
    case 'original-routine': replaceRoutine({ ...structuredClone(defaultRoutineData), name: 'Plan original · Fuerza e hipertrofia' }); break;
    case 'export': downloadJSON(button.dataset.kind); break;
    case 'export-recovery': {
      if (!storageRecovery?.raw) break;
      const url = URL.createObjectURL(new Blob([storageRecovery.raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `repite-recuperacion-${localDate()}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
    case 'import': $('#import-file').click(); break;
    case 'theme': setTheme(button.dataset.value); break;
    case 'close-dialog': $('#app-dialog').close(); break;
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.matches('[data-field]') && isCurrentActive()) {
    const ex = currentDay().exercises[Number(input.closest('[data-exercise-index]').dataset.exerciseIndex)];
    const rowIndex = Number(input.closest('[data-set-index]').dataset.setIndex);
    const value = input.value === '' ? null : Number(input.value);
    const valid = value === null || (Number.isFinite(value) && (input.dataset.field === 'weight' ? value >= 0 && value <= 5000 : Number.isInteger(value) && value >= 1 && value <= 500));
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) return;
    commit(s => { s.activeSession.exercises.find(e => e.exerciseId === ex.id).sets[rowIndex][input.dataset.field] = Number.isFinite(value) ? value : null; });
  }
  if (input.id === 'session-notes') commit(s => { if (isCurrentActive()) s.activeSession.notes = input.value; else s.notes = input.value; });
  if (input.id === 'share-handle') updateShare();
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'plan-week') { if (commit(s => { s.week = Number(input.value); })) renderTrain(); }
  if (input.id === 'chart-range') { chartRange = input.value; renderExerciseProgress(); }
  if (['share-type', 'share-style', 'share-format', 'share-theme'].includes(input.id)) updateShare();
  if (input.id === 'share-photo') loadSharePhoto(input.files[0]);
  if (input.id === 'import-file') { previewImport(input.files[0]); input.value = ''; }
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'profile-form') return;
  event.preventDefault();
  const form = new FormData(event.target);
  const displayName = String(form.get('displayName')).trim();
  const rawHandle = String(form.get('handle')).trim().replace(/^@+/, '');
  if (commit(s => { s.profile = { displayName, handle: rawHandle ? `@${rawHandle}` : '' }; })) { renderSettings(); toast('Perfil guardado. Tu @usuario se usará al compartir.'); }
});
$('#dialog-close').addEventListener('click', () => $('#app-dialog').close());
$('#dialog-footer').addEventListener('click', event => { if (event.target.closest('#dialog-confirm')) dialogAction?.(); });
$('#app-dialog').addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.matches('input') && dialogAction) { event.preventDefault(); dialogAction(); } });
$('#share-close').addEventListener('click', () => $('#share-dialog').close());
$('#theme-toggle').addEventListener('click', () => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
$('#timer-skip').innerHTML = icon('close');
$('#dialog-close').innerHTML = icon('close'); $('#share-close').innerHTML = icon('close');
$('#timer-skip').addEventListener('click', stopRest);
$('#timer-add').addEventListener('click', () => { if (!state.activeSession?.restEndsAt) return; restTotal += 30; commit(s => { s.activeSession.restEndsAt = new Date(new Date(s.activeSession.restEndsAt).getTime() + 30000).toISOString(); }); tick(); });
for (const [id, action] of [['share-download', downloadCanvas], ['share-copy', copyCanvas], ['share-native', shareCanvas]]) {
  $(`#${id}`).addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      // The PNG is prepared before buttons enable; call the browser API in this gesture.
      const pending = action($('#share-canvas'), `repite-${localDate(new Date(sharedSession.finishedAt))}.png`);
      const result = await pending;
      $('#share-status').textContent = id === 'share-copy' ? 'PNG copiado. Puedes pegarlo sobre una foto.' : result === 'downloaded' ? 'PNG guardado. Usa el menú de compartir de tu iPhone para enviarlo.' : id === 'share-download' ? 'PNG guardado con el fondo que has elegido.' : 'Imagen compartida.';
      const handle = $('#share-handle').value.trim().replace(/^@+/, '');
      commit(s => { s.profile.handle = handle ? `@${handle}` : ''; });
    } catch (error) { $('#share-status').textContent = error.name === 'AbortError' ? 'Puedes compartir la imagen cuando quieras.' : error.message || 'No se pudo compartir. Prueba Guardar PNG.'; }
    finally { button.disabled = false; }
  });
}
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
let storedTheme = 'dark';
try { storedTheme = localStorage.getItem('repite-theme') || 'dark'; } catch {}
setTheme(storedTheme === 'light' ? 'light' : 'dark', false);
state.selectedDay = Math.max(0, Math.min(state.selectedDay, state.routine.days.length - 1));
if (state.activeSession?.restEndsAt) restTotal = Math.max(90, Math.ceil((new Date(state.activeSession.restEndsAt) - Date.now()) / 1000));
navigate('train', false); tick(); setInterval(tick, 1000);
document.addEventListener('visibilitychange', tick);
if (warnings.length) setTimeout(() => toast(warnings.join(' ')), 500);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
