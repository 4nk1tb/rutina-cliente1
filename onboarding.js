import { createDraftSets, suggestNextSet, markSetEdited } from './data.js';
import { markOnboardingSeen } from './onboarding-state.js';
import { createMotion } from './motion.js';

const STEPS = {
  welcome: {
    name: 'Bienvenida', icon: 'dumbbell', title: 'Una serie a la vez.',
    description: 'Conoce Repite en unos dos minutos. Puedes saltar o volver cuando quieras.',
    points: [
      ['Prepara tu plan', 'En Rutina eliges los días y ejercicios que quieres entrenar.'],
      ['Registra lo que haces', 'En Entrenar guardas peso, repeticiones y series completadas.'],
      ['Mira lo que mejora', 'Progreso, Historial y Compartir dan contexto a cada sesión.'],
    ],
  },
  routine: {
    name: 'Rutina', icon: 'list', title: 'Un plan que encaje contigo.',
    description: 'Crea tus días y ejercicios o empieza con una plantilla editable.',
    points: [
      ['Hazlo tuyo', 'Ajusta series, repeticiones objetivo, descansos y notas.'],
      ['Empieza con una plantilla', 'Full body de 2 o 3 días, Torso/Pierna de 4, o Push/Pull/Legs de 3 o 6.'],
    ],
    details: ['¿Ya tienes una rutina?', 'En Perfil puedes importar un archivo de rutina, por ejemplo el que te pase tu entrenador. Cambiar el plan conserva tus sesiones guardadas.'],
  },
  train: {
    name: 'Entrenar', icon: 'check', title: 'Prueba una serie aquí.',
    description: 'Durante una sesión, escribe el peso y las repeticiones y pulsa el check al terminar la serie.',
    demo: true,
    details: ['Qué ocurre después del check', 'Empieza el descanso del ejercicio y la siguiente serie recibe los mismos valores como sugerencia. Puedes editarlos; los valores que ya hayas editado se conservan. Al volver a la app, el temporizador se recalcula; no suena una alarma si la app está cerrada. Aquí el descanso es un ejemplo de 90 segundos.'],
  },
  progress: {
    name: 'Progreso', icon: 'chart', title: 'Mejorar también es hacer más.',
    description: 'La misma carga con más repeticiones también muestra progreso.',
    example: 'progress',
    points: [
      ['Más contexto', 'Consulta gráficas de carga, volumen y 1RM estimado por ejercicio.'],
      ['Una referencia honesta', 'La primera sesión crea tu referencia. Los récords comparan tus entrenamientos posteriores.'],
    ],
    details: ['Cómo interpretar los números', 'El volumen suma peso × repeticiones de las series completadas. Con dos mancuernas registras el peso de UNA: el volumen cuenta las dos, y la carga y el 1RM se muestran por mancuerna. El 1RM es una estimación, no un máximo probado.'],
  },
  history: {
    name: 'Historial', icon: 'calendar', title: 'Termina, revisa y guarda.',
    description: 'Al terminar la sesión verás un resumen antes de guardar el entrenamiento.',
    example: 'save',
    points: [
      ['Solo cuenta lo completado', 'Puedes guardar desde una serie completada. Las series sin marcar no se incluyen en tus estadísticas.'],
      ['Revisa antes de guardar', 'Después podrás consultar ejercicios y notas en Historial. Las sesiones guardadas todavía no se editan.'],
    ],
  },
  share: {
    name: 'Compartir', icon: 'share', title: 'Tu entrenamiento, en una imagen.',
    description: 'Después de guardar puedes crear una imagen de la sesión, una marca o tu semana.',
    points: [
      ['Elige el acabado', 'PNG transparente, tarjeta redondeada o una foto opcional. La imagen incluye fecha y tu @usuario.'],
      ['Llévala a Fotos', 'En iPhone, Guardar imagen abre el menú de iOS: elige Guardar imagen para añadirla a Fotos.'],
    ],
    details: ['Para una historia o un sticker', 'También puedes copiar el PNG y pegarlo sobre una foto. El @usuario que pongas en Perfil se usa por defecto. La app no guarda automáticamente en Fotos: tú eliges esa acción en el menú de iPhone.'],
  },
  profile: {
    name: 'Perfil', icon: 'user', title: 'Tu espacio y tus datos.',
    description: 'Configura tu nombre, tu @usuario y el tema claro u oscuro. Esta guía siempre estará en Perfil.',
    points: [
      ['Todo queda en este dispositivo', 'Repite funciona sin cuenta. Exporta una Copia completa para llevar tus datos a otro dispositivo.'],
      ['Compártelo con tu entrenador', 'Exporta tu seguimiento. Al importar el de otra persona, puedes verlo sin mezclarlo con tus datos.'],
    ],
    details: ['Instalar en tu iPhone y conservar tus datos', 'Abre Repite en Safari, pulsa Compartir y Añadir a pantalla de inicio. No hay sincronización ni copia automática. Los datos siguen siendo locales: conserva una Copia completa antes de cambiar de móvil o borrar los datos del navegador.'],
  },
  saveShare: {
    name: 'Guardar y compartir', icon: 'share', title: 'Guárdalo y llévatelo contigo.',
    description: 'Termina la sesión, revisa el resumen y pulsa Guardar entrenamiento. Solo cuentan las series completadas.',
    example: 'save',
    points: [
      ['Comparte tu sesión', 'Crea un PNG transparente, una tarjeta o una foto opcional, con fecha y el @usuario de Perfil.'],
      ['Guarda la imagen en iPhone', 'Guardar imagen abre el menú de iOS. Elige Guardar imagen para añadirla a Fotos.'],
    ],
    details: ['Historial, Perfil y copias', 'Puedes guardar desde una serie completada. Revisa sus valores: las sesiones guardadas todavía no se editan, aunque puedes consultarlas en Historial. Define tu nombre, @usuario y tema en Perfil, donde puedes reabrir las guías. Los datos son locales, sin cuenta, sincronización ni copia automática: exporta una Copia completa para otro dispositivo. Puedes exportar seguimiento para tu entrenador e importar el suyo para verlo sin mezclar datos. Para instalar Repite, abre Safari → Compartir → Añadir a pantalla de inicio.'],
  },
};
const ROUTES = {
  simple: ['routine', 'train', 'progress', 'saveShare'],
  detailed: ['welcome', 'routine', 'train', 'progress', 'history', 'share', 'profile'],
};

