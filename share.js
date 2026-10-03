/* Local PNG exports. Photos and training data never leave the device here. */
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
const WIDTH = 1080;
const PAD = 72;
const INNER = WIDTH - PAD * 2;
const preparedImages = new WeakMap();
const BODY_GROUPS = new Set(['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps', 'isquios', 'gluteos', 'gemelos', 'core']);

const positive = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const number = (value, decimals = 0) => positive(value).toLocaleString('es-ES', {
  maximumFractionDigits: decimals,
});
const textValue = (value, fallback = '') => String(value ?? fallback).trim();

function validDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dateLabel(date) {
  return date ? new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(date) : 'Fecha sin registrar';
}

function durationLabel(seconds) {
  const minutes = Math.floor(positive(seconds) / 60);
  if (minutes < 1) return seconds > 0 ? '< 1 min' : '0 min';
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

function sessionData(session = {}, supplied = {}) {
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];
  const completed = exercises.map((exercise) => ({
    ...exercise,
    name: textValue(exercise.name, 'Ejercicio'),
    sets: (Array.isArray(exercise.sets) ? exercise.sets : []).filter((set) => set.done === true),
  })).filter((exercise) => exercise.sets.length);
  const actualVolume = completed.reduce((sum, exercise) => sum + exercise.sets.reduce(
    (subtotal, set) => subtotal + positive(set.weight) * positive(set.reps) * (exercise.weightMode === 'perDumbbell' ? 2 : 1), 0,
  ), 0);
  const started = validDate(session.startedAt);
  const finished = validDate(session.finishedAt);
  const actualDuration = started && finished ? Math.max(0, (finished - started) / 1000) : 0;
  const records = (Array.isArray(supplied.records) ? supplied.records : []).filter((record) => record && (
    record.type === 'estimatedRM' ? positive(record.estimatedRM) > 0 : positive(record.weight) > 0
  ));
  return {
    completed,
    volume: supplied.volume == null ? actualVolume : positive(supplied.volume),
    sets: supplied.sets == null ? completed.reduce((sum, exercise) => sum + exercise.sets.length, 0) : positive(supplied.sets),
    duration: supplied.durationSeconds == null ? actualDuration : positive(supplied.durationSeconds),
    recordCount: supplied.recordCount == null ? records.length : positive(supplied.recordCount),
    records,
    date: finished || started,
  };
}

function weekData(sessions, reference) {
  const end = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + 1);
  const days = Array.from({ length: 7 }, (_, index) => new Date(
    reference.getFullYear(), reference.getMonth(), reference.getDate() - 6 + index,
  ));
  const trainedDates = new Set();
  let count = 0;
  let volume = 0;
  let duration = 0;
  const groups = new Set();
  let missingGroups = 0;
  const seenSessions = new Set();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const finished = validDate(session?.finishedAt);
    if (!finished || finished < days[0] || finished >= end) continue;
    if (session.id && seenSessions.has(session.id)) continue;
    if (session.id) seenSessions.add(session.id);
    trainedDates.add(dayKey(finished));
    const summary = sessionData(session);
    for (const exercise of summary.completed) {
      const group = textValue(exercise.muscleGroup).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (BODY_GROUPS.has(group)) groups.add(group);
      else missingGroups += 1;
    }
    volume += summary.volume;
    duration += summary.duration;
    count += 1;
  }
  const short = (date) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date);
  const crossesYear = days[0].getFullYear() !== reference.getFullYear();
  const period = `${short(days[0])}${crossesYear ? ` ${days[0].getFullYear()}` : ''} – ${short(reference)} ${reference.getFullYear()}`;
  return { days, trainedDates, count, volume, duration, period, groups, missingGroups };
}

function font(ctx, size, weight = 600) {
  // Standard font weights also parse reliably in native Canvas PNG renderers.
  // Some engines interpret arbitrary weights such as 750 as a font size.
  const standardWeight = weight >= 700 ? 700 : weight >= 600 ? 600 : weight >= 500 ? 500 : 400;
  ctx.font = `${standardWeight} ${size}px ${FONT}`;
}

