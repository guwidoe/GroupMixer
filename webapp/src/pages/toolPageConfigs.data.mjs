const QUICK_RANDOMIZER_DEFAULTS = {
  inputMode: 'names',
  groupingMode: 'groupCount',
  groupingValue: 4,
  sessions: 1,
  advancedOpen: false,
  balanceAttributeKey: null,
  keepTogetherInput: '',
  avoidPairingsInput: '',
};

const NETWORKING_DEFAULTS = {
  ...QUICK_RANDOMIZER_DEFAULTS,
  sessions: 3,
};

const MULTI_ROUND_DEFAULTS = {
  ...QUICK_RANDOMIZER_DEFAULTS,
  groupingMode: 'groupSize',
  groupingValue: 4,
  sessions: 4,
  advancedOpen: true,
};

const TECHNICAL_CSV_DEFAULTS = {
  ...QUICK_RANDOMIZER_DEFAULTS,
  inputMode: 'csv',
  groupingMode: 'groupSize',
  groupingValue: 4,
  sessions: 3,
  advancedOpen: true,
  balanceAttributeKey: 'role',
};

const CONSTRAINT_CSV_DEFAULTS = {
  ...TECHNICAL_CSV_DEFAULTS,
  keepTogetherInput: 'Alex, Sam',
  avoidPairingsInput: 'Ella, Jordan',
};

const SOCIAL_GOLFER_DEFAULTS = {
  ...QUICK_RANDOMIZER_DEFAULTS,
  groupingMode: 'groupSize',
  groupingValue: 4,
  sessions: 5,
  advancedOpen: true,
};

export const TOOL_PAGE_DEFINITIONS_DATA = {
  home: {
    key: 'home',
    slug: '',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'random',
    quickSetupDefaults: QUICK_RANDOMIZER_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-home-random-group',
      futureVariants: ['headline-scenario-first', 'cta-tool-vs-optimizer'],
    },
    inventory: {
      searchIntent: 'random group generator',
      audience: 'teachers, facilitators, and event organizers',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'random-group-generator': {
    key: 'random-group-generator',
    slug: 'random-group-generator',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'random',
    quickSetupDefaults: QUICK_RANDOMIZER_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-random-group-core',
      futureVariants: ['hero-speed-vs-fairness', 'faq-short-vs-long'],
    },
    inventory: {
      searchIntent: 'random group generator',
      audience: 'teachers, facilitators, and workshop hosts',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'random-team-generator': {
    key: 'random-team-generator',
    slug: 'random-team-generator',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'balanced',
    quickSetupDefaults: QUICK_RANDOMIZER_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-random-team-balance',
      futureVariants: ['team-fairness-hero', 'cta-balance-emphasis'],
    },
    inventory: {
      searchIntent: 'random team generator',
      audience: 'coaches, facilitators, and managers',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'random-pair-generator': {
    key: 'random-pair-generator',
    slug: 'random-pair-generator',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'random',
    quickSetupDefaults: { ...QUICK_RANDOMIZER_DEFAULTS, groupingMode: 'groupSize', groupingValue: 2 },
    liveLocales: ['en'],
    experiment: {
      label: 'english-random-pair-partners',
      futureVariants: ['pairing-speed-hero', 'rotation-proof-points'],
    },
    inventory: {
      searchIntent: 'random pair generator',
      audience: 'teachers, trainers, and facilitators running partner activities',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'breakout-room-generator': {
    key: 'breakout-room-generator',
    slug: 'breakout-room-generator',
    mode: 'multi-round',
    sectionSet: 'standard',
    defaultPreset: 'networking',
    quickSetupDefaults: NETWORKING_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-breakout-room-rotation',
      futureVariants: ['remote-call-proof', 'multi-round-emphasis'],
    },
    inventory: {
      searchIntent: 'breakout room generator',
      audience: 'remote facilitators and workshop hosts',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'workshop-group-generator': {
    key: 'workshop-group-generator',
    slug: 'workshop-group-generator',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'balanced',
    quickSetupDefaults: QUICK_RANDOMIZER_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-workshop-groups-facilitator',
      futureVariants: ['workshop-outcomes-hero', 'multi-round-vs-constraint-copy'],
    },
    inventory: {
      searchIntent: 'workshop group generator',
      audience: 'workshop facilitators and training teams',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'student-group-generator': {
    key: 'student-group-generator',
    slug: 'student-group-generator',
    mode: 'quick-randomizer',
    sectionSet: 'standard',
    defaultPreset: 'balanced',
    quickSetupDefaults: QUICK_RANDOMIZER_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-student-group-teacher',
      futureVariants: ['teacher-proof-points', 'classroom-management-copy'],
    },
    inventory: {
      searchIntent: 'student group generator',
      audience: 'teachers and school staff',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'speed-networking-generator': {
    key: 'speed-networking-generator',
    slug: 'speed-networking-generator',
    mode: 'multi-round',
    sectionSet: 'standard',
    defaultPreset: 'networking',
    quickSetupDefaults: NETWORKING_DEFAULTS,
    liveLocales: ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'],
    experiment: {
      label: 'english-speed-networking-rounds',
      futureVariants: ['repeat-pairing-emphasis', 'event-format-proof'],
    },
    inventory: {
      searchIntent: 'speed networking generator',
      audience: 'event organizers and community hosts',
      priority: 'primary',
      rolloutStage: 'live',
    },
  },
  'group-generator-with-constraints': {
    key: 'group-generator-with-constraints',
    slug: 'group-generator-with-constraints',
    mode: 'constraint-optimizer',
    sectionSet: 'standard',
    defaultPreset: 'balanced',
    quickSetupDefaults: CONSTRAINT_CSV_DEFAULTS,
    liveLocales: ['en'],
    experiment: {
      label: 'english-constraints-power',
      futureVariants: ['rules-first-hero', 'advanced-workspace-bridge'],
    },
    inventory: {
      searchIntent: 'group generator with constraints',
      audience: 'facilitators and planners with assignment rules',
      priority: 'supporting',
      rolloutStage: 'live',
    },
  },
};
