export type ToolPagePreset = 'random' | 'balanced' | 'networking';

export type ToolPageKey =
  | 'home'
  | 'random-group-generator'
  | 'random-team-generator'
  | 'breakout-room-generator'
  | 'student-group-generator'
  | 'speed-networking-generator'
  | 'group-generator-with-constraints';

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
  defaultPreset: ToolPagePreset;
  faqEntries: ToolPageFaqEntry[];
}

// ─── Shared FAQ entries used across multiple pages ───

const FAQ_FREE: ToolPageFaqEntry = {
  question: 'Is GroupMixer free to use?',
  answer:
    'Yes. GroupMixer is completely free. There is no sign-up, no account required, and no usage limits.',
};

const FAQ_PRIVACY: ToolPageFaqEntry = {
  question: 'Does my data stay private?',
  answer:
    'Yes. All processing happens locally in your browser. Your names and group data are never sent to a server.',
};

const FAQ_CONSTRAINTS: ToolPageFaqEntry = {
  question: 'Can I add rules like keep-together or keep-apart?',
  answer:
    'Yes. Open the advanced options to add keep-together groups, avoid-pairing rules, multiple sessions, and attribute balancing. Or use the expert workspace for full control.',
};

const FAQ_MULTIPLE_ROUNDS: ToolPageFaqEntry = {
  question: 'Can I create groups for multiple rounds?',
  answer:
    'Yes. Set the number of sessions in the advanced options and enable "Avoid repeat pairings" to minimize how often the same people end up together.',
};

const FAQ_EXPERT: ToolPageFaqEntry = {
  question: 'What is the expert workspace?',
  answer:
    'The expert workspace gives you detailed control over sessions, constraints, solver settings, warm-start from previous results, and full result analysis. It uses the same powerful solver engine.',
};

// ─── Page configs ───

