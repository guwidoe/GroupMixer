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
};
