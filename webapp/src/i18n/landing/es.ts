import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privado (procesado en tu navegador)',
  'Sin registro',
  'Resultados en segundos',
];

const OPTIMIZER_FEATURES = [
  'Mantener juntos',
  'Evitar emparejamientos',
  'Múltiples rondas',
  'Maximizar mezcla',
  'Equilibrar géneros',
  'Equilibrar cualquier atributo',
  'Ajustar resultados',
];

const CHROME = {
  expertWorkspaceLabel: 'Editor avanzado',
  faqHeading: 'Preguntas frecuentes',
  footerTagline: 'GroupMixer — Generador gratis de grupos aleatorios',
  feedbackLabel: 'Comentarios',
  privacyNote: 'Todo el procesamiento ocurre localmente en tu navegador.',
  scrollHint: 'Desplázate para ver casos de uso y preguntas frecuentes',
};

const USE_CASES_SECTION = {
  title: 'Funciona para aulas, talleres y eventos',
  description:
    'Empieza con una división aleatoria simple. Cuando necesites más control, GroupMixer crece contigo.',
  cards: [
    {
      title: 'Grupos para clase',
      body: 'Los docentes pegan una lista de estudiantes y crean grupos equilibrados en segundos. Sin curva de aprendizaje.',
    },
    {
      title: 'Salas de trabajo en talleres',
      body: 'Divide a los participantes en salas para una sesión o rota entre varias rondas.',
    },
    {
      title: 'Networking rápido',
      body: 'Genera varias rondas en las que las personas conozcan gente nueva cada vez. Minimiza repeticiones automáticamente.',
    },
    {
      title: 'Proyectos en equipo',
      body: 'Divide una clase o un equipo en grupos de proyecto. Opcionalmente equilibra por habilidad, rol o departamento.',
    },
    {
      title: 'Sesiones de conferencia',
      body: 'Asigna asistentes a mesas de discusión o pistas paralelas respetando restricciones.',
    },
    {
      title: 'Dinámicas sociales',
      body: 'Planifica rondas rompehielos donde todos conozcan a alguien nuevo. Mantén a ciertas personas juntas o separadas.',
    },
  ],
};

const ADVANCED_SECTION = {
  title: '¿Necesitas más control?',
  description:
    'GroupMixer es más que un mezclador aleatorio. Cuando los grupos simples no bastan, desbloquea reglas avanzadas sin cambiar de herramienta.',
  cards: [
    {
      title: 'Mantener a ciertas personas juntas',
      body: 'Asegura que amistades, compañeros o parejas predefinidas queden siempre en el mismo grupo.',
    },
    {
      title: 'Mantener a ciertas personas separadas',
      body: 'Evita que determinadas personas queden en el mismo grupo, útil para conflictos o diversidad.',
    },
    {
      title: 'Evitar repeticiones',
      body: 'Ejecuta varias rondas sin que las mismas dos personas vuelvan a coincidir.',
    },
    {
      title: 'Equilibrar grupos por atributo',
      body: 'Usa CSV para equilibrar por rol, nivel, género, departamento o cualquier columna personalizada.',
    },
  ],
  buttonLabel: 'Abrir editor avanzado',
  supportingText:
    'El editor avanzado te da control total sobre sesiones, restricciones, configuración del solver y análisis detallado.',
};

const FAQS = {
  free: {
    question: '¿GroupMixer es gratis?',
    answer:
      'Sí. GroupMixer es completamente gratis. No requiere registro, cuenta ni límites de uso.',
  },
  privacy: {
    question: '¿Mis datos se mantienen privados?',
    answer:
      'Sí. Todo el procesamiento ocurre localmente en tu navegador. Tus nombres y datos de grupos no se envían a un servidor. Puedes usar esta página sin conexión a internet una vez cargada.'
  },
  constraints: {
    question: '¿Puedo añadir reglas como mantener juntos o separar personas?',
    answer:
      'Sí. Abre las opciones avanzadas para añadir grupos que deben permanecer juntos, reglas para evitar emparejamientos, múltiples sesiones y equilibrio por atributos. O usa el editor avanzado para control total.',
  },
  multiSession: {
    question: '¿Puedo crear grupos para varias rondas?',
    answer:
      'Sí. Define el número de sesiones en las opciones avanzadas y activa "Evitar repeticiones" para reducir cuánto coinciden las mismas personas.',
  },
  workspace: {
    question: '¿Qué es el editor avanzado?',
    answer:
      'El editor avanzado te da control detallado sobre sesiones, restricciones, configuración del solver, reutilización de resultados anteriores y análisis completo. Usa el mismo motor potente.',
  },
};