function linesFor(ctx, value, maxWidth) {
  const paragraphs = textValue(value).split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // Even an unusually long exercise name or handle must stay inside the image.
      for (const character of Array.from(word)) {
        if (line && ctx.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = character;
        } else line += character;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function headingLayout(ctx, value, size, maxLines = 3) {
  let lines;
  do {
    font(ctx, size, 750);
    lines = linesFor(ctx, value, INNER);
    if (lines.length <= maxLines || size <= 40) break;
    size -= 2;
  } while (size > 0);
  return { lines, size, height: lines.length * size * 1.1 };
}

function writeLines(ctx, lines, x, y, size, color, weight = 600, leading = 1.18) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += size * leading;
  }
  return y;
}

function fittedText(ctx, value, x, y, maxWidth, size, color, weight = 600, minimum = 20) {
  font(ctx, size, weight);
  while (size > minimum && ctx.measureText(value).width > maxWidth) {
    size -= 1;
    font(ctx, size, weight);
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y, maxWidth);
}

function trackedText(ctx, value, x, y, color, size = 20, tracking = 2.2) {
  font(ctx, size, 700);
  ctx.fillStyle = color;
  for (const character of Array.from(value)) {
    ctx.fillText(character, x, y);
    x += ctx.measureText(character).width + tracking;
  }
}

function roundedPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function paintBackground(ctx, width, height, style, colors, photo) {
  if (style === 'transparent') return;
  ctx.save();
  roundedPath(ctx, 0, 0, width, height, 56);
  ctx.clip();
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);
  if (style === 'photo' && photo) {
    const photoWidth = photo.naturalWidth || photo.width;
    const photoHeight = photo.naturalHeight || photo.height;
    if (!photoWidth || !photoHeight) throw new Error('La foto todavía no está lista. Vuelve a seleccionarla.');
    const scale = Math.max(width / photoWidth, height / photoHeight);
    ctx.drawImage(photo, (width - photoWidth * scale) / 2, (height - photoHeight * scale) / 2, photoWidth * scale, photoHeight * scale);
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, 'rgba(12, 14, 12, 0.36)');
    shade.addColorStop(0.48, 'rgba(12, 14, 12, 0.57)');
    shade.addColorStop(1, 'rgba(12, 14, 12, 0.86)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function divider(ctx, y, colors) {
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(WIDTH - PAD, y);
  ctx.stroke();
  ctx.restore();
}

function drawMetrics(ctx, metrics, y, colors) {
  const gap = 34;
  const column = (INNER - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = PAD + index * (column + gap);
    fittedText(ctx, label, x, y, column, 25, colors.muted, 500);
    fittedText(ctx, value, x, y + 42, column, 46, colors.ink, 750, 28);
  });
  return y + 100;
}

function drawFooter(ctx, height, profile, brand, colors) {
  const y = height - 68;
  divider(ctx, y - 30, colors);
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  // Two returning strokes form a small, original repetition mark.
  ctx.beginPath();
  ctx.moveTo(PAD + 2, y + 9);
  ctx.lineTo(PAD + 2, y + 25);
  ctx.quadraticCurveTo(PAD + 2, y + 36, PAD + 13, y + 36);
  ctx.lineTo(PAD + 29, y + 36);
  ctx.lineTo(PAD + 22, y + 29);
  ctx.moveTo(PAD + 32, y + 30);
  ctx.lineTo(PAD + 32, y + 14);
  ctx.quadraticCurveTo(PAD + 32, y + 3, PAD + 21, y + 3);
  ctx.lineTo(PAD + 6, y + 3);
  ctx.lineTo(PAD + 13, y + 10);
  ctx.stroke();
  ctx.restore();
  fittedText(ctx, brand, PAD + 50, y, 330, 37, colors.ink, 700);
  const handle = textValue(profile.handle).replace(/^@+/, '');
  const credit = handle ? `@${handle}` : textValue(profile.displayName);
  if (credit) {
    ctx.save();
    ctx.textAlign = 'right';
    fittedText(ctx, credit, WIDTH - PAD, y + 5, INNER - 410, 30, colors.ink, 500, 19);
    ctx.restore();
  }
}

function exerciseLayouts(ctx, completed, size = 34) {
  font(ctx, size, 550);
  return completed.map((exercise) => {
    const lines = linesFor(ctx, exercise.name, INNER - 112);
    return { exercise, lines, size, height: Math.max(size * 1.18, lines.length * size * 1.18) + 21 };
  });
}

