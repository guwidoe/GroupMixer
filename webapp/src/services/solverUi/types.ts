import type { Solution, SolverBenchmarkTelemetry, SolverSettings } from '../../types';
import type { RuntimeProgressUpdate, RuntimeSolverDescriptor } from '../runtime';

export type SolverFamilyId = 'auto' | 'solver1' | 'solver3';
export type SolverUiSectionKind = 'universal' | 'family_shared' | 'solver_specific';
export type SolverFormInputKey =
  | 'maxIterations'
  | 'timeLimit'
  | 'noImprovement'
  | 'seed'
  | 'initialTemp'
  | 'finalTemp'
  | 'reheatCycles'
  | 'reheat'
  | 'correctnessLaneEnabled'
  | 'correctnessLaneSampleEveryAcceptedMoves'
  | 'desiredRuntimeSettings'
  | 'desiredRuntimeMain';

export interface SolverUiCapabilitySummary {
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
  capabilities: SolverUiCapabilitySummary;
  uiSpecAvailable: boolean;
  experimental: boolean;
}

export interface SolverSettingsSummaryRow {
  label: string;
  value: string;
}

interface BaseSettingFieldSpec {
  id: string;
  inputKey: SolverFormInputKey;
  label: string;
  description: string;
  kind: SolverUiSectionKind;
}

export interface SolverNumberSettingFieldSpec extends BaseSettingFieldSpec {
  type: 'number';
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

export interface SolverBooleanSettingFieldSpec extends BaseSettingFieldSpec {
  type: 'boolean';
  getValue: (settings: SolverSettings) => boolean;
  applyValue: (settings: SolverSettings, value: boolean) => SolverSettings;
}

export type SolverSettingFieldSpec = SolverNumberSettingFieldSpec | SolverBooleanSettingFieldSpec;

export interface SolverSettingsSectionSpec {
  id: string;
  title: string;
  description?: string;
  kind: SolverUiSectionKind;
  fields: readonly SolverSettingFieldSpec[];
}

export interface SolverMetricContext {
  progress: RuntimeProgressUpdate | null;
  settings: SolverSettings;
  solution?: Solution | null;
  benchmarkTelemetry?: SolverBenchmarkTelemetry | null;
  descriptor?: RuntimeSolverDescriptor | null;
}

export interface SolverMetricSpec {
  id: string;
  label: string;
  description: string;
  kind: SolverUiSectionKind;
  render: (context: SolverMetricContext) => string;
  isVisible?: (context: SolverMetricContext) => boolean;
}

export interface SolverMetricSectionSpec {
  id: string;
  title: string;
  description?: string;
  kind: SolverUiSectionKind;
  metrics: readonly SolverMetricSpec[];
}

export interface SolverUiSpec {
  familyId: SolverFamilyId;
  displayName: string;
  shortDescription: string;
  algorithmHighlights: readonly string[];
  settingsSections: readonly SolverSettingsSectionSpec[];
  liveMetricSections: readonly SolverMetricSectionSpec[];
  summarizeSettings: (settings: SolverSettings) => readonly SolverSettingsSummaryRow[];
}

export interface CommonSolverSettingsDraft {
  stopConditions: SolverSettings['stop_conditions'];
  logging?: SolverSettings['logging'];
  telemetry?: SolverSettings['telemetry'];
  seed?: number;
  movePolicy?: SolverSettings['move_policy'];
  allowedSessions?: number[];
}

export interface Solver1SpecificDraft {
  initialTemperature: number;
  finalTemperature: number;
  coolingSchedule: 'geometric' | 'linear';
  reheatCycles: number;
  reheatAfterNoImprovement: number;
}

export interface Solver3SpecificDraft {
  correctnessLaneEnabled: boolean;
  correctnessLaneSampleEveryAcceptedMoves: number;
}

export type AutoSpecificDraft = Record<string, never>;

export type SolverDraft =
  | {
      familyId: 'auto';
      common: CommonSolverSettingsDraft;
      specific: AutoSpecificDraft;
    }
  | {
      familyId: 'solver1';
      common: CommonSolverSettingsDraft;
      specific: Solver1SpecificDraft;
    }
  | {
      familyId: 'solver3';
      common: CommonSolverSettingsDraft;
      specific: Solver3SpecificDraft;
    };
