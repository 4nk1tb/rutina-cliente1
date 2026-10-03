// Editable starting plans. Every option owns its days and exercise objects.
// Per-dumbbell entries always name two dumbbells; all other loads are total.
const fullBodyA = [
  ['Sentadilla con barra', 'cuadriceps', 120],
  ['Press de banca con barra', 'pecho', 120],
  ['Remo sentado en polea', 'espalda', 120],
  ['Peso muerto rumano con barra', 'isquios', 120],
  ['Elevaciones laterales con dos mancuernas', 'hombros', 90, 'perDumbbell'],
  ['Crunch en polea', 'core', 90],
];
const fullBodyB = [
  ['Prensa de piernas', 'cuadriceps', 120],
  ['Jalón al pecho en polea', 'espalda', 120],
  ['Press inclinado con dos mancuernas', 'pecho', 120, 'perDumbbell'],
  ['Curl femoral tumbado en máquina', 'isquios', 90],
  ['Curl de bíceps con dos mancuernas', 'biceps', 90, 'perDumbbell'],
  ['Elevación de gemelos de pie en máquina', 'gemelos', 90],
];
const fullBodyC = [
  ['Sentadilla en multipower', 'cuadriceps', 120],
  ['Press de hombros con dos mancuernas', 'hombros', 120, 'perDumbbell'],
  ['Remo con pecho apoyado con dos mancuernas', 'espalda', 120, 'perDumbbell'],
  ['Hip thrust con barra', 'gluteos', 120],
  ['Extensión de tríceps en polea', 'triceps', 90],
  ['Crunch en máquina', 'core', 90],
];
const upperA = [
  ['Press de banca con barra', 'pecho', 120],
  ['Remo sentado en polea', 'espalda', 120],
  ['Jalón al pecho en polea', 'espalda', 120],
  ['Elevaciones laterales con dos mancuernas', 'hombros', 90, 'perDumbbell'],
  ['Curl de bíceps con dos mancuernas', 'biceps', 90, 'perDumbbell'],
  ['Extensión de tríceps en polea', 'triceps', 90],
];
const upperB = [
  ['Press inclinado con dos mancuernas', 'pecho', 120, 'perDumbbell'],
  ['Remo con pecho apoyado con dos mancuernas', 'espalda', 120, 'perDumbbell'],
  ['Press de hombros con dos mancuernas', 'hombros', 120, 'perDumbbell'],
  ['Aperturas en máquina', 'pecho', 90],
  ['Curl de bíceps en polea', 'biceps', 90],
  ['Extensión de tríceps sobre la cabeza en polea', 'triceps', 90],
];
const lowerA = [
  ['Sentadilla con barra', 'cuadriceps', 120],
  ['Peso muerto rumano con barra', 'isquios', 120],
  ['Hip thrust con barra', 'gluteos', 120],
  ['Extensión de cuádriceps en máquina', 'cuadriceps', 90],
  ['Elevación de gemelos de pie en máquina', 'gemelos', 90],
  ['Crunch en polea', 'core', 90],
];
const lowerB = [
  ['Prensa de piernas', 'cuadriceps', 120],
  ['Curl femoral sentado en máquina', 'isquios', 90],
  ['Hip thrust en máquina', 'gluteos', 120],
  ['Extensión de cuádriceps en máquina', 'cuadriceps', 90],
  ['Elevación de gemelos sentado en máquina', 'gemelos', 90],
  ['Crunch en máquina', 'core', 90],
];
const pushA = [
  ['Press de banca con barra', 'pecho', 120],
  ['Press inclinado con dos mancuernas', 'pecho', 120, 'perDumbbell'],
  ['Press de hombros en máquina', 'hombros', 120],
  ['Elevaciones laterales con dos mancuernas', 'hombros', 90, 'perDumbbell'],
  ['Aperturas en máquina', 'pecho', 90],
  ['Extensión de tríceps en polea', 'triceps', 90],
];
const pushB = [
  ['Press de pecho en máquina', 'pecho', 120],
  ['Press inclinado con barra', 'pecho', 120],
  ['Press de hombros con dos mancuernas', 'hombros', 120, 'perDumbbell'],
  ['Elevaciones laterales en máquina', 'hombros', 90],
  ['Extensión de tríceps sobre la cabeza en polea', 'triceps', 90],
  ['Extensión de tríceps en polea', 'triceps', 90],
];
const pullA = [
  ['Jalón al pecho en polea', 'espalda', 120],
  ['Remo sentado en polea', 'espalda', 120],
  ['Remo con pecho apoyado en máquina', 'espalda', 120],
  ['Aperturas inversas en máquina', 'hombros', 90],
  ['Curl de bíceps con dos mancuernas', 'biceps', 90, 'perDumbbell'],
  ['Curl de bíceps en polea', 'biceps', 90],
];
const pullB = [
  ['Jalón con agarre neutro en polea', 'espalda', 120],
  ['Remo con pecho apoyado con dos mancuernas', 'espalda', 120, 'perDumbbell'],
  ['Pullover en polea', 'espalda', 90],
  ['Aperturas inversas en máquina', 'hombros', 90],
  ['Curl de bíceps en máquina', 'biceps', 90],
  ['Curl martillo con dos mancuernas', 'biceps', 90, 'perDumbbell'],
];

function option(id, days, name, planDays) {
  return {
    days,
    label: `${days} días`,
    routine: {
      name: `${name} · ${days} días`,
      days: planDays.map(([title, exercises], dayIndex) => ({
        title,
        exercises: exercises.map(([exerciseName, muscleGroup, seconds, weightMode = 'total'], index) => ({
          id: `template-${id}-${days}-d${dayIndex + 1}-e${index + 1}`,
          name: exerciseName,
          muscleGroup,
          sets: 3,
          reps: '8-12',
          rir: 'RIR 2',
          rest: `${seconds} s`,
          timer: seconds / 60,
          weightMode,
        })),
      })),
    },
  };
}

export const ROUTINE_TEMPLATES = [
  {
    id: 'full-body',
    name: 'Full body',
    description: 'Sesiones de cuerpo completo. Elige dos o tres días y edita los ejercicios de cada sesión.',
    options: [
      option('full-body', 2, 'Full body', [['Full body A', fullBodyA], ['Full body B', fullBodyB]]),
      option('full-body', 3, 'Full body', [['Full body A', fullBodyA], ['Full body B', fullBodyB], ['Full body C', fullBodyC]]),
    ],
  },
  {
    id: 'upper-lower',
    name: 'Torso / pierna',
    description: 'Cuatro sesiones alternando torso y pierna. Los ejercicios y sus objetivos se pueden cambiar.',
    options: [
      option('upper-lower', 4, 'Torso / pierna', [['Torso A', upperA], ['Pierna A', lowerA], ['Torso B', upperB], ['Pierna B', lowerB]]),
    ],
  },
  {
    id: 'push-pull-legs',
    name: 'Push / pull / legs',
    description: 'Empuje, tirón y pierna en tres o seis sesiones. Una base editable para organizar tu plan.',
    options: [
      option('push-pull-legs', 3, 'Push / pull / legs', [['Push · Empuje', pushA], ['Pull · Tirón', pullA], ['Legs · Pierna', lowerA]]),
      option('push-pull-legs', 6, 'Push / pull / legs', [['Push A · Empuje', pushA], ['Pull A · Tirón', pullA], ['Legs A · Pierna', lowerA], ['Push B · Empuje', pushB], ['Pull B · Tirón', pullB], ['Legs B · Pierna', lowerB]]),
    ],
  },
];
