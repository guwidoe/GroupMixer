export const DEFAULT_LOCALE = 'en' as const;
export const SUPPORTED_LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'hi', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type ToolPagePreset = 'random' | 'balanced' | 'networking';
export type ToolPageMode = 'quick-randomizer' | 'constraint-optimizer' | 'multi-round' | 'social-golfer';
export type ToolPageSectionSet = 'standard' | 'technical';

export type ToolPageKey = 'home';

export interface ToolPageFaqEntry {
  question: string;
  answer: string;
  link?: {
    label: string;
    href: string;
  };
}

export interface ToolPageSeoContent {
  title: string;
  description: string;
}

export interface ToolPageHeroContent {
  eyebrow: string;
  title: string;
  subhead: string;
  audienceSummary: string;
  trustBullets: string[];
}

export interface ToolPageOptimizerCtaContent {
  eyebrow: string;
  title: string;
  featureBullets: string[];
  featureExplanations: string[];
  buttonLabel: string;
  supportingText: string;
}

export interface ToolPageChromeContent {
  expertWorkspaceLabel: string;
  faqHeading: string;
  footerTagline: string;
  feedbackLabel: string;
  privacyNote: string;
  scrollHint: string;
}

export interface ToolPageCardContent {
  title: string;
  body: string;
}

export interface ToolPageSectionContent {
  title: string;
  description: string;
  cards: ToolPageCardContent[];
}

export interface ToolPageQuickSetupUiContent {
  participantsLabel: string;
  participantsHelp: string;
  nameColumnLabel: string;
  addAttributeLabel: string;
  ghostAttributeDisplayLabel: string;
  attributeNamePlaceholder: string;
  ghostAttributeValuesPreview: string;
  removeAttributeLabel: string;
  removeAttributeConfirmMessage: string;
  attributeColumnDefaultLabel: string;
  switchToCsvLabel: string;
  switchToNamesLabel: string;
  sampleLabel: string;
  resetLabel: string;
  clearAllLabel: string;
  clearAllConfirmMessage: string;
  namesPlaceholder: string;
  csvPlaceholder: string;
  groupingValueGroupCountLabel: string;
  groupingValueGroupSizeLabel: string;
  groupingToggleToGroupSizeLabel: string;
  groupingToggleToGroupCountLabel: string;
  peopleStatLabel: string;
  groupsStatLabel: string;
  approxSizeStatLabel: string;
  generateGroupsLabel: string;
  generatingLabel: string;
  reshuffleLabel: string;
  resultsGeneratedHint: string;
}

export interface ToolPageAdvancedOptionsUiContent {
  title: string;
  description: string;
  showLabel: string;
  hideLabel: string;
  sessionsLabel: string;
  sessionsHelp: string;
  avoidRepeatPairingsLabel: string;
  avoidRepeatPairingsDescription: string;
  keepTogetherLabel: string;
  keepTogetherHelp: string;
  keepTogetherPlaceholder: string;
  avoidPairingLabel: string;
  avoidPairingHelp: string;
  avoidPairingPlaceholder: string;
  balanceGroupsByAttributeLabel: string;
  balanceGroupsByAttributeHelp: string;
  balanceGroupsEmptyState: string;
  autoDistributeAttributeLabel: string;
  fixedPeopleLabel: string;
  fixedPeopleHelp: string;
  fixedPeopleDescription: string;
  addFixedPersonLabel: string;
  fixedPersonNameLabel: string;
  fixedPersonGroupLabel: string;
  fixedPersonSelectPlaceholder: string;
  fixedGroupSelectPlaceholder: string;
  removeFixedPersonLabel: string;
  noBalancingLabel: string;
  ignoredNamesPrefix: string;
}

export interface ToolPageResultsUiContent {
  yourGroupsHeading: string;
  exportCsvLabel: string;
  openInExpertWorkspaceLabel: string;
  resultFormatsAriaLabel: string;
  cardsFormatLabel: string;
  listFormatLabel: string;
  textFormatLabel: string;
  linesFormatLabel: string;
  csvFormatLabel: string;
  copiedLabel: string;
  copyTextLabel: string;
  copyCsvLabel: string;
  sessionHeadingTemplate: string;
  peopleAssignedTemplate: string;
  groupPeopleCountTemplate: string;
  noAssignmentsLabel: string;
  plainTextDescription: string;
  lineTextDescription: string;
  csvDescription: string;
  textResultsAriaLabel: string;
  lineTextResultsAriaLabel: string;
  csvResultsAriaLabel: string;
  csvHeaderSession: string;
  csvHeaderGroup: string;
  csvHeaderMembers: string;
  solverFallbackMessage: string;
}

export interface ToolPageSharedUiContent {
  quickSetup: ToolPageQuickSetupUiContent;
  advancedOptions: ToolPageAdvancedOptionsUiContent;
  results: ToolPageResultsUiContent;
}

export interface ToolPageLocalizedContent {
  seo: ToolPageSeoContent;
  hero: ToolPageHeroContent;
  optimizerCta: ToolPageOptimizerCtaContent;
  faqEntries: ToolPageFaqEntry[];
  chrome: ToolPageChromeContent;
  useCasesSection: ToolPageSectionContent;
}

export interface ToolPageExperimentConfig {
  label: string;
  futureVariants: string[];
}

export interface ToolPageInventoryConfig {
  searchIntent: string;
  audience: string;
  priority: 'primary' | 'supporting';
  rolloutStage: 'live' | 'next' | 'backlog';
}

export interface ToolPageQuickSetupDefaults {
  inputMode: 'names' | 'csv';
  groupingMode: 'groupCount' | 'groupSize';
  groupingValue: number;
  sessions: number;
  advancedOpen: boolean;
  balanceAttributeKey: string | null;
  keepTogetherInput: string;
  avoidPairingsInput: string;
}

export interface ToolPageDefinition {
  key: ToolPageKey;
  slug: string;
  mode: ToolPageMode;
  sectionSet: ToolPageSectionSet;
  defaultPreset: ToolPagePreset;
  quickSetupDefaults: ToolPageQuickSetupDefaults;
  liveLocales: SupportedLocale[];
  experiment: ToolPageExperimentConfig;
  inventory: ToolPageInventoryConfig;
}

export interface ToolPageAlternateLink {
  hreflang: string;
  canonicalPath: string;
}

export interface ToolPageConfig extends ToolPageDefinition, ToolPageLocalizedContent {
  locale: SupportedLocale;
  canonicalPath: string;
  alternates: ToolPageAlternateLink[];
}

export interface ToolPageRouteEntry {
  key: ToolPageKey;
  locale: SupportedLocale;
  path: string;
}
