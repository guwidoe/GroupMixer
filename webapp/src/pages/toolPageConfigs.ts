import { DE_TOOL_PAGE_CONTENT } from '../i18n/landing/de';
import { EN_TOOL_PAGE_CONTENT } from '../i18n/landing/en';
import { ES_TOOL_PAGE_CONTENT } from '../i18n/landing/es';
import { FR_TOOL_PAGE_CONTENT } from '../i18n/landing/fr';
import { HI_TOOL_PAGE_CONTENT } from '../i18n/landing/hi';
import { JA_TOOL_PAGE_CONTENT } from '../i18n/landing/ja';
import { ZH_TOOL_PAGE_CONTENT } from '../i18n/landing/zh';
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  type ToolPageAlternateLink,
  type ToolPageChromeContent,
  type ToolPageConfig,
  type ToolPageCardContent,
  type ToolPageDefinition,
  type ToolPageFaqEntry,
  type ToolPageHeroContent,
  type ToolPageInventoryConfig,
  type ToolPageKey,
  type ToolPageLocalizedContent,
  type ToolPageMode,
  type ToolPageOptimizerCtaContent,
  type ToolPagePreset,
  type ToolPageQuickSetupDefaults,
  type ToolPageRouteEntry,
  type ToolPageSectionContent,
  type ToolPageSectionSet,
  type ToolPageSeoContent,
} from './toolPageTypes';
import { TOOL_PAGE_DEFINITIONS_DATA } from './toolPageConfigs.data.mjs';

export * from './toolPageTypes';

function failConfig(message: string): never {
  throw new Error(`Invalid tool page config: ${message}`);
}

function assertNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failConfig(`${path} must be a non-empty string.`);
  }

  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    failConfig(`${path} must be a string.`);
  }

  return value;
}

function assertStringArray(value: unknown, path: string, options: { allowEmpty?: boolean } = {}): string[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    failConfig(`${path} must be a ${options.allowEmpty ? '' : 'non-empty '}string array.`);
  }

  return value.map((entry, index) => assertNonEmptyString(entry, `${path}[${index}]`));
}

