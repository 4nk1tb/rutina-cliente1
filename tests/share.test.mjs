import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../share.js', import.meta.url), 'utf8');
const { renderShareCard, canvasBlob, copyCanvas, shareCanvas } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function canvasStub() {
  const calls = [];
  const fonts = [];
  const ctx = {
    font: '600 30px Arial',
    measureText(value) {
      const size = Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 30);
      return { width: [...String(value)].length * size * 0.52 };
    },
    fillText(value, x, y) { calls.push({ kind: 'text', value: String(value), x, y }); },
    fillRect(...args) { calls.push({ kind: 'background', args }); },
    drawImage(...args) { calls.push({ kind: 'photo', args }); },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  let currentFont = ctx.font;
  Object.defineProperty(ctx, 'font', {
    get() { return currentFont; },
    set(value) { currentFont = value; fonts.push(value); },
  });
  ctx.fill = () => calls.push({ kind: 'shape', color: ctx.fillStyle });
  for (const method of ['save', 'restore', 'clearRect', 'beginPath', 'roundRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'arc', 'stroke', 'clip']) ctx[method] = () => {};
  let encodes = 0;
  const canvas = {
    width: 0, height: 0, calls, fonts,
    getContext() { return ctx; },
    toBlob(callback, type) { encodes += 1; queueMicrotask(() => callback(new Blob(['PNG'], { type }))); },
    get encodes() { return encodes; },
  };
  return canvas;
}

const finishedAt = new Date(2026, 9, 3, 18).toISOString();
const startedAt = new Date(2026, 9, 3, 16, 43).toISOString();
const session = {
  id: 'session-1', title: 'Pierna y glúteo', finishedAt, startedAt,
  exercises: [
    { exerciseId: 'hip', name: 'Empuje de caderas (barra)', sets: [{ weight: 90, reps: 10, done: true }, { weight: 100, reps: 8, done: true }] },
    { exerciseId: 'leg', name: 'Press de piernas', sets: [{ weight: 240, reps: 10, done: true }, { weight: 999, reps: 10, done: false }] },
  ],
};

const texts = (canvas) => canvas.calls.filter((call) => call.kind === 'text').map((call) => call.value);

test('transparent sticker uses session date, completed sets and actual volume', async () => {
  const canvas = canvasStub();
  await renderShareCard(canvas, { session, date: new Date(2027, 1, 7), profile: { handle: '@yanki' } });
  assert.equal(canvas.width, 1080);
  assert.ok(canvas.height >= 630 && canvas.height <= 1000);
  assert.equal(canvas.calls.filter((call) => call.kind === 'background').length, 0);
  assert.ok(texts(canvas).includes('3 de octubre de 2026'));
  assert.ok(texts(canvas).includes('4100 kg'));
  assert.ok(texts(canvas).includes('1 h 17 min'));
  assert.ok(texts(canvas).includes('2×'));
  assert.ok(texts(canvas).includes('@yanki'));
  assert.equal(canvas.encodes, 1);
  assert.equal((await canvasBlob(canvas)).type, 'image/png');
  assert.equal(canvas.encodes, 1, 'reuse the prepared PNG for the share gesture');
});

test('sticker height includes a full six-exercise list and footer', async () => {
  const canvas = canvasStub();
  const exercises = Array.from({ length: 6 }, (_, index) => ({ name: `Ejercicio ${index + 1}`, sets: [{ weight: 10, reps: 10, done: true }] }));
  await renderShareCard(canvas, { session: { ...session, exercises } });
  assert.ok(texts(canvas).includes('Ejercicio 6'));
  assert.ok(!texts(canvas).some((value) => value.includes('ejercicios más')));
  const last = canvas.calls.find((call) => call.value === 'Ejercicio 6');
  assert.ok(last.y < canvas.height - 174);
});

test('best session weight is labelled honestly when there are no historical records', async () => {
  const canvas = canvasStub();
  await renderShareCard(canvas, { type: 'record', session });
  assert.ok(texts(canvas).includes('240 kg'));
  assert.ok(texts(canvas).includes('Press de piernas'));
  assert.ok(texts(canvas).includes('Mejor carga de la sesión'));
  assert.ok(!texts(canvas).includes('Nuevo récord de carga'));
});

test('estimated records carry an approximation and explanatory label', async () => {
  const canvas = canvasStub();
  await renderShareCard(canvas, { type: 'record', session, summary: { records: [{ type: 'estimatedRM', name: 'Press banca', weight: 80, estimatedRM: 101.3 }] } });
  assert.ok(texts(canvas).includes('≈ 101,3 kg'));
  assert.ok(texts(canvas).includes('Récord de 1RM estimado'));
  assert.ok(texts(canvas).includes('Estimación a partir de tus series, no un máximo probado.'));
});

test('per-dumbbell load doubles volume while labels retain the single-dumbbell weight', async () => {
  const dumbbells = {
    ...session,
    exercises: [{ name: 'Press con mancuernas', weightMode: 'perDumbbell', sets: [{ weight: 20, reps: 10, done: true }] }],
  };
  const canvas = canvasStub();
  await renderShareCard(canvas, { session: dumbbells });
  assert.ok(texts(canvas).includes('400 kg'));
  const mark = canvasStub();
  await renderShareCard(mark, { type: 'record', session: dumbbells });
  assert.ok(texts(mark).includes('20 kg/mancuerna'));
  assert.ok(texts(mark).includes('Mejor carga de la sesión'));
  const record = canvasStub();
  await renderShareCard(record, {
    type: 'record', session: dumbbells,
    summary: { records: [{ name: 'Press con mancuernas', weightMode: 'perDumbbell', weight: 20, estimatedRM: 26.7, type: 'estimatedRM' }] },
  });
  assert.ok(texts(record).includes('≈ 26,7 kg/mancuerna'));
  const week = canvasStub();
  await renderShareCard(week, { type: 'week', sessions: [dumbbells], date: new Date(2026, 9, 3) });
  assert.ok(texts(week).includes('400 kg'));
});

test('week counts real local dates once while counting separate sessions', async () => {
  const canvas = canvasStub();
  const sameDay = { ...session, id: 'second', finishedAt: new Date(2026, 9, 3, 22).toISOString() };
  const earlier = { ...session, id: 'earlier', finishedAt: new Date(2026, 8, 27, 0, 5).toISOString() };
  const outside = { ...session, id: 'outside', finishedAt: new Date(2026, 8, 26, 23, 59).toISOString() };
  const future = { ...session, id: 'future', finishedAt: new Date(2026, 9, 4, 0, 1).toISOString() };
  await renderShareCard(canvas, {
    type: 'week', date: new Date(2026, 9, 3, 12), sessions: [session, sameDay, earlier, outside, future, { ...session, id: 'unfinished', finishedAt: null }, session],
  });
  const output = texts(canvas);
  assert.ok(output.includes('días entrenados'));
  assert.ok(output.includes('2'));
  assert.ok(output.includes('3'));
  assert.ok(output.includes('12.300 kg'));
  assert.ok(output.includes('27 sept – 3 oct 2026'));
});

test('square and story use fixed dimensions; photo cover remains local', async () => {
  const canvas = canvasStub();
  await renderShareCard(canvas, { session, format: 'square', style: 'card' });
  assert.equal(canvas.height, 1080);
  assert.ok(canvas.calls.some((call) => call.kind === 'background'));
  const photo = { naturalWidth: 500, naturalHeight: 1000 };
  await renderShareCard(canvas, { session, format: 'story', style: 'photo', photo });
  assert.equal(canvas.height, 1920);
  assert.ok(canvas.calls.some((call) => call.kind === 'photo' && call.args[0] === photo));
});

test('weekly body diagrams highlight only groups from completed series', async () => {
  const reference = new Date(2026, 9, 3, 12);
  const noGroups = canvasStub();
  await renderShareCard(noGroups, { type: 'week', sessions: [session], date: reference });
  const trained = canvasStub();
  const grouped = {
    ...session,
    exercises: [
      { ...session.exercises[0], muscleGroup: 'pecho' },
      { ...session.exercises[1], muscleGroup: 'hombros' },
      { name: 'Ejercicio sin completar', muscleGroup: 'espalda', sets: [{ done: false, weight: 20, reps: 10 }] },
    ],
  };
  await renderShareCard(trained, { type: 'week', sessions: [grouped], date: reference });
  const accents = (canvas) => canvas.calls.filter((call) => call.kind === 'shape' && call.color === '#edc563').length;
  assert.equal(accents(trained) - accents(noGroups), 6, 'two pectorals and four shoulder regions; no unfinished back exercise');
  assert.ok(texts(noGroups).includes('Frontal'));
  assert.ok(texts(noGroups).includes('Posterior'));
  assert.ok(texts(noGroups).join(' ').includes('Añade el grupo muscular a tus ejercicios para resaltarlo aquí.'));
  assert.ok(!trained.calls.some((call) => call.kind === 'background'), 'diagrams preserve transparent alpha');
  assert.equal(trained.height, 1230);
  assert.ok(trained.calls.filter((call) => call.kind === 'text').every((call) => call.y < trained.height));
});

test('square weekly diagrams, calendar and metrics fit above the footer', async () => {
  const canvas = canvasStub();
  await renderShareCard(canvas, { type: 'week', format: 'square', sessions: [session], date: new Date(2026, 9, 3) });
  assert.equal(canvas.height, 1080);
  const duration = canvas.calls.find((call) => call.value === 'Duración');
  assert.ok(duration.y + 90 < canvas.height - 98, 'keep metrics clear of the footer divider');
  assert.ok(canvas.calls.filter((call) => call.kind === 'text').every((call) => call.y < canvas.height));
});

test('all share layouts use portable standard font weights', async () => {
  const canvas = canvasStub();
  for (const type of ['session', 'record', 'week']) {
    await renderShareCard(canvas, { type, session, sessions: [session], date: new Date(2026, 9, 3) });
  }
  assert.ok(canvas.fonts.length > 30);
  assert.ok(canvas.fonts.every((value) => /^[4-7]00 \d+px /.test(value)), 'native Canvas must not interpret arbitrary weights as font sizes');
});

test('clipboard writes the PNG promise before awaiting image encoding', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalItem = globalThis.ClipboardItem;
  let written = null;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { write: async (items) => { written = items; } } } });
  globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
  try {
    const canvas = canvasStub();
    const copying = copyCanvas(canvas);
    assert.ok(written, 'invoke clipboard.write synchronously from the button gesture');
    await copying;
    assert.ok(written[0].data['image/png'] instanceof Promise);
    assert.equal((await written[0].data['image/png']).type, 'image/png');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalItem) globalThis.ClipboardItem = originalItem;
    else delete globalThis.ClipboardItem;
  }
});

test('prepared PNG invokes native share synchronously from the click gesture', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let shared = null;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { canShare: () => true, share: async (data) => { shared = data; } } });
  try {
    const canvas = canvasStub();
    await renderShareCard(canvas, { session });
    const sharing = shareCanvas(canvas, 'mi-entreno.png');
    assert.ok(shared, 'do not await any promise before navigator.share');
    assert.equal(shared.files[0].name, 'mi-entreno.png');
    assert.equal(shared.files[0].type, 'image/png');
    assert.equal(await sharing, 'shared');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});

test('native share cancellation is propagated without initiating a download', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const abort = Object.assign(new Error('Cancelado'), { name: 'AbortError' });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { canShare: () => true, share: async () => { throw abort; } } });
  try {
    const canvas = canvasStub();
    await renderShareCard(canvas, { session });
    await assert.rejects(shareCanvas(canvas), (error) => error === abort);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
