export const DEFAULT_LOCALE = 'en' as const;
export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'ja', 'hi', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type ToolPagePreset = 'random' | 'balanced' | 'networking';

export type ToolPageKey =
  | 'home'
  | 'random-group-generator'
  | 'random-team-generator'
  | 'random-pair-generator'
  | 'team-shuffle-generator'
  | 'breakout-room-generator'
  | 'workshop-group-generator'
  | 'student-group-generator'
  | 'icebreaker-group-generator'
  | 'speed-networking-generator'
  | 'group-generator-with-constraints';

export interface ToolPageFaqEntry {
  question: string;
  answer: string;
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

export interface ToolPageAdvancedSectionContent extends ToolPageSectionContent {
  buttonLabel: string;
  supportingText: string;
}

export interface ToolPageLocalizedContent {
  seo: ToolPageSeoContent;
  hero: ToolPageHeroContent;
  optimizerCta: ToolPageOptimizerCtaContent;
  faqEntries: ToolPageFaqEntry[];
  chrome: ToolPageChromeContent;
  useCasesSection: ToolPageSectionContent;
  advancedSection: ToolPageAdvancedSectionContent;
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

export interface ToolPageDefinition {
  key: ToolPageKey;
  slug: string;
  defaultPreset: ToolPagePreset;
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