function drawSession(ctx, session, summary, options, colors, height, offset) {
  const title = headingLayout(ctx, textValue(session.title, 'Mi entrenamiento'), 68);
  let y = offset;
  trackedText(ctx, 'ENTRENAMIENTO COMPLETADO', PAD, y, colors.accent);
  y += 46;
  y = writeLines(ctx, title.lines, PAD, y, title.size, colors.ink, 750, 1.1);
  y += 16;
  fittedText(ctx, dateLabel(summary.date), PAD, y, INNER, 28, colors.muted, 500);
  y += 67;
  y = drawMetrics(ctx, [
    ['Duración', durationLabel(summary.duration)],
    ['Volumen', `${number(summary.volume)} kg`],
    ['Récords', number(summary.recordCount)],
  ], y, colors);
  divider(ctx, y, colors);
  y += 31;
  trackedText(ctx, `${number(summary.sets)} SERIES · ${summary.completed.length} EJERCICIOS`, PAD, y, colors.muted, 18, 1.6);
  y += 47;
  const layouts = exerciseLayouts(ctx, summary.completed, options.format === 'square' ? 32 : 34);
  const bottom = height - 174;
  let rendered = 0;
  for (const row of layouts) {
    const moreSpace = rendered < layouts.length - 1 ? 44 : 0;
    if (y + row.height + moreSpace > bottom) break;
    fittedText(ctx, `${row.exercise.sets.length}×`, PAD, y, 90, 35, colors.accent, 750);
    writeLines(ctx, row.lines, PAD + 112, y + 1, row.size, colors.ink, 550);
    y += row.height;
    rendered += 1;
  }
  if (rendered < layouts.length) {
    fittedText(ctx, `… y ${layouts.length - rendered} ${layouts.length - rendered === 1 ? 'ejercicio más' : 'ejercicios más'}`, PAD, y + 4, INNER, 28, colors.muted, 500);
  } else if (!layouts.length) {
    fittedText(ctx, 'No hay series completadas en esta sesión.', PAD, y, INNER, 29, colors.muted, 500);
  }
}

function chooseRecord(summary) {
  if (summary.records.length) {
    const records = [...summary.records].sort((a, b) => {
      const value = (record) => record.type === 'estimatedRM' ? positive(record.estimatedRM) : positive(record.weight);
      return value(b) - value(a);
    });
    const record = records[0];
    const estimated = record.type === 'estimatedRM';
    return {
      name: textValue(record.name, 'Mi ejercicio'),
      value: estimated ? positive(record.estimatedRM) : positive(record.weight),
      caption: estimated ? 'Récord de 1RM estimado' : 'Nuevo récord de carga',
      estimated, isRecord: true, weightMode: record.weightMode,
    };
  }
  let best = null;
  for (const exercise of summary.completed) {
    for (const set of exercise.sets) {
      if (positive(set.reps) > 0 && positive(set.weight) > 0 && (!best || positive(set.weight) > best.value)) {
        best = { name: exercise.name, value: positive(set.weight), reps: positive(set.reps), weightMode: exercise.weightMode };
      }
    }
  }
  return best ? { ...best, caption: 'Mejor carga de la sesión', isRecord: false, estimated: false } : {
    name: 'Sin carga registrada', value: 0, caption: 'Completa una serie con peso para compartir tu marca.',
    isRecord: false, estimated: false,
  };
}

function drawRecordBadge(ctx, x, y, colors, isRecord) {
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(x + 42, y + 42, 42, 0, Math.PI * 2);
  ctx.fill();
  if (isRecord) {
    ctx.beginPath();
    ctx.moveTo(x + 19, y + 76);
    ctx.lineTo(x + 6, y + 111);
    ctx.lineTo(x + 28, y + 104);
    ctx.lineTo(x + 39, y + 117);
    ctx.lineTo(x + 47, y + 81);
    ctx.moveTo(x + 49, y + 81);
    ctx.lineTo(x + 61, y + 115);
    ctx.lineTo(x + 71, y + 101);
    ctx.lineTo(x + 92, y + 105);
    ctx.lineTo(x + 69, y + 75);
    ctx.fill();
  }
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 42);
  ctx.lineTo(x + 37, y + 55);
  ctx.lineTo(x + 60, y + 31);
  ctx.stroke();
  ctx.restore();
}

