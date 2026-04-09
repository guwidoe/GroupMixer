import type { RuntimeSolverDescriptor } from '../runtime';
import { LOCAL_SEARCH_METRIC_SECTION, LOCAL_SEARCH_SETTINGS_SECTION, summarizeLocalSearchSettings } from './localSearch';
import { SOLVER1_UI_SPEC, summarizeSolver1Settings } from './solver1';
import { SOLVER3_UI_SPEC, summarizeSolver3Settings } from './solver3';
import { getAcceptedSolverFamilyIds, normalizeSolverFamilyId } from './translate';
import type {
  SolverCatalogEntry,
  SolverFamilyId,
  SolverSettingsSummaryRow,
  SolverUiCapabilitySummary,
  SolverUiSpec,
} from './types';
import { UNIVERSAL_METRIC_SECTION, UNIVERSAL_SETTINGS_SECTION, summarizeUniversalSettings } from './universal';

const SOLVER_UI_SPECS: Record<'solver1' | 'solver3', SolverUiSpec> = {
  solver1: {
    ...SOLVER1_UI_SPEC,
    settingsSections: [UNIVERSAL_SETTINGS_SECTION, LOCAL_SEARCH_SETTINGS_SECTION, ...SOLVER1_UI_SPEC.settingsSections],
    liveMetricSections: [UNIVERSAL_METRIC_SECTION, LOCAL_SEARCH_METRIC_SECTION, ...SOLVER1_UI_SPEC.liveMetricSections],
    summarizeSettings: (settings) => [
      ...summarizeUniversalSettings(settings),
      ...summarizeLocalSearchSettings(settings),
      ...summarizeSolver1Settings(settings),
    ],
  },
  solver3: {
    ...SOLVER3_UI_SPEC,
    settingsSections: [UNIVERSAL_SETTINGS_SECTION, LOCAL_SEARCH_SETTINGS_SECTION, ...SOLVER3_UI_SPEC.settingsSections],
    liveMetricSections: [UNIVERSAL_METRIC_SECTION, LOCAL_SEARCH_METRIC_SECTION, ...SOLVER3_UI_SPEC.liveMetricSections],
    summarizeSettings: (settings) => [
      ...summarizeUniversalSettings(settings),
      ...summarizeLocalSearchSettings(settings),
      ...summarizeSolver3Settings(settings),
    ],
  },
};

function descriptorCapabilitiesToUiSummary(descriptor?: RuntimeSolverDescriptor | null): SolverUiCapabilitySummary {
  return {
    supportsInitialSchedule: descriptor?.capabilities.supports_initial_schedule ?? false,
    supportsProgressCallback: descriptor?.capabilities.supports_progress_callback ?? false,
    supportsBenchmarkObserver: descriptor?.capabilities.supports_benchmark_observer ?? false,
    supportsRecommendedSettings: descriptor?.capabilities.supports_recommended_settings ?? false,
    supportsDeterministicSeed: descriptor?.capabilities.supports_deterministic_seed ?? false,
  };
}

export function getSolverUiSpec(familyId: SolverFamilyId | null | undefined): SolverUiSpec | null {
  if (!familyId) {
    return null;
  }

  return SOLVER_UI_SPECS[familyId as keyof typeof SOLVER_UI_SPECS] ?? null;
}

export function getSolverUiSpecForSettings(solverType: string | undefined | null): SolverUiSpec | null {
  return getSolverUiSpec(normalizeSolverFamilyId(solverType));
}

export function buildSolverCatalogEntry(descriptor: RuntimeSolverDescriptor): SolverCatalogEntry {
  const familyId = normalizeSolverFamilyId(descriptor.canonical_id) ?? descriptor.canonical_id as SolverFamilyId;
  const spec = getSolverUiSpec(familyId);
  return {
    id: familyId,
    displayName: descriptor.display_name,
    acceptedConfigIds: descriptor.accepted_config_ids,
    notes: descriptor.notes,
    capabilities: descriptorCapabilitiesToUiSummary(descriptor),
    uiSpecAvailable: spec !== null,
    experimental: familyId !== 'solver1',
  };
}

export function buildSolverCatalog(descriptors: RuntimeSolverDescriptor[]): readonly SolverCatalogEntry[] {
  return descriptors
    .map(buildSolverCatalogEntry)
    .filter((entry) => entry.uiSpecAvailable || entry.id === 'solver1' || entry.id === 'solver3');
}

export function getFallbackSolverCatalog(): readonly SolverCatalogEntry[] {
  return [
    {
      id: 'solver1',
      displayName: 'Solver 1',
      acceptedConfigIds: getAcceptedSolverFamilyIds('solver1'),
      notes: 'Current production solver family backed by simulated annealing.',
      capabilities: {
        supportsInitialSchedule: true,
        supportsProgressCallback: true,
        supportsBenchmarkObserver: true,
        supportsRecommendedSettings: true,
        supportsDeterministicSeed: true,
      },
      uiSpecAvailable: true,
      experimental: false,
    },
    {
      id: 'solver3',
      displayName: 'Solver 3',
      acceptedConfigIds: getAcceptedSolverFamilyIds('solver3'),
      notes: 'Alternative dense-state solver family. Recommendation is currently unsupported.',
      capabilities: {
        supportsInitialSchedule: true,
        supportsProgressCallback: true,
        supportsBenchmarkObserver: true,
        supportsRecommendedSettings: false,
        supportsDeterministicSeed: true,
      },
      uiSpecAvailable: true,
      experimental: true,
    },
  ];
}

export function summarizeSolverSettings(settings: Parameters<SolverUiSpec['summarizeSettings']>[0]): readonly SolverSettingsSummaryRow[] {
  const spec = getSolverUiSpecForSettings(settings.solver_type);
  return spec?.summarizeSettings(settings) ?? summarizeUniversalSettings(settings);
}
