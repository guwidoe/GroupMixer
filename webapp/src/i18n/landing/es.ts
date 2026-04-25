import type { ToolPageKey, ToolPageLocalizedContent } from '../../pages/toolPageTypes';

const TRUST_BULLETS = [
  'Privado (procesado en tu navegador)',
  'Sin registro',
  'Resultados en segundos',
];

const OPTIMIZER_FEATURES = [
  'Asistencia parcial',
  'Capacidades por grupo y sesión',
  'Reglas por sesión',
  'Restricciones flexibles ponderadas',
  'Objetivos de encuentros por pareja',
  'Ajuste avanzado de restricciones',
  'Ajustes del solver',
  'Análisis de resultados',
];

const OPTIMIZER_FEATURE_EXPLANATIONS = [
  'Define qué participantes asisten a cada sesión en lugar de asumir que todos están presentes en todas las rondas.',
  'Asigna capacidad propia a cada grupo y cámbiala por sesión cuando varíen salas, mesas o facilitadores.',
  'Aplica reglas de unir, separar, fijar, repetir o equilibrar solo en las sesiones donde importan.',
  'Añade preferencias que pueden romperse si hace falta y ajusta su peso frente a otros objetivos.',
  'Define cuántas veces deberían encontrarse pares concretos, con objetivos exactos, mínimos o máximos.',
  'Ajusta límites de repetición, modos de equilibrio por atributo, penalizaciones y otros detalles de restricciones.',
  'Configura límites de ejecución, semillas deterministas, familia de solver y otros ajustes de optimización.',
  'Revisa desglose de puntuación, cumplimiento de restricciones, penalizaciones y resultados guardados con más detalle.',
];

const CHROME = {
  expertWorkspaceLabel: 'Editor de escenarios',
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
      'Sí. Abre las opciones avanzadas para añadir grupos que deben permanecer juntos, reglas para evitar emparejamientos, múltiples sesiones y equilibrio por atributos. O usa el editor de escenarios para control total.',
  },
  multiSession: {
    question: '¿Puedo crear grupos para varias rondas?',
    answer:
      'Sí. Define el número de sesiones en las opciones avanzadas y activa "Evitar repeticiones" para reducir cuánto coinciden las mismas personas.',
  },
  workspace: {
    question: '¿Qué es el editor de escenarios?',
    answer:
      'El editor de escenarios sirve para controles que esta página no expone: asistencia parcial, capacidades por grupo y sesión, restricciones específicas por sesión, restricciones flexibles ponderadas, objetivos de encuentros por pareja, ajuste avanzado de restricciones, configuración del solver, resultados anteriores y análisis de resultados.',
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
      eyebrow: '¿Necesitas todavía más control?',
      title: 'Abre el editor completo de escenarios.',
      featureBullets: OPTIMIZER_FEATURES,
      featureExplanations: OPTIMIZER_FEATURE_EXPLANATIONS,
      buttonLabel: 'Abrir editor de escenarios',
      supportingText: 'Úsalo para opciones más avanzadas. Tus participantes, grupos, sesiones y reglas se mantienen cuando entras.',
    },
    faqEntries,
    chrome: CHROME,
    useCasesSection: USE_CASES_SECTION,
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
};
