import { TOOL_PAGE_CONFIGS_DATA } from './toolPageConfigs.data.mjs';

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

export interface ToolPageConfig {
  key: ToolPageKey;
  canonicalPath: string;
  defaultPreset: ToolPagePreset;
  seo: ToolPageSeoContent;
  hero: ToolPageHeroContent;
  optimizerCta: ToolPageOptimizerCtaContent;
  faqEntries: ToolPageFaqEntry[];
  experiment: ToolPageExperimentConfig;
  inventory: ToolPageInventoryConfig;
}

function failConfig(message: string): never {
  throw new Error(`Invalid tool page config: ${message}`);
}

function assertNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    failConfig(`${path} must be a non-empty string.`);
  }

  return value;
}

function assertStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    failConfig(`${path} must be a non-empty string array.`);
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

    return {
      question: assertNonEmptyString((entry as { question?: unknown }).question, `${path}[${index}].question`),
      answer: assertNonEmptyString((entry as { answer?: unknown }).answer, `${path}[${index}].answer`),
    };
  });
}

function assertPreset(value: unknown, path: string): ToolPagePreset {
  if (value === 'random' || value === 'balanced' || value === 'networking') {
    return value;
  }

  failConfig(`${path} must be one of random, balanced, or networking.`);
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

function validateToolPageConfig(key: ToolPageKey, value: unknown): ToolPageConfig {
  if (typeof value !== 'object' || value === null) {
    failConfig(`${key} must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const seo = record.seo;
  const hero = record.hero;
  const optimizerCta = record.optimizerCta;
  const experiment = record.experiment;
  const inventory = record.inventory;

  if (typeof seo !== 'object' || seo === null) {
    failConfig(`${key}.seo must be an object.`);
  }

  if (typeof hero !== 'object' || hero === null) {
    failConfig(`${key}.hero must be an object.`);
  }

  if (typeof optimizerCta !== 'object' || optimizerCta === null) {
    failConfig(`${key}.optimizerCta must be an object.`);
  }

  if (typeof experiment !== 'object' || experiment === null) {
    failConfig(`${key}.experiment must be an object.`);
  }

  if (typeof inventory !== 'object' || inventory === null) {
    failConfig(`${key}.inventory must be an object.`);
  }

  return {
    key,
    canonicalPath: assertNonEmptyString(record.canonicalPath, `${key}.canonicalPath`),
    defaultPreset: assertPreset(record.defaultPreset, `${key}.defaultPreset`),
    seo: {
      title: assertNonEmptyString((seo as { title?: unknown }).title, `${key}.seo.title`),
      description: assertNonEmptyString((seo as { description?: unknown }).description, `${key}.seo.description`),
    },
    hero: {
      eyebrow: assertNonEmptyString((hero as { eyebrow?: unknown }).eyebrow, `${key}.hero.eyebrow`),
      title: assertNonEmptyString((hero as { title?: unknown }).title, `${key}.hero.title`),
      subhead: assertNonEmptyString((hero as { subhead?: unknown }).subhead, `${key}.hero.subhead`),
      audienceSummary: assertNonEmptyString(
        (hero as { audienceSummary?: unknown }).audienceSummary,
        `${key}.hero.audienceSummary`,
      ),
      trustBullets: assertStringArray((hero as { trustBullets?: unknown }).trustBullets, `${key}.hero.trustBullets`),
    },
    optimizerCta: {
      eyebrow: assertNonEmptyString(
        (optimizerCta as { eyebrow?: unknown }).eyebrow,
        `${key}.optimizerCta.eyebrow`,
      ),
      title: assertNonEmptyString((optimizerCta as { title?: unknown }).title, `${key}.optimizerCta.title`),
      featureBullets: assertStringArray(
        (optimizerCta as { featureBullets?: unknown }).featureBullets,
        `${key}.optimizerCta.featureBullets`,
      ),
      buttonLabel: assertNonEmptyString(
        (optimizerCta as { buttonLabel?: unknown }).buttonLabel,
        `${key}.optimizerCta.buttonLabel`,
      ),
      supportingText: assertNonEmptyString(
        (optimizerCta as { supportingText?: unknown }).supportingText,
        `${key}.optimizerCta.supportingText`,
      ),
    },
    faqEntries: assertFaqEntries(record.faqEntries, `${key}.faqEntries`),
    experiment: {
      label: assertNonEmptyString((experiment as { label?: unknown }).label, `${key}.experiment.label`),
      futureVariants: assertStringArray(
        (experiment as { futureVariants?: unknown }).futureVariants,
        `${key}.experiment.futureVariants`,
      ),
    },
    inventory: {
      searchIntent: assertNonEmptyString(
        (inventory as { searchIntent?: unknown }).searchIntent,
        `${key}.inventory.searchIntent`,
      ),
      audience: assertNonEmptyString((inventory as { audience?: unknown }).audience, `${key}.inventory.audience`),
      priority: assertPriority((inventory as { priority?: unknown }).priority, `${key}.inventory.priority`),
      rolloutStage: assertRolloutStage(
        (inventory as { rolloutStage?: unknown }).rolloutStage,
        `${key}.inventory.rolloutStage`,
      ),
    },
  };
}

const RAW_TOOL_PAGE_CONFIGS = TOOL_PAGE_CONFIGS_DATA as Record<ToolPageKey, unknown>;

export const TOOL_PAGE_CONFIGS = Object.fromEntries(
  (Object.entries(RAW_TOOL_PAGE_CONFIGS) as Array<[ToolPageKey, unknown]>).map(([key, value]) => [
    key,
    validateToolPageConfig(key, value),
  ]),
) as Record<ToolPageKey, ToolPageConfig>;

const seenCanonicalPaths = new Set<string>();
for (const config of Object.values(TOOL_PAGE_CONFIGS)) {
  if (seenCanonicalPaths.has(config.canonicalPath)) {
    failConfig(`Duplicate canonicalPath detected: ${config.canonicalPath}`);
  }

  seenCanonicalPaths.add(config.canonicalPath);
}

export const TOOL_PAGE_ROUTES = Object.values(TOOL_PAGE_CONFIGS).map(({ key, canonicalPath }) => ({
  key,
  path: canonicalPath,
}));

export const TOOL_PAGE_INVENTORY = Object.values(TOOL_PAGE_CONFIGS).map(({ key, canonicalPath, inventory, experiment }) => ({
  key,
  canonicalPath,
  ...inventory,
  experimentLabel: experiment.label,
}));
