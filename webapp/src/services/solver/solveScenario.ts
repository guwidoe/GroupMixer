import type { Scenario, Solution, SolverSettings } from '../../types';
import { getRuntime, type RuntimeProgressUpdate, type SolverRuntime } from '../runtime';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;
export type RecommendationFailurePolicy = 'use-current-settings' | 'error';

export interface SolveScenarioOptions {
  scenario: Scenario;
  useRecommendedSettings?: boolean;
  desiredRuntimeSeconds?: number | null;
  progressCallback?: (progress: RuntimeProgressUpdate) => void;
  warmStartSchedule?: WarmStartSchedule;
  enableBestScheduleTelemetry?: boolean;
  onRunScenarioPrepared?: (runScenario: Scenario, selectedSettings: SolverSettings) => void;
  recommendationFailurePolicy?: RecommendationFailurePolicy;
  onRecommendedSettingsFailure?: (error: unknown) => void;
  runtime?: SolverRuntime;
}

export interface SolveScenarioResult {
  selectedSettings: SolverSettings;
  runScenario: Scenario;
  solution: Solution;
  lastProgress: RuntimeProgressUpdate | null;
}

function buildRunSettings(settings: SolverSettings, enableBestScheduleTelemetry: boolean): SolverSettings {
  if (!enableBestScheduleTelemetry) {
    return settings;
  }

  return {
    ...settings,
    telemetry: {
      ...(settings.telemetry || {}),
      emit_best_schedule: true,
      best_schedule_every_n_callbacks: settings.telemetry?.best_schedule_every_n_callbacks ?? 3,
    },
  };
}

async function selectSettings({
  runtime,
  scenario,
  useRecommendedSettings,
  desiredRuntimeSeconds,
  recommendationFailurePolicy,
  onRecommendedSettingsFailure,
}: {
  runtime: SolverRuntime;
  scenario: Scenario;
  useRecommendedSettings: boolean;
  desiredRuntimeSeconds: number | null | undefined;
  recommendationFailurePolicy: RecommendationFailurePolicy;
  onRecommendedSettingsFailure?: (error: unknown) => void;
}) {
  if (!useRecommendedSettings) {
    return scenario.settings;
  }

  try {
    return await runtime.recommendSettings({
      scenario,
      desiredRuntimeSeconds: desiredRuntimeSeconds ?? 3,
    });
  } catch (error) {
    onRecommendedSettingsFailure?.(error);

    if (recommendationFailurePolicy === 'use-current-settings') {
      return scenario.settings;
    }

    throw error;
  }
}

export async function solveScenario({
  scenario,
  useRecommendedSettings = true,
  desiredRuntimeSeconds = 3,
  progressCallback,
  warmStartSchedule,
  enableBestScheduleTelemetry = false,
  onRunScenarioPrepared,
  recommendationFailurePolicy = 'error',
  onRecommendedSettingsFailure,
  runtime = getRuntime(),
}: SolveScenarioOptions): Promise<SolveScenarioResult> {
  const selectedSettings = await selectSettings({
    runtime,
    scenario,
    useRecommendedSettings,
    desiredRuntimeSeconds,
    recommendationFailurePolicy,
    onRecommendedSettingsFailure,
  });
  const runScenario: Scenario = {
    ...scenario,
    settings: buildRunSettings(selectedSettings, enableBestScheduleTelemetry),
  };

  onRunScenarioPrepared?.(runScenario, selectedSettings);

  const { solution, lastProgress } = warmStartSchedule
    ? await runtime.solveWarmStart({ scenario: runScenario, initialSchedule: warmStartSchedule, progressCallback })
    : await runtime.solveWithProgress({ scenario: runScenario, progressCallback });

  return {
    selectedSettings,
    runScenario,
    solution,
    lastProgress,
  };
}