function drawRecord(ctx, summary, colors, height, offset) {
  const record = chooseRecord(summary);
  let y = offset;
  trackedText(ctx, record.isRecord ? 'MARCA PERSONAL' : 'MI ENTRENAMIENTO', PAD, y, colors.accent);
  y += 59;
  drawRecordBadge(ctx, PAD, y, colors, record.isRecord);
  y += 142;
  const unit = record.weightMode === 'perDumbbell' ? 'kg/mancuerna' : 'kg';
  fittedText(ctx, record.value ? `${record.estimated ? '≈ ' : ''}${number(record.value, 1)} ${unit}` : '—', PAD - 5, y, INNER, 146, colors.ink, 750, 86);
  y += 167;
  const title = headingLayout(ctx, record.name, 54, 3);
  y = writeLines(ctx, title.lines, PAD, y, title.size, colors.ink, 650, 1.12);
  y += 22;
  const caption = linesForWithFont(ctx, record.caption, INNER, 30);
  y = writeLines(ctx, caption, PAD, y, 30, colors.muted, 500);
  if (record.reps) {
    y += 14;
    fittedText(ctx, `${number(record.reps)} repeticiones`, PAD, y, INNER, 27, colors.muted, 500);
    y += 33;
  }
  y += 27;
  fittedText(ctx, dateLabel(summary.date), PAD, y, INNER, 27, colors.muted, 500);
  if (record.estimated) {
    y += 45;
    fittedText(ctx, 'Estimación a partir de tus series, no un máximo probado.', PAD, y, INNER, 24, colors.muted, 500);
  }
  if (y + 175 < height - 175) {
    y += 72;
    divider(ctx, y - 25, colors);
    drawMetrics(ctx, [['Duración', durationLabel(summary.duration)], ['Series', number(summary.sets)]], y, colors);
  }
}

function linesForWithFont(ctx, value, width, size, weight = 500) {
  font(ctx, size, weight);
  return linesFor(ctx, value, width);
}

