const SHARED_TRUST_BULLETS = [
  'Private (processed in your browser)',
  'No sign-up',
  'Results in seconds',
];

const SHARED_OPTIMIZER_FEATURES = [
  'Keep together',
  'Avoid pairings',
  'Multiple rounds',
  'Maximize mixing',
  'Balance genders',
  'Tweak results',
  'Balance any attribute',
];

const FAQS = {
  free: {
    question: 'Is GroupMixer free to use?',
    answer:
      'Yes. GroupMixer is completely free. There is no sign-up, no account required, and no usage limits.',
  },
  privacy: {
    question: 'Does my data stay private?',
    answer:
      'Yes. All processing happens locally in your browser. Your names and group data are never sent to a server.',
  },
  constraints: {
    question: 'Can I add rules like keep-together or keep-apart?',
    answer:
      'Yes. Open the advanced options to add keep-together groups, avoid-pairing rules, multiple sessions, and attribute balancing. Or use the expert workspace for full control.',
  },
  multiSession: {
    question: 'Can I create groups for multiple rounds?',
    answer:
      'Yes. Set the number of sessions in the advanced options and enable "Avoid repeat pairings" to minimize how often the same people end up together.',
  },
  workspace: {
    question: 'What is the expert workspace?',
    answer:
      'The expert workspace gives you detailed control over sessions, constraints, solver settings, warm-start from previous results, and full result analysis. It uses the same powerful solver engine.',
  },
};

function createToolPageConfig({
  key,
  canonicalPath,
  title,
  metaDescription,
  heroTitle,
  subhead,
  eyebrow,
  audienceSummary,
  defaultPreset,
  faqEntries,
  searchIntent,
  audience,
  priority = 'primary',
  rolloutStage = 'live',
  experimentLabel,
  futureVariants,
}) {
  return {
    key,
    canonicalPath,
    defaultPreset,
    seo: {
      title,
      description: metaDescription,
    },
    hero: {
      eyebrow,
      title: heroTitle,
      subhead,
      audienceSummary,
      trustBullets: SHARED_TRUST_BULLETS,
    },
    optimizerCta: {
      eyebrow: 'Want to do better than random?',
      title: 'Try the full group optimizer.',
      featureBullets: SHARED_OPTIMIZER_FEATURES,
      buttonLabel: 'Open expert workspace',
      supportingText: 'Your landing-page draft comes with you.',
    },
    faqEntries,
    experiment: {
      label: experimentLabel,
      futureVariants,
    },
    inventory: {
      searchIntent,
      audience,
      priority,
      rolloutStage,
    },
  };
}

