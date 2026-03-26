import type { Scenario, Solution, SolverSettings } from '../../types';
import { solverWorkerService } from '../solverWorker';
import type { ProgressUpdate } from '../wasm/types';
import { normalizeRecommendedSolverSettings } from '../../components/SolverPanel/utils/recommendedSettings';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export interface SolveScenarioOptions {
  scenario: Scenario;
  useRecommendedSettings?: boolean;
  desiredRuntimeSeconds?: number | null;
  progressCallback?: (progress: ProgressUpdate) => void;
  warmStartSchedule?: WarmStartSchedule;
  enableBestScheduleTelemetry?: boolean;
  onRunScenarioPrepared?: (runScenario: Scenario, selectedSettings: SolverSettings) => void;
}

export interface SolveScenarioResult {
  selectedSettings: SolverSettings;
  runScenario: Scenario;
  solution: Solution;
  lastProgress: ProgressUpdate | null;
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

async function selectSettings(scenario: Scenario, useRecommendedSettings: boolean, desiredRuntimeSeconds: number | null | undefined) {
  if (!useRecommendedSettings) {
    return scenario.settings;
  }

  try {
    const recommended = await solverWorkerService.getRecommendedSettings(scenario, desiredRuntimeSeconds ?? 3);
    return normalizeRecommendedSolverSettings(recommended as SolverSettings);
  } catch (error) {
    console.error('[solveScenario] Failed to fetch recommended settings, falling back to current scenario settings', error);
    return scenario.settings;
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
}: SolveScenarioOptions): Promise<SolveScenarioResult> {
  const selectedSettings = await selectSettings(scenario, useRecommendedSettings, desiredRuntimeSeconds);
  const runScenario: Scenario = {
    ...scenario,
    settings: buildRunSettings(selectedSettings, enableBestScheduleTelemetry),
  };

  onRunScenarioPrepared?.(runScenario, selectedSettings);

  const { solution, lastProgress } = warmStartSchedule
    ? await solverWorkerService.solveWithProgressWarmStart(runScenario, warmStartSchedule, progressCallback)
    : await solverWorkerService.solveWithProgress(runScenario, progressCallback);

  return {
    selectedSettings,
    runScenario,
    solution,
    lastProgress,
  };
}
