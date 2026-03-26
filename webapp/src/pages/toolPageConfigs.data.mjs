export const TOOL_PAGE_DEFINITIONS_DATA = {
  home: {
    key: 'home',
    slug: '',
    defaultPreset: 'random',
    liveLocales: ['en', 'es', 'fr'],
    experiment: {
      label: 'english-home-random-group',
      futureVariants: ['headline-problem-first', 'cta-tool-vs-optimizer'],
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
    defaultPreset: 'random',
    liveLocales: ['en', 'es', 'fr'],
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
    defaultPreset: 'balanced',
    liveLocales: ['en', 'es', 'fr'],
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
    defaultPreset: 'random',
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
  'team-shuffle-generator': {
    key: 'team-shuffle-generator',
    slug: 'team-shuffle-generator',
    defaultPreset: 'balanced',
    liveLocales: ['en'],
    experiment: {
      label: 'english-team-shuffle-remix',
      futureVariants: ['remix-language-vs-balance-language', 'fairness-chip-order'],
    },
    inventory: {
      searchIntent: 'team shuffle generator',
      audience: 'coaches, managers, and workshop facilitators',
      priority: 'supporting',
      rolloutStage: 'live',
    },
  },
  'breakout-room-generator': {
    key: 'breakout-room-generator',
    slug: 'breakout-room-generator',
    defaultPreset: 'networking',
    liveLocales: ['en', 'es', 'fr'],
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
    defaultPreset: 'balanced',
    liveLocales: ['en', 'es', 'fr'],
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
    defaultPreset: 'balanced',
    liveLocales: ['en', 'es', 'fr'],
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
  'icebreaker-group-generator': {
    key: 'icebreaker-group-generator',
    slug: 'icebreaker-group-generator',
    defaultPreset: 'networking',
    liveLocales: ['en'],
    experiment: {
      label: 'english-icebreaker-quick-groups',
      futureVariants: ['warmup-language-vs-networking-language', 'short-vs-detailed-subhead'],
    },
    inventory: {
      searchIntent: 'icebreaker group generator',
      audience: 'facilitators, teachers, and event hosts',
      priority: 'supporting',
      rolloutStage: 'live',
    },
  },
  'speed-networking-generator': {
    key: 'speed-networking-generator',
    slug: 'speed-networking-generator',
    defaultPreset: 'networking',
    liveLocales: ['en', 'es', 'fr'],
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
    defaultPreset: 'balanced',
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