export const TOOL_PAGE_CONFIGS: Record<ToolPageKey, ToolPageConfig> = {
  home: {
    key: 'home',
    canonicalPath: '/',
    title: 'Random Group Generator — Split Names into Teams Instantly | GroupMixer',
    metaDescription:
      'Free random group generator. Paste names, pick group count, and generate balanced groups in seconds. No sign-up required. Add constraints when you need them.',
    h1: 'Random Group Generator',
    subhead:
      'Paste names, choose the number of groups, and generate instantly. Free, private, and no sign-up needed.',
    defaultPreset: 'random',
    faqEntries: [
      {
        question: 'How do I split a list of names into random groups?',
        answer:
          'Paste your names (one per line) into the text box, set the number of groups or people per group, and click "Generate Groups". Your groups appear instantly.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_CONSTRAINTS,
      FAQ_MULTIPLE_ROUNDS,
      FAQ_EXPERT,
    ],
  },

  'random-group-generator': {
    key: 'random-group-generator',
    canonicalPath: '/random-group-generator',
    title: 'Random Group Generator — Create Groups from a List of Names | GroupMixer',
    metaDescription:
      'Free random group generator. Paste a list of names, choose how many groups, and split them instantly. Works for classrooms, workshops, and events.',
    h1: 'Random Group Generator',
    subhead:
      'Paste a list of names, choose how many groups you want, and split them instantly. No sign-up, no server — everything runs in your browser.',
    defaultPreset: 'random',
    faqEntries: [
      {
        question: 'How does the random group generator work?',
        answer:
          'Paste names into the text box (one per line), set the number of groups or the size per group, and click Generate. GroupMixer creates a balanced random split instantly.',
      },
      {
        question: 'Can I control the number of groups or group size?',
        answer:
          'Yes. You can either set a fixed number of groups or specify how many people you want per group. GroupMixer handles the math for you.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_CONSTRAINTS,
    ],
  },

  'random-team-generator': {
    key: 'random-team-generator',
    canonicalPath: '/random-team-generator',
    title: 'Random Team Generator — Create Balanced Teams Fast | GroupMixer',
    metaDescription:
      'Free random team generator. Paste names and create balanced teams instantly. Add rules for skill balancing, keep-together, and keep-apart when needed.',
    h1: 'Random Team Generator',
    subhead:
      'Create random teams in seconds. Paste names, pick team count, and generate. Add balancing rules when you need fairer teams.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'How do I create random teams?',
        answer:
          'Paste your participant names, set the number of teams, and click Generate. GroupMixer splits them into balanced teams instantly.',
      },
      {
        question: 'Can I balance teams by skill or role?',
        answer:
          'Yes. Switch to CSV input mode and add columns like "role" or "skill". Then use the balance-by-attribute option to distribute those attributes evenly.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_MULTIPLE_ROUNDS,
    ],
  },

  'breakout-room-generator': {
    key: 'breakout-room-generator',
    canonicalPath: '/breakout-room-generator',
    title: 'Breakout Room Generator — Split Participants into Rooms | GroupMixer',
    metaDescription:
      'Free breakout room generator. Paste names and split participants into breakout rooms instantly. Great for classes, workshops, and remote meetings.',
    h1: 'Breakout Room Generator',
    subhead:
      'Split participants into breakout rooms instantly. Paste names, set room count, and generate. Perfect for workshops, classes, and remote sessions.',
    defaultPreset: 'networking',
    faqEntries: [
      {
        question: 'How do I create breakout rooms?',
        answer:
          'Paste participant names, choose the number of rooms, and click Generate. GroupMixer assigns everyone to rooms instantly.',
      },
      {
        question: 'Can I rotate people across multiple breakout rounds?',
        answer:
          'Yes. Set the number of sessions in the advanced options and enable "Avoid repeat pairings" so people meet new faces each round.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_CONSTRAINTS,
    ],
  },

  'student-group-generator': {
    key: 'student-group-generator',
    canonicalPath: '/student-group-generator',
    title: 'Student Group Generator — Create Classroom Groups Fast | GroupMixer',
    metaDescription:
      'Free student group generator for teachers. Paste your class roster and create balanced student groups in seconds. Add rules for keeping students together or apart.',
    h1: 'Student Group Generator',
    subhead:
      'Paste your class roster and create student groups instantly. Keep it simple or add rules like keep-together and balanced teams when needed.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'How do I create student groups?',
        answer:
          'Paste student names (one per line), choose the number of groups, and click Generate. GroupMixer handles the rest.',
      },
      {
        question: 'Can I keep certain students together or apart?',
        answer:
          'Yes. Open the advanced options to specify keep-together and avoid-pairing rules. The solver respects these when creating groups.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_MULTIPLE_ROUNDS,
    ],
  },

  'speed-networking-generator': {
    key: 'speed-networking-generator',
    canonicalPath: '/speed-networking-generator',
    title: 'Speed Networking Generator — Multiple Rounds, Less Repetition | GroupMixer',
    metaDescription:
      'Free speed networking generator. Create multiple rounds where participants meet new people each time. Minimize repeat pairings automatically.',
    h1: 'Speed Networking Generator',
    subhead:
      'Generate multiple networking rounds where people meet new faces each time. Paste names, set rounds, and minimize repeat pairings.',
    defaultPreset: 'networking',
    faqEntries: [
      {
        question: 'How does the speed networking generator work?',
        answer:
          'Paste participant names, set the number of rounds (sessions), and enable "Avoid repeat pairings". GroupMixer creates groups for each round while minimizing how often the same people meet.',
      },
      {
        question: 'Can I control group size for networking rounds?',
        answer:
          'Yes. Set either the number of groups per round or the people per group. GroupMixer calculates the rest.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_EXPERT,
    ],
  },

  'group-generator-with-constraints': {
    key: 'group-generator-with-constraints',
    canonicalPath: '/group-generator-with-constraints',
    title: 'Group Generator with Constraints — Keep Together, Keep Apart, Balance | GroupMixer',
    metaDescription:
      'Free group generator with constraints. Add keep-together, keep-apart, balanced teams, and no-repeat-pairing rules. Paste names and generate smart groups.',
    h1: 'Group Generator with Constraints',
    subhead:
      'Create groups with rules. Keep people together, keep them apart, balance by attribute, and avoid repeat pairings across rounds.',
    defaultPreset: 'balanced',
    faqEntries: [
      {
        question: 'What constraints can I set?',
        answer:
          'You can keep certain people together, keep others apart, avoid repeat pairings across sessions, and balance groups by any CSV column (like role, skill, or department).',
      },
      {
        question: 'Do I need the expert workspace for constraints?',
        answer:
          'No. Basic constraints are available right here in the advanced options. The expert workspace adds deeper control for complex planning.',
      },
      FAQ_FREE,
      FAQ_PRIVACY,
      FAQ_MULTIPLE_ROUNDS,
    ],
  },
};

export const TOOL_PAGE_ROUTES = Object.values(TOOL_PAGE_CONFIGS).map((config) => ({
  key: config.key,
  path: config.canonicalPath,
}));