function drawBody(ctx, centerX, top, height, view, groups, colors) {
  const scale = height / 360;
  const origin = centerX - 72 * scale;
  const point = ([x, y]) => [origin + x * scale, top + y * scale];
  const mirror = (points) => points.map(([x, y]) => [144 - x, y]);
  const shape = (points, fill, outline = false) => {
    ctx.beginPath();
    const last = point(points[points.length - 1]);
    const first = point(points[0]);
    ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
    points.forEach((value, index) => {
      const current = point(value);
      const next = point(points[(index + 1) % points.length]);
      ctx.quadraticCurveTo(current[0], current[1], (current[0] + next[0]) / 2, (current[1] + next[1]) / 2);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = 1.1 * scale;
      ctx.strokeStyle = colors.bodyOutline;
      ctx.stroke();
    }
  };
  const pair = (points, fill, outline = false) => {
    shape(points, fill, outline);
    shape(mirror(points), fill, outline);
  };
  const muscle = (group) => groups.has(group) ? colors.accent : colors.bodyDetail;
  ctx.save();
  ctx.shadowColor = 'transparent';
  // A deliberately schematic figure, built from original rounded paths.
  ctx.beginPath();
  ctx.arc(centerX, top + 23 * scale, 19 * scale, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  shape([[64, 40], [80, 40], [83, 66], [61, 66]], colors.body);
  pair([[43, 62], [31, 66], [25, 93], [20, 123], [14, 142], [11, 173], [14, 187], [21, 176], [27, 144], [36, 118], [43, 91]], colors.body, true);
  pair([[45, 174], [71, 176], [69, 215], [65, 250], [60, 282], [57, 323], [62, 344], [40, 349], [37, 341], [42, 322], [42, 285], [36, 253], [34, 220]], colors.body, true);
  shape([[42, 60], [59, 57], [85, 57], [102, 60], [100, 109], [93, 152], [100, 180], [93, 199], [75, 193], [69, 193], [51, 199], [44, 180], [51, 152], [44, 109]], colors.body, true);
  const shoulder = [[40, 62], [49, 67], [48, 81], [39, 94], [29, 93], [31, 75]];
  pair(shoulder, muscle('hombros'));
  if (view === 'front') {
    pair([[49, 76], [69, 79], [69, 99], [56, 105], [44, 99]], muscle('pecho'));
    pair([[28, 100], [38, 98], [34, 119], [26, 135], [21, 134], [23, 116]], muscle('biceps'));
    for (let row = 0; row < 3; row += 1) {
      pair([[58, 112 + row * 15], [70, 111 + row * 15], [70, 124 + row * 15], [58, 125 + row * 15]], muscle('core'));
    }
    pair([[47, 113], [54, 111], [55, 154], [49, 162], [45, 139]], muscle('core'));
    pair([[44, 198], [62, 196], [64, 223], [59, 263], [47, 261], [40, 227]], muscle('cuadriceps'));
    pair([[47, 282], [58, 282], [56, 314], [48, 326], [45, 308]], muscle('gemelos'));
  } else {
    pair([[48, 77], [69, 75], [69, 117], [56, 154], [45, 126]], muscle('espalda'));
    pair([[27, 100], [38, 97], [34, 122], [25, 137], [21, 130]], muscle('triceps'));
    pair([[50, 163], [70, 165], [70, 195], [58, 207], [43, 196]], muscle('gluteos'));
    pair([[44, 210], [61, 207], [63, 231], [58, 264], [46, 261], [40, 233]], muscle('isquios'));
    pair([[47, 278], [59, 277], [57, 311], [49, 326], [43, 311]], muscle('gemelos'));
  }
  ctx.restore();
}

function drawWeek(ctx, data, colors, height, offset, format) {
  const compact = format === 'square';
  let y = offset;
  trackedText(ctx, 'ÚLTIMOS 7 DÍAS', PAD, y, colors.accent);
  y += compact ? 34 : 46;
  const title = headingLayout(ctx, 'Así se construye\nla constancia.', compact ? 48 : 64);
  y = writeLines(ctx, title.lines, PAD, y, title.size, colors.ink, 750, 1.1);
  y += compact ? 12 : 18;
  fittedText(ctx, data.period, PAD, y, INNER, compact ? 24 : 27, colors.muted, 500);
  y += compact ? 44 : 56;
  fittedText(ctx, String(data.trainedDates.size), PAD - 5, y, 155, compact ? 86 : 108, colors.accent, 750);
  font(ctx, compact ? 30 : 34, 550);
  ctx.fillStyle = colors.ink;
  ctx.fillText(data.trainedDates.size === 1 ? 'día entrenado' : 'días entrenados', PAD + 126, y + (compact ? 25 : 34));
  font(ctx, compact ? 22 : 25, 500);
  ctx.fillStyle = colors.muted;
  ctx.fillText('Cada sesión suma.', PAD + 128, y + (compact ? 65 : 79));
  y += compact ? 106 : 138;
  trackedText(ctx, 'GRUPOS ENTRENADOS', PAD, y, colors.muted, 18, 1.6);
  y += compact ? 29 : 32;
  const bodyHeight = compact ? 160 : 190;
  const bodyLeft = PAD + INNER * 0.38;
  const bodyRight = PAD + INNER * 0.62;
  drawBody(ctx, bodyLeft, y, bodyHeight, 'front', data.groups, colors);
  drawBody(ctx, bodyRight, y, bodyHeight, 'back', data.groups, colors);
  ctx.save();
  ctx.textAlign = 'center';
  font(ctx, compact ? 18 : 20, 500);
  ctx.fillStyle = colors.muted;
  ctx.fillText('Frontal', bodyLeft, y + bodyHeight + 8);
  ctx.fillText('Posterior', bodyRight, y + bodyHeight + 8);
  ctx.restore();
  y += bodyHeight + (compact ? 40 : 45);
  const explanation = !data.groups.size
    ? 'Añade el grupo muscular a tus ejercicios para resaltarlo aquí.'
    : data.missingGroups ? 'Los ejercicios sin grupo muscular no se resaltan.' : 'Zonas de las series completadas.';
  const explanationSize = compact ? 21 : 23;
  const explanationLines = linesForWithFont(ctx, explanation, INNER, explanationSize);
  y = writeLines(ctx, explanationLines, PAD, y, explanationSize, colors.muted, 500);
  y += compact ? 24 : 30;
  const step = INNER / 7;
  const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  data.days.forEach((date, index) => {
    const x = PAD + step * (index + 0.5);
    const trained = data.trainedDates.has(dayKey(date));
    ctx.save();
    ctx.textAlign = 'center';
    font(ctx, compact ? 22 : 24, 550);
    ctx.fillStyle = colors.muted;
    ctx.fillText(dayNames[date.getDay()], x, y);
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    const circleY = y + (compact ? 63 : 85);
    ctx.arc(x, circleY, compact ? 34 : 43, 0, Math.PI * 2);
    ctx.fillStyle = trained ? colors.accent : colors.empty;
    ctx.fill();
    if (trained) {
      ctx.strokeStyle = colors.background;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 15, circleY);
      ctx.lineTo(x - 4, circleY + 12);
      ctx.lineTo(x + 18, circleY - 12);
      ctx.stroke();
    } else {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    font(ctx, 22, 500);
    ctx.fillStyle = colors.muted;
    ctx.fillText(String(date.getDate()), x, y + (compact ? 119 : 149));
    ctx.restore();
  });
  y += compact ? 161 : 193;
  divider(ctx, y - 10, colors);
  drawMetrics(ctx, [
    ['Sesiones', number(data.count)],
    ['Volumen', `${number(data.volume)} kg`],
    ['Duración', durationLabel(data.duration)],
  ], y, colors);
  if (!data.trainedDates.size && y + 151 < height - 174) {
    fittedText(ctx, 'Todo empieza con una sesión.', PAD, y + 131, INNER, 26, colors.muted, 500);
  }
}

/**
 * Paint a share-ready PNG with no external fonts, assets, uploads or dependencies.
 * Dark transparent exports use light text; light transparent exports use dark text.
 * Story: 1080×1920. Square: 1080×1080. Sticker: 1080×content height.
 * Resolves after preparing the PNG, keeping the subsequent iPhone share gesture fast.
 */
export async function renderShareCard(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('No se pudo preparar la imagen.');
  preparedImages.delete(canvas);
  const type = ['session', 'record', 'week'].includes(options.type) ? options.type : 'session';
  const format = ['story', 'square', 'sticker'].includes(options.format) ? options.format : 'sticker';
  const requestedStyle = ['transparent', 'card', 'photo'].includes(options.style) ? options.style : 'transparent';
  const style = requestedStyle === 'photo' && !options.photo ? 'card' : requestedStyle;
  const light = options.theme === 'light' && style !== 'photo';
  const colors = light ? {
    ink: '#20211f', muted: '#5c5e56', accent: '#94701c', background: '#f3f0e7',
    line: 'rgba(32, 33, 31, 0.2)', empty: 'rgba(32, 33, 31, 0.07)',
    body: '#c3c5b9', bodyDetail: '#a5aa98', bodyOutline: '#969e8b',
  } : {
    ink: '#faf9f3', muted: '#c2c4b9', accent: '#edc563', background: '#20211f',
    line: 'rgba(250, 249, 243, 0.22)', empty: 'rgba(250, 249, 243, 0.09)',
    body: '#484e42', bodyDetail: '#757b6a', bodyOutline: '#8c9481',
  };
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite crear esta imagen. Prueba a actualizarlo.');
  const session = options.session || {};
  const summary = sessionData(session, options.summary || {});
  const reference = validDate(options.date) || new Date();
  const week = type === 'week' ? weekData(options.sessions, reference) : null;
  let contentHeight;
  if (type === 'session') {
    const title = headingLayout(ctx, textValue(session.title, 'Mi entrenamiento'), 68);
    const rows = exerciseLayouts(ctx, summary.completed);
    contentHeight = 550 + title.height + rows.slice(0, 9).reduce((sum, row) => sum + row.height, 0) + (rows.length > 9 ? 46 : 0);
    contentHeight = Math.max(630, Math.min(1440, contentHeight));
  } else if (type === 'record') {
    const record = chooseRecord(summary);
    const title = headingLayout(ctx, record.name, 54, 3);
    contentHeight = 665 + title.height + (record.reps ? 48 : 0) + (record.estimated ? 45 : 0);
  } else contentHeight = 1230;
  const height = format === 'story' ? 1920 : format === 'square' ? 1080 : Math.ceil(contentHeight / 10) * 10;
  canvas.width = WIDTH;
  canvas.height = height;
  // Setting dimensions resets the context, including its alpha and transforms.
  ctx.clearRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'top';
  paintBackground(ctx, WIDTH, height, style, colors, options.photo);
  if (style === 'transparent') {
    ctx.shadowColor = light ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.34)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
  }
  const offset = format === 'story' ? Math.max(110, Math.floor((height - contentHeight) / 2)) : 65;
  if (type === 'session') drawSession(ctx, session, summary, { format }, colors, height, offset);
  else if (type === 'record') drawRecord(ctx, summary, colors, height, offset);
  else drawWeek(ctx, week, colors, height, offset, format);
  drawFooter(ctx, height, options.profile || {}, textValue(options.brand, 'Repite'), colors);
  const promise = encodeCanvas(canvas);
  const prepared = { promise, width: canvas.width, height: canvas.height, blob: null, file: null };
  preparedImages.set(canvas, prepared);
  const blob = await promise;
  if (preparedImages.get(canvas) === prepared) {
    prepared.blob = blob;
    if (typeof globalThis.File === 'function') {
      prepared.file = new File([blob], 'repite-entrenamiento.png', { type: 'image/png' });
    }
  }
}

function encodeCanvas(canvas) {
  const failure = () => new Error('No se pudo crear el PNG. Vuelve a elegir una foto local y prueba de nuevo.');
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' }).catch(() => { throw failure(); });
  }
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Tu navegador no permite exportar PNG. Prueba a actualizarlo.'));
      return;
    }
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(failure()), 'image/png');
    } catch {
      reject(failure());
    }
  });
}

