import type { SolverSettings } from '../types';

export type SolverFamilyId = 'legacy_simulated_annealing';
export type SolverParameterFormInputKey = 'initialTemp' | 'finalTemp' | 'reheatCycles' | 'reheat';

export interface SolverCapabilitySummary {
  supportsInitialSchedule: boolean;
  supportsProgressCallback: boolean;
  supportsBenchmarkObserver: boolean;
  supportsRecommendedSettings: boolean;
  supportsDeterministicSeed: boolean;
}

export interface SolverCatalogEntry {
  id: SolverFamilyId;
  displayName: string;
  acceptedConfigIds: readonly string[];
  notes: string;
  capabilities: SolverCapabilitySummary;
}

export interface SolverParameterFieldMetadata {
  formInputKey: SolverParameterFormInputKey;
  label: string;
  tooltip: string;
  min: string;
  max: string;
  step?: string;
  placeholder?: string;
  defaultValue: string;
  parse: (raw: string) => number;
  isValid: (value: number) => boolean;
  getValue: (settings: SolverSettings) => number;
  applyValue: (settings: SolverSettings, value: number) => SolverSettings;
}

type RawSimulatedAnnealingParams = {
  solver_type?: string;
  initial_temperature: number;
  final_temperature: number;
  cooling_schedule: string;
  reheat_cycles?: number;
  reheat_after_no_improvement?: number;
};

const LEGACY_SIMULATED_ANNEALING_ENTRY: SolverCatalogEntry = {
  id: 'legacy_simulated_annealing',
  displayName: 'Legacy Simulated Annealing',
  acceptedConfigIds: ['legacy_simulated_annealing', 'simulated_annealing', 'SimulatedAnnealing'],
  notes: 'Current production Rust solver engine backed by the legacy State + simulated annealing search implementation.',
  capabilities: {
    supportsInitialSchedule: true,
    supportsProgressCallback: true,
    supportsBenchmarkObserver: true,
    supportsRecommendedSettings: true,
    supportsDeterministicSeed: true,
  },
};

const SOLVER_CATALOG: readonly SolverCatalogEntry[] = [LEGACY_SIMULATED_ANNEALING_ENTRY];

function withLegacySimulatedAnnealingParams(
  settings: SolverSettings,
  update: (params: NonNullable<SolverSettings['solver_params']['SimulatedAnnealing']>) => NonNullable<SolverSettings['solver_params']['SimulatedAnnealing']>,
): SolverSettings {
  const current = settings.solver_params.SimulatedAnnealing ?? {
    initial_temperature: 1.0,
    final_temperature: 0.01,
    cooling_schedule: 'geometric' as const,
    reheat_cycles: 0,
    reheat_after_no_improvement: 0,
  };

  return {
    ...settings,
    solver_params: {
      ...settings.solver_params,
      SimulatedAnnealing: update(current),
    },
  };
}

const LEGACY_SIMULATED_ANNEALING_PARAMETER_FIELDS: readonly SolverParameterFieldMetadata[] = [
  {
    formInputKey: 'initialTemp',
    label: 'Initial Temperature',
    tooltip: 'The starting temperature for the simulated annealing algorithm. Higher values allow more exploration.',
    min: '0.1',
    max: '10.0',
    step: '0.1',
    defaultValue: '1',
    parse: (raw) => parseFloat(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0.1,
    getValue: (settings) => settings.solver_params.SimulatedAnnealing?.initial_temperature ?? 1.0,
    applyValue: (settings, value) => withLegacySimulatedAnnealingParams(settings, (params) => ({
      ...params,
      initial_temperature: value,
    })),
  },
  {
    formInputKey: 'finalTemp',
    label: 'Final Temperature',
    tooltip: 'The temperature at which the algorithm will stop.',
    min: '0.001',
    max: '1.0',
    step: '0.001',
    defaultValue: '0.01',
    parse: (raw) => parseFloat(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0.001,
    getValue: (settings) => settings.solver_params.SimulatedAnnealing?.final_temperature ?? 0.01,
    applyValue: (settings, value) => withLegacySimulatedAnnealingParams(settings, (params) => ({
      ...params,
      final_temperature: value,
    })),
  },
  {
    formInputKey: 'reheatCycles',
    label: 'Reheat Cycles',
    tooltip: 'Number of cycles to cool from initial to final temperature, then reheat and repeat. 0 = disabled.',
    min: '0',
    max: '100000',
    placeholder: '0 = disabled',
    defaultValue: '0',
    parse: (raw) => parseInt(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0,
    getValue: (settings) => settings.solver_params.SimulatedAnnealing?.reheat_cycles ?? 0,
    applyValue: (settings, value) => withLegacySimulatedAnnealingParams(settings, (params) => ({
      ...params,
      reheat_cycles: value,
    })),
  },
  {
    formInputKey: 'reheat',
    label: 'Reheat After No Improvement',
    tooltip: 'Reset temperature to initial value after this many iterations without improvement (0 = disabled).',
    min: '0',
    max: '50000',
    placeholder: '0 = disabled',
    defaultValue: '0',
    parse: (raw) => parseInt(raw),
    isValid: (value) => !Number.isNaN(value) && value >= 0,
    getValue: (settings) => settings.solver_params.SimulatedAnnealing?.reheat_after_no_improvement ?? 0,
    applyValue: (settings, value) => withLegacySimulatedAnnealingParams(settings, (params) => ({
      ...params,
      reheat_after_no_improvement: value,
    })),
  },
];

export function getSolverCatalog(): readonly SolverCatalogEntry[] {
  return SOLVER_CATALOG;
}

export function normalizeSolverFamilyId(solverType: string | undefined | null): SolverFamilyId | null {
  if (!solverType) {
    return null;
  }

  if (LEGACY_SIMULATED_ANNEALING_ENTRY.acceptedConfigIds.includes(solverType)) {
    return 'legacy_simulated_annealing';
  }

  return null;
}

export function getSolverCatalogEntry(solverType: string | undefined | null): SolverCatalogEntry | null {
  const familyId = normalizeSolverFamilyId(solverType);
  if (!familyId) {
    return null;
  }

  return SOLVER_CATALOG.find((entry) => entry.id === familyId) ?? null;
}

export function isLegacySimulatedAnnealingSettings(settings: Pick<SolverSettings, 'solver_type' | 'solver_params'>): boolean {
  return normalizeSolverFamilyId(settings.solver_type) === 'legacy_simulated_annealing'
    && typeof settings.solver_params === 'object'
    && settings.solver_params !== null
    && 'SimulatedAnnealing' in settings.solver_params;
}

export function isFlatLegacySimulatedAnnealingParams(value: unknown): value is RawSimulatedAnnealingParams {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return normalizeSolverFamilyId(typeof candidate.solver_type === 'string' ? candidate.solver_type : undefined) === 'legacy_simulated_annealing';
}

export function getSolverParameterFieldMetadata(settings: SolverSettings): readonly SolverParameterFieldMetadata[] {
  switch (normalizeSolverFamilyId(settings.solver_type)) {
    case 'legacy_simulated_annealing':
      return LEGACY_SIMULATED_ANNEALING_PARAMETER_FIELDS;
    default:
      return [];
  }
}
