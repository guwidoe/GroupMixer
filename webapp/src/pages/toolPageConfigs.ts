export type ToolPagePreset = 'random' | 'balanced' | 'networking';

export type ToolPageKey =
  | 'home'
  | 'random-group-generator'
  | 'random-team-generator'
  | 'breakout-room-generator'
  | 'student-group-generator';

export interface ToolPageFaqEntry {
  question: string;
  answer: string;
}

export interface ToolPageConfig {
  key: ToolPageKey;
  canonicalPath: string;
  title: string;
  metaDescription: string;
  h1: string;
  subhead: string;
  intro: string;
  defaultPreset: ToolPagePreset;
  faqEntries: ToolPageFaqEntry[];
}

export const TOOL_PAGE_CONFIGS: Record<ToolPageKey, ToolPageConfig> = {
  home: {
    key: 'home',
    canonicalPath: '/',
    title: 'GroupMixer — Random Group Generator with Flexible Constraints',
    metaDescription:
      'Create random groups fast, then move into the full GroupMixer workspace when you need constraints, balancing, and repeat-session planning.',
    h1: 'Make balanced groups fast — then go deeper when you need to.',
    subhead:
      'Start with a quick participant list and rough group sizing, then continue into the expert workspace for constraints, solver controls, and detailed results.',
    intro:
      'GroupMixer is a tool-first group generator for teachers, facilitators, event hosts, and workshop organizers who need a quick first result without giving up advanced control later.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'Can I start simple and refine later?',
        answer:
          'Yes. The landing tool is meant for fast first success, while the /app workspace remains available for advanced editing, solver tuning, and result inspection.',
      },
      {
        question: 'Is this only for classrooms?',
        answer:
          'No. It also fits breakout rooms, workshops, conferences, social mixers, and any repeated group-planning workflow.',
      },
    ],
  },
  'random-group-generator': {
    key: 'random-group-generator',
    canonicalPath: '/random-group-generator',
    title: 'Random Group Generator — GroupMixer',
    metaDescription:
      'Use GroupMixer as a random group generator for classrooms, workshops, and events. Start with a simple participant list and continue into advanced grouping when needed.',
    h1: 'Random group generator for fast first drafts.',
    subhead:
      'Paste names, choose group count or size, and move from a quick setup into a deeper planning workspace when the session needs more structure.',
    intro:
      'This route is tuned for people who want a simple random group generator first, with more powerful options available only when they become useful.',
    defaultPreset: 'random',
    faqEntries: [
      {
        question: 'Can I control the number of groups or group size?',
        answer:
          'Yes. The landing shell supports both planning modes so you can think in terms that match your event setup.',
      },
      {
        question: 'What if I need constraints later?',
        answer:
          'You can continue into the advanced workspace to add constraints, solver settings, and detailed edits without switching products.',
      },
    ],
  },
  'random-team-generator': {
    key: 'random-team-generator',
    canonicalPath: '/random-team-generator',
    title: 'Random Team Generator — GroupMixer',
    metaDescription:
      'Create random teams quickly with GroupMixer, then use the advanced app for balancing, constraints, and multi-session team planning.',
    h1: 'Random team generator for workshops, projects, and events.',
    subhead:
      'Start with a fast team draft now, then bring the same setup into the advanced workspace when you need balancing and deeper control.',
    intro:
      'This route is aimed at facilitators and organizers who think in teams rather than generic groups but still want the same underlying planning power.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'Is this useful for repeated sessions?',
        answer:
          'Yes. GroupMixer is especially strong when you later need to rotate people across multiple sessions while tracking who has already met.',
      },
      {
        question: 'Do I have to learn the full app first?',
        answer:
          'No. The point of this page is to give you a simple starting surface before exposing the expert tools.',
      },
    ],
  },
  'breakout-room-generator': {
    key: 'breakout-room-generator',
    canonicalPath: '/breakout-room-generator',
    title: 'Breakout Room Generator — GroupMixer',
    metaDescription:
      'Generate breakout-room groups quickly for classes, workshops, and remote sessions. Use GroupMixer for simple setup first and advanced planning later.',
    h1: 'Breakout room generator for classes, workshops, and remote sessions.',
    subhead:
      'Get to a usable breakout-room setup quickly, then use the expert workspace if you need balancing, constraints, or repeat-session planning.',
    intro:
      'This route focuses on the breakout-room use case where time-to-first-group matters more than showing every advanced control immediately.',
    defaultPreset: 'networking',
    faqEntries: [
      {
        question: 'Can I use this for one-off breakout rooms?',
        answer:
          'Yes. The landing shell is designed to be useful even when you only need a quick single-session result.',
      },
      {
        question: 'What if I am running multiple rounds?',
        answer:
          'That is where the advanced workspace becomes especially useful because it can support more structured multi-session planning.',
      },
    ],
  },
  'student-group-generator': {
    key: 'student-group-generator',
    canonicalPath: '/student-group-generator',
    title: 'Student Group Generator — GroupMixer',
    metaDescription:
      'Create student groups quickly with GroupMixer, then move into the full app for balancing, attendance, and classroom constraints.',
    h1: 'Student group generator for teachers and classroom facilitators.',
    subhead:
      'Start with a quick list of students and rough grouping targets, then continue into the advanced workspace for classroom-specific constraints.',
    intro:
      'This route is written for classroom use where a teacher wants fast initial grouping but still needs room to handle real-world constraints later.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'Can I keep the advanced classroom workflow?',
        answer:
          'Yes. The /app workspace remains the expert cockpit, so this landing route is an easier entry point rather than a replacement.',
      },
      {
        question: 'Will this later support attendance and constraints?',
        answer:
          'Yes. The architecture is intentionally shared so the quick setup can flow into the same backend-aligned model used by the advanced app.',
      },
    ],
  },
};

export const TOOL_PAGE_ROUTES = Object.values(TOOL_PAGE_CONFIGS).map((config) => ({
  key: config.key,
  path: config.canonicalPath,
}));