export async function canvasBlob(canvas) {
  const prepared = preparedImages.get(canvas);
  if (prepared && prepared.width === canvas.width && prepared.height === canvas.height) return prepared.promise;
  return encodeCanvas(canvas);
}

function pngFilename(value) {
  const filename = textValue(value, 'repite-entrenamiento.png').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  return /\.png$/i.test(filename) ? filename : `${filename}.png`;
}

export async function downloadCanvas(canvas, filename = 'repite-entrenamiento.png') {
  const blob = await canvasBlob(canvas);
  if (!globalThis.document || !globalThis.URL?.createObjectURL) {
    throw new Error('La descarga no está disponible en este navegador.');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pngFilename(filename);
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Safari needs time to finish opening the local PNG before its URL is revoked.
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export async function copyCanvas(canvas) {
  if (!globalThis.navigator?.clipboard?.write || !globalThis.ClipboardItem) {
    throw new Error('Este navegador no permite copiar imágenes. Usa Compartir o Descargar PNG.');
  }
  if (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports('image/png')) {
    throw new Error('Este navegador no permite copiar PNG. Usa Compartir o Descargar PNG.');
  }
  try {
    // Passing the promise immediately preserves Safari's user activation.
    const item = new ClipboardItem({ 'image/png': canvasBlob(canvas) });
    await navigator.clipboard.write([item]);
  } catch (error) {
    if (error?.message?.startsWith('No se pudo crear')) throw error;
    throw new Error('No se pudo copiar la imagen. Pulsa Copiar de nuevo, o usa Compartir o Descargar PNG.');
  }
}

export async function shareCanvas(canvas, filename = 'repite-entrenamiento.png') {
  const prepared = preparedImages.get(canvas);
  const ready = prepared?.width === canvas.width && prepared?.height === canvas.height ? prepared : null;
  // With a rendered preview, execute navigator.share in the original click task.
  // Even awaiting an already resolved PNG promise can lose activation in Safari.
  const blob = ready?.blob || await canvasBlob(canvas);
  const name = pngFilename(filename);
  const canCreateFile = typeof globalThis.File === 'function';
  const file = canCreateFile ? (ready?.file?.name === name ? ready.file : new File([blob], name, { type: 'image/png' })) : null;
  const data = file ? { files: [file] } : null;
  let supported = false;
  if (data && typeof globalThis.navigator?.share === 'function' && typeof navigator.canShare === 'function') {
    try { supported = navigator.canShare(data); } catch { supported = false; }
  }
  if (supported) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      // Cancellation must never unexpectedly trigger a download.
      if (error?.name === 'AbortError') throw error;
      throw new Error('No se pudo abrir Compartir. Pulsa el botón de nuevo o usa Descargar PNG.');
    }
  }
  await downloadCanvas(canvas, filename);
  return 'downloaded';
}

/** Includes iPadOS Safari's desktop-style identity without treating a Mac as iPad. */
export function isAppleMobile() {
  const device = globalThis.navigator;
  if (!device) return false;
  const userAgent = textValue(device.userAgent);
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return true;
  const macIdentity = device.platform === 'MacIntel' || /\bMacintosh\b/i.test(userAgent);
  return macIdentity && Number(device.maxTouchPoints) > 1;
}

/**
 * On iPhone/iPad, let the person choose Save Image in the native share sheet.
 * A website cannot select Photos or confirm which share target they chose.
 * Return the existing share promise directly to preserve the original tap.
 */
export function saveCanvas(canvas, filename = 'repite-entrenamiento.png') {
  if (isAppleMobile()) return shareCanvas(canvas, filename);
  return downloadCanvas(canvas, filename).then(() => 'downloaded');
}