/** A standalone learning dialog: only its seen marker is persisted. */
export function createOnboarding({ dialog, icon = () => '', onChooseRoutine, onTrain }) {
  const document = dialog.ownerDocument;
  const motion = createMotion(dialog);
  let mode = null;
  let index = 0;
  let active = false;
  let returnFocus = null;
  let demoSets = [];
  let demoEndsAt = null;
  let demoInterval = null;
  const find = selector => dialog.querySelector(selector);
  const glyph = name => icon(name);

  function stopDemo() {
    if (demoInterval !== null) globalThis.clearInterval(demoInterval);
    demoInterval = null;
    demoEndsAt = null;
  }

  function focusTitle() { find('#guide-title')?.focus({ preventScroll: true }); }

  function header(title, description, progress = '') {
    return `<div class="dialog-header guide-header"><div><h2 id="guide-title" tabindex="-1">${title}</h2><p id="guide-description" class="caption">${description}</p></div><button type="button" class="icon-btn" data-guide-action="close" aria-label="Cerrar guía">${glyph('close')}</button></div>${progress}`;
  }

  function showChooser(animate = true) {
    stopDemo();
    mode = null;
    index = 0;
    dialog.innerHTML = header('¿Cómo quieres empezar?', 'Elige un recorrido. Puedes cambiar de guía o volver a verla en Perfil.') + `
      <div class="guide-body guide-choices">
        <button type="button" class="guide-choice" data-guide-action="choose" data-guide-mode="simple"><span class="guide-choice-icon">${glyph('clock')}</span><span class="guide-choice-copy"><strong class="guide-choice-title">Tutorial rápido</strong><span class="guide-choice-meta">4 pasos · alrededor de 1 minuto</span><span>Tu rutina, una serie de prueba y cómo guardar y compartir.</span></span>${glyph('arrow')}</button>
        <button type="button" class="guide-choice" data-guide-action="choose" data-guide-mode="detailed"><span class="guide-choice-icon">${glyph('list')}</span><span class="guide-choice-copy"><strong class="guide-choice-title">Guía detallada</strong><span class="guide-choice-meta">7 pasos · alrededor de 2 minutos</span><span>Un recorrido por todas las pantallas y cómo conservar tus datos.</span></span>${glyph('arrow')}</button>
      </div><div class="dialog-footer guide-footer"><button type="button" class="btn secondary" data-guide-action="skip">Entrar sin guía</button></div>`;
    if (animate) motion.content(find('.guide-body'));
    if (dialog.open) focusTitle();
  }

  function demoMarkup() {
    return `<section class="guide-demo" aria-label="Práctica de una serie"><div class="guide-demo-heading"><strong>Press banca · Ejemplo</strong><span class="badge">No se guarda</span></div><div class="guide-demo-row"><span class="guide-demo-index">1</span><label class="field">Peso (kg)<input id="guide-demo-weight" data-guide-field="weight" type="number" inputmode="decimal" min="0" max="5000" step="0.25" value="60"></label><label class="field">Repeticiones<input id="guide-demo-reps" data-guide-field="reps" type="number" inputmode="numeric" min="1" max="500" step="1" value="10"></label><button type="button" class="set-complete guide-demo-complete" data-guide-action="demo-complete" aria-label="Completar serie de ejemplo" aria-pressed="false">${glyph('check')}</button></div><p id="guide-demo-status" class="caption" role="status" aria-live="polite">Prueba el check: empezará un descanso y verás la siguiente serie sugerida.</p><div class="guide-demo-next" hidden><p class="caption">Siguiente serie sugerida</p><strong id="guide-demo-suggestion"></strong><div class="guide-demo-timer">${glyph('clock')}<span>Descanso de ejemplo</span><strong id="guide-demo-clock" role="timer" aria-live="off">01:30</strong></div><button type="button" class="btn subtle small" data-guide-action="demo-reset">Repetir ejemplo</button></div><p class="caption guide-demo-hint">En ejercicios con dos mancuernas, registra el peso de UNA. Puedes pulsar Siguiente sin esperar al descanso.</p></section>`;
  }

  function exampleMarkup(example) {
    if (example === 'progress') return `<div class="guide-example" aria-label="Ejemplo de progreso, no son tus datos"><span class="badge">Ejemplo</span><div class="guide-example-comparison"><span><small>Anterior</small><strong>60 kg × 10</strong></span>${glyph('arrow')}<span><small>Ahora</small><strong>60 kg × 12</strong></span></div><p class="record-tag">${glyph('chart')} +2 repeticiones con la misma carga</p></div>`;
    if (example === 'save') return `<div class="guide-example guide-save-flow"><span>${glyph('check')} Terminar</span>${glyph('arrow')}<span>${glyph('list')} Revisar</span>${glyph('arrow')}<span>${glyph('calendar')} Guardar</span></div>`;
    return '';
  }

  function renderStep(animate = true) {
    stopDemo();
    const route = ROUTES[mode];
    const step = STEPS[route[index]];
    const last = index === route.length - 1;
    if (step.demo) {
      demoSets = createDraftSets(2);
      demoSets[0].weight = 60;
      demoSets[0].reps = 10;
    }
    const progress = `<div class="guide-progress"><p id="guide-step" class="caption">${mode === 'simple' ? 'Tutorial rápido' : 'Guía detallada'} · Paso ${index + 1} de ${route.length} <span class="guide-step-name">· ${step.name}</span></p><div class="guide-dots" aria-hidden="true">${route.map((_, dot) => `<span class="${dot === index ? 'active' : dot < index ? 'visited' : ''}"></span>`).join('')}</div></div>`;
    dialog.innerHTML = header(step.title, step.description, progress) + `<div class="guide-body">
      ${step.demo ? demoMarkup() : step.example ? exampleMarkup(step.example) : `<div class="guide-visual" aria-hidden="true">${glyph(step.icon)}</div>`}
      ${step.points ? `<ul class="guide-points">${step.points.map(([title, body]) => `<li><strong>${title}</strong><p class="caption">${body}</p></li>`).join('')}</ul>` : ''}
      ${step.details ? `<details class="guide-details"><summary>${step.details[0]}</summary><p class="caption">${step.details[1]}</p></details>` : ''}
      </div>${last ? `<div class="guide-final-actions"><button type="button" class="btn primary" data-guide-action="routine">Elegir mi rutina ${glyph('arrow')}</button><button type="button" class="btn secondary" data-guide-action="train">Ir a entrenar</button></div>` : ''}<div class="dialog-footer guide-footer"><button type="button" class="btn secondary" data-guide-action="back">${glyph('back')} Atrás</button>${last ? '' : `<button type="button" class="btn primary" data-guide-action="next">Siguiente ${glyph('arrow')}</button>`}<button type="button" class="btn subtle guide-skip" data-guide-action="skip">Omitir guía</button></div>`;
    dialog.scrollTop = 0;
    if (animate) motion.content(find('.guide-body'));
    if (dialog.open) focusTitle();
  }

  function demoTick() {
    if (!active || !dialog.open || demoEndsAt === null || !find('#guide-demo-clock')) { stopDemo(); return; }
    const remaining = Math.max(0, Math.ceil((demoEndsAt - Date.now()) / 1000));
    find('#guide-demo-clock').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if (!remaining) {
      stopDemo();
      find('#guide-demo-status').textContent = 'Descanso de ejemplo terminado. Puedes seguir con la guía.';
    }
  }

  function completeDemo() {
    if (!mode || ROUTES[mode][index] !== 'train' || demoSets[0]?.done) return;
    const weightField = find('#guide-demo-weight');
    const repsField = find('#guide-demo-reps');
    const weight = weightField.value.trim() === '' ? null : Number(weightField.value);
    const reps = repsField.value.trim() === '' ? null : Number(repsField.value);
    const validWeight = weight !== null && Number.isFinite(weight) && weight >= 0 && weight <= 5000;
    const validReps = reps !== null && Number.isInteger(reps) && reps >= 1 && reps <= 500;
    weightField.setAttribute('aria-invalid', String(!validWeight));
    repsField.setAttribute('aria-invalid', String(!validReps));
    const status = find('#guide-demo-status');
    if (!validWeight || !validReps) {
      status.textContent = 'Escribe un peso válido (0 kg también cuenta) y un número entero de repeticiones.';
      (validWeight ? repsField : weightField).focus({ preventScroll: true });
      return;
    }
    Object.assign(demoSets[0], { weight, reps, done: true });
    suggestNextSet(demoSets, 0);
    weightField.disabled = true;
    repsField.disabled = true;
    const button = find('[data-guide-action="demo-complete"]');
    button.disabled = true;
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Serie de ejemplo completada');
    find('.guide-demo-next').hidden = false;
    const next = demoSets[1];
    find('#guide-demo-suggestion').textContent = `${next.weight.toLocaleString('es-ES')} kg × ${next.reps} repeticiones`;
    status.textContent = 'Serie completada. Empieza el descanso y la siguiente recibe tu peso y repeticiones. Este ejemplo no se guarda.';
    demoEndsAt = Date.now() + 90000;
    demoTick();
    demoInterval = globalThis.setInterval(demoTick, 1000);
  }

  function finish(status) {
    if (!active) return;
    active = false;
    stopDemo();
    markOnboardingSeen(status);
    for (const animation of find('.guide-body')?.getAnimations?.() || []) animation.cancel();
    const previous = returnFocus;
    returnFocus = null;
    if (dialog.open) dialog.close();
    if (previous?.isConnected) previous.focus?.({ preventScroll: true });
  }

  function close() { finish('skipped'); }

  function open(requestedMode) {
    if (active || dialog.open) return;
    returnFocus = document.activeElement;
    active = true;
    markOnboardingSeen('started');
    index = 0;
    mode = Object.hasOwn(ROUTES, requestedMode) ? requestedMode : null;
    if (mode) renderStep(false); else showChooser(false);
    dialog.showModal();
    focusTitle();
  }

  dialog.addEventListener('click', event => {
    if (!active) return;
    const button = event.target.closest?.('[data-guide-action]');
    if (!button || !dialog.contains(button) || button.disabled) return;
    switch (button.dataset.guideAction) {
      case 'choose':
        if (Object.hasOwn(ROUTES, button.dataset.guideMode)) { mode = button.dataset.guideMode; index = 0; renderStep(); }
        break;
      case 'back': if (index > 0) { index -= 1; renderStep(); } else showChooser(); break;
      case 'next': if (mode && index < ROUTES[mode].length - 1) { index += 1; renderStep(); } break;
      case 'demo-complete': completeDemo(); break;
      case 'demo-reset': renderStep(false); break;
      case 'routine': finish('completed'); onChooseRoutine?.(); break;
      case 'train': finish('completed'); onTrain?.(); break;
      case 'close':
      case 'skip': close(); break;
    }
  });
  dialog.addEventListener('input', event => {
    const field = event.target.dataset?.guideField;
    if (!active || !['weight', 'reps'].includes(field) || !demoSets[0] || demoSets[0].done) return;
    markSetEdited(demoSets[0], field);
  });
  dialog.addEventListener('cancel', event => { if (active) { event.preventDefault(); close(); } });
  dialog.addEventListener('close', () => { if (active && !dialog.open) close(); });
  return { open, close };
}