function createContent({
  title,
  description,
  eyebrow,
  heroTitle,
  subhead,
  audienceSummary,
  faqEntries,
}: {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  subhead: string;
  audienceSummary: string;
  faqEntries: ToolPageLocalizedContent['faqEntries'];
}): ToolPageLocalizedContent {
  return {
    seo: { title, description },
    hero: {
      eyebrow,
      title: heroTitle,
      subhead,
      audienceSummary,
      trustBullets: TRUST_BULLETS,
    },
    optimizerCta: {
      eyebrow: '¿Quieres algo mejor que aleatorio?',
      title: 'Usa el optimizador completo de grupos.',
      featureBullets: OPTIMIZER_FEATURES,
      buttonLabel: 'Abrir editor avanzado',
      supportingText: 'Tus datos de esta página se mantienen cuando entras.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
    advancedSection: ADVANCED_SECTION,
  };
}

export const ES_TOOL_PAGE_CONTENT: Partial<Record<ToolPageKey, ToolPageLocalizedContent>> = {
  home: createContent({
    title: 'Generador Aleatorio de Grupos — Divide nombres en equipos al instante | GroupMixer',
    description:
      'Generador gratis de grupos aleatorios. Pega nombres, elige cuántos grupos quieres y genera grupos equilibrados en segundos. Sin registro. Añade restricciones cuando lo necesites.',
    eyebrow: 'Para aulas, talleres y eventos',
    heroTitle: 'Generador Aleatorio de Grupos',
    subhead:
      'Pega nombres, elige el número de grupos y genera al instante.',
    audienceSummary: '',
    faqEntries: [
      {
        question: '¿Cómo divido una lista de nombres en grupos aleatorios?',
        answer:
          'Pega tus nombres (uno por línea), define el número de grupos o personas por grupo y haz clic en "Generar grupos". Los grupos aparecen al instante.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
  }),
  'random-group-generator': createContent({
    title: 'Generador Aleatorio de Grupos — Crea grupos a partir de una lista de nombres | GroupMixer',
    description:
      'Generador gratis de grupos aleatorios. Pega una lista de nombres, elige cuántos grupos quieres y divídelos al instante. Funciona para aulas, talleres y eventos.',
    eyebrow: 'Para divisiones rápidas y aleatorias',
    heroTitle: 'Generador Aleatorio de Grupos',
    subhead:
      'Pega una lista de nombres, elige cuántos grupos quieres y divídelos al instante. Sin registro ni servidor: todo ocurre en tu navegador.',
    audienceSummary:
      'Ideal cuando necesitas una herramienta rápida y sencilla para actividades de clase, salas de taller y logística básica de eventos.',
    faqEntries: [
      {
        question: '¿Cómo funciona el generador aleatorio de grupos?',
        answer:
          'Pega nombres en el cuadro de texto (uno por línea), define el número de grupos o el tamaño de cada grupo y pulsa Generar. GroupMixer crea una división equilibrada al instante.',
      },
      {
        question: '¿Puedo controlar el número de grupos o el tamaño del grupo?',
        answer:
          'Sí. Puedes fijar un número de grupos o indicar cuántas personas quieres por grupo. GroupMixer hace el resto.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'random-team-generator': createContent({
    title: 'Generador Aleatorio de Equipos — Crea equipos equilibrados rápidamente | GroupMixer',
    description:
      'Generador gratis de equipos aleatorios. Pega nombres y crea equipos equilibrados al instante. Añade reglas para equilibrar habilidades, mantener juntos o separar personas cuando lo necesites.',
    eyebrow: 'Para coaches, líderes y facilitadores',
    heroTitle: 'Generador Aleatorio de Equipos',
    subhead:
      'Crea equipos aleatorios en segundos. Pega nombres, elige la cantidad de equipos y genera. Añade reglas de equilibrio cuando necesites más justicia.',
    audienceSummary:
      'Pensado para actividades por equipos donde la equidad importa más que la pura aleatoriedad, especialmente cuando hay roles o habilidades que repartir.',
    faqEntries: [
      {
        question: '¿Cómo creo equipos aleatorios?',
        answer:
          'Pega los nombres de los participantes, define el número de equipos y pulsa Generar. GroupMixer los divide en equipos equilibrados al instante.',
      },
      {
        question: '¿Puedo equilibrar equipos por habilidad o rol?',
        answer:
          'Sí. Cambia al modo CSV y añade columnas como "rol" o "habilidad". Luego usa la opción de equilibrio por atributo para repartir esos valores de forma uniforme.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'breakout-room-generator': createContent({
    title: 'Generador de Salas de Trabajo — Divide participantes en salas | GroupMixer',
    description:
      'Generador gratis de salas de trabajo. Pega nombres y divide participantes en breakout rooms al instante. Ideal para clases, talleres y reuniones remotas.',
    eyebrow: 'Para Zoom, formaciones y talleres',
    heroTitle: 'Generador de Salas de Trabajo',
    subhead:
      'Divide participantes en salas de trabajo al instante. Pega nombres, define el número de salas y genera. Perfecto para talleres, clases y sesiones remotas.',
    audienceSummary:
      'Útil cuando necesitas asignar salas rápidamente, pero también quieres rotar participantes entre rondas y reducir repeticiones.',
    faqEntries: [
      {
        question: '¿Cómo creo salas de trabajo?',
        answer:
          'Pega los nombres de los participantes, elige el número de salas y pulsa Generar. GroupMixer asigna a todas las personas al instante.',
      },
      {
        question: '¿Puedo rotar personas entre varias rondas?',
        answer:
          'Sí. Define el número de sesiones en las opciones avanzadas y activa "Evitar repeticiones" para que la gente conozca a personas nuevas en cada ronda.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'workshop-group-generator': createContent({
    title: 'Generador de Grupos para Talleres — Crea grupos pequeños para sesiones | GroupMixer',
    description:
      'Generador gratis de grupos para talleres. Divide participantes en grupos pequeños para actividades, salas y sesiones de varias rondas. Añade restricciones cuando lo necesites.',
    eyebrow: 'Para facilitadores de sesiones colaborativas',
    heroTitle: 'Generador de Grupos para Talleres',
    subhead:
      'Crea grupos para talleres en segundos. Empieza simple y añade rondas, equilibrio o reglas de emparejamiento según crezca la complejidad.',
    audienceSummary:
      'Pensado para talleres donde la composición del grupo afecta la calidad de la conversación, la energía y cuántas personas nuevas conoce cada participante.',
    faqEntries: [
      {
        question: '¿Cómo creo grupos para un taller?',
        answer:
          'Pega los nombres de los participantes, define el número de grupos o personas por grupo y pulsa Generar. GroupMixer crea grupos listos para taller al instante.',
      },
      {
        question: '¿Puedo rotar participantes entre rondas del taller?',
        answer:
          'Sí. Usa múltiples sesiones y evita repeticiones para que los participantes conozcan a gente nueva a lo largo de la agenda.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
  }),
  'student-group-generator': createContent({
    title: 'Generador de Grupos para Estudiantes — Crea grupos de clase rápidamente | GroupMixer',
    description:
      'Generador gratis de grupos para estudiantes. Pega tu lista de clase y crea grupos equilibrados en segundos. Añade reglas para mantener estudiantes juntos o separados.',
    eyebrow: 'Para docentes y actividades de aula',
    heroTitle: 'Generador de Grupos para Estudiantes',
    subhead:
      'Pega tu lista de clase y crea grupos al instante. Manténlo simple o añade reglas como mantener juntos y equilibrar equipos cuando haga falta.',
    audienceSummary:
      'Diseñado para docentes que necesitan formar grupos rápidamente sin perder control sobre emparejamientos o equilibrio.',
    faqEntries: [
      {
        question: '¿Cómo creo grupos de estudiantes?',
        answer:
          'Pega los nombres del alumnado (uno por línea), elige el número de grupos y pulsa Generar. GroupMixer se encarga del resto.',
      },
      {
        question: '¿Puedo mantener a ciertos estudiantes juntos o separados?',
        answer:
          'Sí. Abre las opciones avanzadas para definir reglas de mantener juntos y evitar emparejamientos. El solver las respeta al crear grupos.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
  }),
  'speed-networking-generator': createContent({
    title: 'Generador de Speed Networking — Varias rondas, menos repeticiones | GroupMixer',
    description:
      'Generador gratis de speed networking. Crea varias rondas en las que los participantes conozcan gente nueva cada vez. Minimiza repeticiones automáticamente.',
    eyebrow: 'Para mixers, meetups y sesiones de networking',
    heroTitle: 'Generador de Speed Networking',
    subhead:
      'Genera varias rondas de networking donde la gente conozca caras nuevas cada vez. Pega nombres, define rondas y minimiza repeticiones.',
    audienceSummary:
      'Ideal para formatos de networking estructurado donde el objetivo es crear conexiones nuevas en lugar de repetir los mismos grupos pequeños.',
    faqEntries: [
      {
        question: '¿Cómo funciona el generador de speed networking?',
        answer:
          'Pega los nombres, define el número de rondas (sesiones) y activa "Evitar repeticiones". GroupMixer crea grupos para cada ronda minimizando cuánto se repiten los encuentros.',
      },
      {
        question: '¿Puedo controlar el tamaño de los grupos en networking?',
        answer:
          'Sí. Define el número de grupos por ronda o las personas por grupo. GroupMixer calcula el resto.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
  }),
};
