import type { SolverSettings } from '../types';
import {
  buildSolverCatalog,
  getSolverUiSpecForSettings,
  getSolverUiSpec,
  isFlatLegacySimulatedAnnealingParams,
  isLegacySimulatedAnnealingSettings,
  getAcceptedSolverFamilyIds,
  normalizeSolverFamilyId,
} from './solverUi';
import type {
  SolverCatalogEntry,
  SolverFamilyId,
  SolverFormInputKey,
  SolverNumberSettingFieldSpec,
} from './solverUi';

export type { SolverCatalogEntry, SolverFamilyId };
export type SolverParameterFormInputKey = SolverFormInputKey;

const LOCAL_PRESENTATION_SOLVER_METADATA: readonly SolverCatalogEntry[] = [
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

function toLegacyFieldMetadata(field: SolverNumberSettingFieldSpec): SolverParameterFieldMetadata {
  return {
    formInputKey: field.inputKey,
    label: field.label,
    tooltip: field.description,
    min: field.min,
    max: field.max,
    step: field.step,
    placeholder: field.placeholder,
    defaultValue: field.defaultValue,
    parse: field.parse,
    isValid: field.isValid,
    getValue: field.getValue,
    applyValue: field.applyValue,
  };
}

export function getSolverCatalog(): readonly SolverCatalogEntry[] {
  return LOCAL_PRESENTATION_SOLVER_METADATA;
}

export function getSolverCatalogEntry(solverType: string | undefined | null): SolverCatalogEntry | null {
  const familyId = normalizeSolverFamilyId(solverType);
  if (!familyId) {
    return null;
  }

  return getSolverCatalog().find((entry) => entry.id === familyId) ?? null;
}

export function getSolverParameterFieldMetadata(settings: SolverSettings): readonly SolverParameterFieldMetadata[] {
  const spec = getSolverUiSpecForSettings(settings.solver_type);
  if (!spec) {
    return [];
  }

  return spec.settingsSections
    .flatMap((section) => section.fields)
    .filter((field): field is SolverNumberSettingFieldSpec => field.type === 'number' && field.kind === 'solver_specific')
    .map(toLegacyFieldMetadata);
}

export {
  buildSolverCatalog,
  getSolverUiSpec,
  getSolverUiSpecForSettings,
  isFlatLegacySimulatedAnnealingParams,
  isLegacySimulatedAnnealingSettings,
  normalizeSolverFamilyId,
};