function assertFaqEntries(value: unknown, path: string): ToolPageFaqEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    failConfig(`${path} must contain at least one FAQ entry.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      failConfig(`${path}[${index}] must be an object.`);
    }

    const record = entry as { question?: unknown; answer?: unknown; link?: unknown };
    const link = record.link;

    if (link !== undefined && (typeof link !== 'object' || link === null)) {
      failConfig(`${path}[${index}].link must be an object when provided.`);
    }

    return {
      question: assertNonEmptyString(record.question, `${path}[${index}].question`),
      answer: assertNonEmptyString(record.answer, `${path}[${index}].answer`),
      ...(link
        ? {
            link: {
              label: assertNonEmptyString((link as { label?: unknown }).label, `${path}[${index}].link.label`),
              href: assertNonEmptyString((link as { href?: unknown }).href, `${path}[${index}].link.href`),
            },
          }
        : {}),
    };
  });
}

function assertPreset(value: unknown, path: string): ToolPagePreset {
  if (value === 'random' || value === 'balanced' || value === 'networking') {
    return value;
  }

  failConfig(`${path} must be one of random, balanced, or networking.`);
}

function assertMode(value: unknown, path: string): ToolPageMode {
  if (value === 'quick-randomizer' || value === 'constraint-optimizer' || value === 'multi-round' || value === 'social-golfer') {
    return value;
  }

  failConfig(`${path} must be one of quick-randomizer, constraint-optimizer, multi-round, or social-golfer.`);
}

function assertSectionSet(value: unknown, path: string): ToolPageSectionSet {
  if (value === 'standard' || value === 'technical') {
    return value;
  }

  failConfig(`${path} must be "standard" or "technical".`);
}

function assertQuickSetupDefaults(value: unknown, path: string): ToolPageQuickSetupDefaults {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const inputMode = record.inputMode;
  const groupingMode = record.groupingMode;
  const groupingValue = record.groupingValue;
  const sessions = record.sessions;
  const advancedOpen = record.advancedOpen;
  const balanceAttributeKey = record.balanceAttributeKey;

  if (inputMode !== 'names' && inputMode !== 'csv') {
    failConfig(`${path}.inputMode must be "names" or "csv".`);
  }
  if (groupingMode !== 'groupCount' && groupingMode !== 'groupSize') {
    failConfig(`${path}.groupingMode must be "groupCount" or "groupSize".`);
  }
  if (typeof groupingValue !== 'number' || !Number.isInteger(groupingValue) || groupingValue < 1) {
    failConfig(`${path}.groupingValue must be a positive integer.`);
  }
  if (typeof sessions !== 'number' || !Number.isInteger(sessions) || sessions < 1) {
    failConfig(`${path}.sessions must be a positive integer.`);
  }
  if (typeof advancedOpen !== 'boolean') {
    failConfig(`${path}.advancedOpen must be a boolean.`);
  }
  if (balanceAttributeKey !== null && typeof balanceAttributeKey !== 'string') {
    failConfig(`${path}.balanceAttributeKey must be a string or null.`);
  }

  return {
    inputMode,
    groupingMode,
    groupingValue,
    sessions,
    advancedOpen,
    balanceAttributeKey,
    keepTogetherInput: assertString(record.keepTogetherInput, `${path}.keepTogetherInput`),
    avoidPairingsInput: assertString(record.avoidPairingsInput, `${path}.avoidPairingsInput`),
  };
}

function assertPriority(value: unknown, path: string): ToolPageInventoryConfig['priority'] {
  if (value === 'primary' || value === 'supporting') {
    return value;
  }

  failConfig(`${path} must be "primary" or "supporting".`);
}

function assertRolloutStage(value: unknown, path: string): ToolPageInventoryConfig['rolloutStage'] {
  if (value === 'live' || value === 'next' || value === 'backlog') {
    return value;
  }

  failConfig(`${path} must be "live", "next", or "backlog".`);
}

function assertLocaleList(value: unknown, path: string): SupportedLocale[] {
  if (!Array.isArray(value) || value.length === 0) {
    failConfig(`${path} must be a non-empty locale array.`);
  }

  const locales = value.map((entry, index) => {
    if (entry === 'en' || entry === 'de' || entry === 'es' || entry === 'fr' || entry === 'ja' || entry === 'hi' || entry === 'zh') {
      return entry;
    }

    failConfig(`${path}[${index}] must be one of ${SUPPORTED_LOCALES.join(', ')}.`);
  });

  return Array.from(new Set(locales));
}

export function getLocaleHrefLang(locale: SupportedLocale): string {
  if (locale === 'zh') {
    return 'zh-Hans';
  }

  return locale;
}

export function getLocaleDisplayName(locale: SupportedLocale): string {
  switch (locale) {
    case 'en':
      return 'English';
    case 'de':
      return 'Deutsch';
    case 'es':
      return 'Español';
    case 'fr':
      return 'Français';
    case 'ja':
      return '日本語';
    case 'hi':
      return 'हिन्दी';
    case 'zh':
      return '简体中文';
  }
}

function assertSeoContent(value: unknown, path: string): ToolPageSeoContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  return {
    title: assertNonEmptyString((value as { title?: unknown }).title, `${path}.title`),
    description: assertNonEmptyString((value as { description?: unknown }).description, `${path}.description`),
  };
}

function assertHeroContent(value: unknown, path: string): ToolPageHeroContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  return {
    eyebrow: assertNonEmptyString((value as { eyebrow?: unknown }).eyebrow, `${path}.eyebrow`),
    title: assertNonEmptyString((value as { title?: unknown }).title, `${path}.title`),
    subhead: assertNonEmptyString((value as { subhead?: unknown }).subhead, `${path}.subhead`),
    audienceSummary: assertString((value as { audienceSummary?: unknown }).audienceSummary, `${path}.audienceSummary`),
    trustBullets: assertStringArray((value as { trustBullets?: unknown }).trustBullets, `${path}.trustBullets`, { allowEmpty: true }),
  };
}

function assertOptimizerCtaContent(value: unknown, path: string): ToolPageOptimizerCtaContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  const featureBullets = assertStringArray((value as { featureBullets?: unknown }).featureBullets, `${path}.featureBullets`);
  const featureExplanations = assertStringArray((value as { featureExplanations?: unknown }).featureExplanations, `${path}.featureExplanations`);
  if (featureBullets.length !== featureExplanations.length) {
    failConfig(`${path}.featureExplanations must have the same length as ${path}.featureBullets.`);
  }

  return {
    eyebrow: assertNonEmptyString((value as { eyebrow?: unknown }).eyebrow, `${path}.eyebrow`),
    title: assertNonEmptyString((value as { title?: unknown }).title, `${path}.title`),
    featureBullets,
    featureExplanations,
    buttonLabel: assertNonEmptyString((value as { buttonLabel?: unknown }).buttonLabel, `${path}.buttonLabel`),
    supportingText: assertNonEmptyString((value as { supportingText?: unknown }).supportingText, `${path}.supportingText`),
  };
}

function assertChromeContent(value: unknown, path: string): ToolPageChromeContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  return {
    expertWorkspaceLabel: assertNonEmptyString((value as { expertWorkspaceLabel?: unknown }).expertWorkspaceLabel, `${path}.expertWorkspaceLabel`),
    faqHeading: assertNonEmptyString((value as { faqHeading?: unknown }).faqHeading, `${path}.faqHeading`),
    footerTagline: assertNonEmptyString((value as { footerTagline?: unknown }).footerTagline, `${path}.footerTagline`),
    feedbackLabel: assertNonEmptyString((value as { feedbackLabel?: unknown }).feedbackLabel, `${path}.feedbackLabel`),
    privacyNote: assertNonEmptyString((value as { privacyNote?: unknown }).privacyNote, `${path}.privacyNote`),
    scrollHint: assertNonEmptyString((value as { scrollHint?: unknown }).scrollHint, `${path}.scrollHint`),
  };
}

function assertCardContent(value: unknown, path: string): ToolPageCardContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  return {
    title: assertNonEmptyString((value as { title?: unknown }).title, `${path}.title`),
    body: assertNonEmptyString((value as { body?: unknown }).body, `${path}.body`),
  };
}

function assertSectionContent(value: unknown, path: string): ToolPageSectionContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  const cards = (value as { cards?: unknown }).cards;
  if (!Array.isArray(cards) || cards.length === 0) {
    failConfig(`${path}.cards must be a non-empty card array.`);
  }

  return {
    title: assertNonEmptyString((value as { title?: unknown }).title, `${path}.title`),
    description: assertNonEmptyString((value as { description?: unknown }).description, `${path}.description`),
    cards: cards.map((card, index) => assertCardContent(card, `${path}.cards[${index}]`)),
  };
}

function validateLocalizedContent(path: string, value: unknown): ToolPageLocalizedContent {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${path} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  return {
    seo: assertSeoContent(record.seo, `${path}.seo`),
    hero: assertHeroContent(record.hero, `${path}.hero`),
    optimizerCta: assertOptimizerCtaContent(record.optimizerCta, `${path}.optimizerCta`),
    faqEntries: assertFaqEntries(record.faqEntries, `${path}.faqEntries`),
    chrome: assertChromeContent(record.chrome, `${path}.chrome`),
    useCasesSection: assertSectionContent(record.useCasesSection, `${path}.useCasesSection`),
  };
}

function validateDefinition(key: ToolPageKey, value: unknown): ToolPageDefinition {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${key} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const experiment = record.experiment;
  const inventory = record.inventory;

  if (typeof experiment !== 'object' || experiment === null) {
    failConfig(`${key}.experiment must be an object.`);
  }

  if (typeof inventory !== 'object' || inventory === null) {
    failConfig(`${key}.inventory must be an object.`);
  }

  const definition: ToolPageDefinition = {
    key,
    slug: key === 'home' ? '' : assertNonEmptyString(record.slug, `${key}.slug`),
    mode: assertMode(record.mode, `${key}.mode`),
    sectionSet: assertSectionSet(record.sectionSet, `${key}.sectionSet`),
    defaultPreset: assertPreset(record.defaultPreset, `${key}.defaultPreset`),
    quickSetupDefaults: assertQuickSetupDefaults(record.quickSetupDefaults, `${key}.quickSetupDefaults`),
    liveLocales: assertLocaleList(record.liveLocales, `${key}.liveLocales`),
    experiment: {
      label: assertNonEmptyString((experiment as { label?: unknown }).label, `${key}.experiment.label`),
      futureVariants: assertStringArray((experiment as { futureVariants?: unknown }).futureVariants, `${key}.experiment.futureVariants`),
    },
    inventory: {
      searchIntent: assertNonEmptyString((inventory as { searchIntent?: unknown }).searchIntent, `${key}.inventory.searchIntent`),
      audience: assertNonEmptyString((inventory as { audience?: unknown }).audience, `${key}.inventory.audience`),
      priority: assertPriority((inventory as { priority?: unknown }).priority, `${key}.inventory.priority`),
      rolloutStage: assertRolloutStage((inventory as { rolloutStage?: unknown }).rolloutStage, `${key}.inventory.rolloutStage`),
    },
  };

  if (!definition.liveLocales.includes(DEFAULT_LOCALE)) {
    failConfig(`${key}.liveLocales must include the default locale (${DEFAULT_LOCALE}).`);
  }

  return definition;
}

export function buildToolPagePath(locale: SupportedLocale, pageKey: ToolPageKey, slug?: string): string {
  const resolvedSlug = slug ?? (pageKey === 'home' ? '' : pageKey);
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return resolvedSlug ? `${prefix}/${resolvedSlug}` : prefix || '/';
}

export function getLocaleHomePath(locale: SupportedLocale): string {
  return buildToolPagePath(locale, 'home', '');
}

const RAW_DEFINITIONS = TOOL_PAGE_DEFINITIONS_DATA as Record<ToolPageKey, unknown>;

export const TOOL_PAGE_DEFINITIONS = Object.fromEntries(
  (Object.entries(RAW_DEFINITIONS) as Array<[ToolPageKey, unknown]>).map(([key, value]) => [key, validateDefinition(key, value)]),
) as Record<ToolPageKey, ToolPageDefinition>;

const RAW_LOCALE_CONTENT: Record<SupportedLocale, Partial<Record<ToolPageKey, unknown>>> = {
  de: DE_TOOL_PAGE_CONTENT,
  en: EN_TOOL_PAGE_CONTENT,
  es: ES_TOOL_PAGE_CONTENT,
  fr: FR_TOOL_PAGE_CONTENT,
  ja: JA_TOOL_PAGE_CONTENT,
  hi: HI_TOOL_PAGE_CONTENT,
  zh: ZH_TOOL_PAGE_CONTENT,
};

const VALIDATED_LOCALE_CONTENT = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => {
    const localizedEntries = Object.entries(RAW_LOCALE_CONTENT[locale]).map(([key, value]) => [
      key,
      validateLocalizedContent(`${locale}.${key}`, value),
    ]);

    return [locale, Object.fromEntries(localizedEntries)];
  }),
) as Record<SupportedLocale, Partial<Record<ToolPageKey, ToolPageLocalizedContent>>>;

function buildAlternates(definition: ToolPageDefinition): ToolPageAlternateLink[] {
  const localizedAlternates = definition.liveLocales.map((locale) => ({
    hreflang: getLocaleHrefLang(locale),
    canonicalPath: buildToolPagePath(locale, definition.key, definition.slug),
  }));

  return [
    ...localizedAlternates,
    {
      hreflang: 'x-default',
      canonicalPath: buildToolPagePath(DEFAULT_LOCALE, definition.key, definition.slug),
    },
  ];
}

const TOOL_PAGE_CONFIG_CACHE = new Map<string, ToolPageConfig>();

export function getToolPageConfig(pageKey: ToolPageKey, locale: SupportedLocale = DEFAULT_LOCALE): ToolPageConfig {
  const cacheKey = `${locale}:${pageKey}`;
  const cached = TOOL_PAGE_CONFIG_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const definition = TOOL_PAGE_DEFINITIONS[pageKey];
  if (!definition.liveLocales.includes(locale)) {
    failConfig(`${pageKey} is not live for locale ${locale}.`);
  }

  const localizedContent = VALIDATED_LOCALE_CONTENT[locale][pageKey];
  if (!localizedContent) {
    failConfig(`Missing localized landing content for ${locale}.${pageKey}.`);
  }

  const config: ToolPageConfig = {
    ...definition,
    ...localizedContent,
    locale,
    canonicalPath: buildToolPagePath(locale, pageKey, definition.slug),
    alternates: buildAlternates(definition),
  };

  TOOL_PAGE_CONFIG_CACHE.set(cacheKey, config);
  return config;
}

export const TOOL_PAGE_CONFIGS = Object.fromEntries(
  (Object.keys(TOOL_PAGE_DEFINITIONS) as ToolPageKey[]).map((pageKey) => [pageKey, getToolPageConfig(pageKey, DEFAULT_LOCALE)]),
) as Record<ToolPageKey, ToolPageConfig>;

export const TOOL_PAGE_ROUTES = (Object.values(TOOL_PAGE_DEFINITIONS) as ToolPageDefinition[]).flatMap((definition) =>
  definition.liveLocales.map((locale) => ({
    key: definition.key,
    locale,
    path: buildToolPagePath(locale, definition.key, definition.slug),
  } satisfies ToolPageRouteEntry)),
);

const seenCanonicalPaths = new Set<string>();
for (const route of TOOL_PAGE_ROUTES) {
  if (seenCanonicalPaths.has(route.path)) {
    failConfig(`Duplicate canonicalPath detected: ${route.path}`);
  }

  seenCanonicalPaths.add(route.path);
}

export const TOOL_PAGE_INVENTORY = Object.values(TOOL_PAGE_DEFINITIONS).map(({ key, slug, mode, sectionSet, inventory, experiment, liveLocales }) => ({
  key,
  slug,
  mode,
  sectionSet,
  liveLocales,
  ...inventory,
  experimentLabel: experiment.label,
}));