export const TOOL_PAGE_CONFIGS_DATA = {
  home: createToolPageConfig({
    key: 'home',
    canonicalPath: '/',
    title: 'Random Group Generator — Split Names into Teams Instantly | GroupMixer',
    metaDescription:
      'Free random group generator. Paste names, pick group count, and generate balanced groups in seconds. No sign-up required. Add constraints when you need them.',
    heroTitle: 'Random Group Generator',
    subhead:
      'Paste names, choose the number of groups, and generate instantly. Private, and no sign-up needed.',
    eyebrow: 'For classrooms, workshops, and events',
    audienceSummary:
      'Start with a simple random split, then add balancing, constraints, and multi-round optimization only when your session needs it.',
    defaultPreset: 'random',
    faqEntries: [
      {
        question: 'How do I split a list of names into random groups?',
        answer:
          'Paste your names (one per line) into the text box, set the number of groups or people per group, and click "Generate Groups". Your groups appear instantly.',
      },
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
      FAQS.multiSession,
      FAQS.workspace,
    ],
    searchIntent: 'random group generator',
    audience: 'teachers, facilitators, and event organizers',
    experimentLabel: 'english-home-random-group',
    futureVariants: ['headline-problem-first', 'cta-tool-vs-optimizer'],
  }),
  'random-group-generator': createToolPageConfig({
    key: 'random-group-generator',
    canonicalPath: '/random-group-generator',
    title: 'Random Group Generator — Create Groups from a List of Names | GroupMixer',
    metaDescription:
      'Free random group generator. Paste a list of names, choose how many groups, and split them instantly. Works for classrooms, workshops, and events.',
    heroTitle: 'Random Group Generator',
    subhead:
      'Paste a list of names, choose how many groups you want, and split them instantly. No sign-up, no server — everything runs in your browser.',
    eyebrow: 'For quick random splits',
    audienceSummary:
      'Ideal when you need a fast, low-friction group maker for class activities, workshop breakouts, and simple event logistics.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
    searchIntent: 'random group generator',
    audience: 'teachers, facilitators, and workshop hosts',
    experimentLabel: 'english-random-group-core',
    futureVariants: ['hero-speed-vs-fairness', 'faq-short-vs-long'],
  }),
  'random-team-generator': createToolPageConfig({
    key: 'random-team-generator',
    canonicalPath: '/random-team-generator',
    title: 'Random Team Generator — Create Balanced Teams Fast | GroupMixer',
    metaDescription:
      'Free random team generator. Paste names and create balanced teams instantly. Add rules for skill balancing, keep-together, and keep-apart when needed.',
    heroTitle: 'Random Team Generator',
    subhead:
      'Create random teams in seconds. Paste names, pick team count, and generate. Add balancing rules when you need fairer teams.',
    eyebrow: 'For coaches, leads, and facilitators',
    audienceSummary:
      'Built for team-based activities where fairness matters more than pure randomness, especially when roles or skills should be spread out.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
    searchIntent: 'random team generator',
    audience: 'coaches, facilitators, and managers',
    experimentLabel: 'english-random-team-balance',
    futureVariants: ['team-fairness-hero', 'cta-balance-emphasis'],
  }),
  'breakout-room-generator': createToolPageConfig({
    key: 'breakout-room-generator',
    canonicalPath: '/breakout-room-generator',
    title: 'Breakout Room Generator — Split Participants into Rooms | GroupMixer',
    metaDescription:
      'Free breakout room generator. Paste names and split participants into breakout rooms instantly. Great for classes, workshops, and remote meetings.',
    heroTitle: 'Breakout Room Generator',
    subhead:
      'Split participants into breakout rooms instantly. Paste names, set room count, and generate. Perfect for workshops, classes, and remote sessions.',
    eyebrow: 'For Zoom calls, trainings, and workshops',
    audienceSummary:
      'Useful when you need room assignments fast, but still want the option to rotate people across rounds and reduce repetitive pairings.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.constraints,
    ],
    searchIntent: 'breakout room generator',
    audience: 'remote facilitators and workshop hosts',
    experimentLabel: 'english-breakout-room-rotation',
    futureVariants: ['remote-call-proof', 'multi-round-emphasis'],
  }),
  'student-group-generator': createToolPageConfig({
    key: 'student-group-generator',
    canonicalPath: '/student-group-generator',
    title: 'Student Group Generator — Create Classroom Groups Fast | GroupMixer',
    metaDescription:
      'Free student group generator for teachers. Paste your class roster and create balanced student groups in seconds. Add rules for keeping students together or apart.',
    heroTitle: 'Student Group Generator',
    subhead:
      'Paste your class roster and create student groups instantly. Keep it simple or add rules like keep-together and balanced teams when needed.',
    eyebrow: 'For teachers and classroom activities',
    audienceSummary:
      'Designed for educators who need a class-friendly way to form groups quickly without giving up control over pairings or balance.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.multiSession,
    ],
    searchIntent: 'student group generator',
    audience: 'teachers and school staff',
    experimentLabel: 'english-student-group-teacher',
    futureVariants: ['teacher-proof-points', 'classroom-management-copy'],
  }),
  'speed-networking-generator': createToolPageConfig({
    key: 'speed-networking-generator',
    canonicalPath: '/speed-networking-generator',
    title: 'Speed Networking Generator — Multiple Rounds, Less Repetition | GroupMixer',
    metaDescription:
      'Free speed networking generator. Create multiple rounds where participants meet new people each time. Minimize repeat pairings automatically.',
    heroTitle: 'Speed Networking Generator',
    subhead:
      'Generate multiple networking rounds where people meet new faces each time. Paste names, set rounds, and minimize repeat pairings.',
    eyebrow: 'For mixers, meetups, and networking sessions',
    audienceSummary:
      'Best for structured networking formats where the goal is to create new connections instead of repeating the same small groups.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
    searchIntent: 'speed networking generator',
    audience: 'event organizers and community hosts',
    experimentLabel: 'english-speed-networking-rounds',
    futureVariants: ['repeat-pairing-emphasis', 'event-format-proof'],
  }),
  'group-generator-with-constraints': createToolPageConfig({
    key: 'group-generator-with-constraints',
    canonicalPath: '/group-generator-with-constraints',
    title: 'Group Generator with Constraints — Keep Together, Keep Apart, Balance | GroupMixer',
    metaDescription:
      'Free group generator with constraints. Add keep-together, keep-apart, balanced teams, and no-repeat-pairing rules. Paste names and generate smart groups.',
    heroTitle: 'Group Generator with Constraints',
    subhead:
      'Create groups with rules. Keep people together, keep them apart, balance by attribute, and avoid repeat pairings across rounds.',
    eyebrow: 'For higher-stakes group planning',
    audienceSummary:
      'Use this version when the assignment itself matters: preserving pairings, avoiding conflicts, balancing attributes, or rotating across sessions.',
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
      FAQS.free,
      FAQS.privacy,
      FAQS.workspace,
    ],
    searchIntent: 'group generator with constraints',
    audience: 'facilitators and planners with assignment rules',
    priority: 'supporting',
    experimentLabel: 'english-constraints-power',
    futureVariants: ['rules-first-hero', 'advanced-workspace-bridge'],
  }),
};
