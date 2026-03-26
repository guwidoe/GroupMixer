import type { Problem, Solution, SolverSettings } from '../../types';
import { solverWorkerService } from '../solverWorker';
import type { ProgressUpdate } from '../wasm/types';
import { normalizeRecommendedSolverSettings } from '../../components/SolverPanel/utils/recommendedSettings';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export interface SolveProblemOptions {
  problem: Problem;
  useRecommendedSettings?: boolean;
  desiredRuntimeSeconds?: number | null;
  progressCallback?: (progress: ProgressUpdate) => void;
  warmStartSchedule?: WarmStartSchedule;
  enableBestScheduleTelemetry?: boolean;
  onRunProblemPrepared?: (runProblem: Problem, selectedSettings: SolverSettings) => void;
}

export interface SolveProblemResult {
  selectedSettings: SolverSettings;
  runProblem: Problem;
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

async function selectSettings(problem: Problem, useRecommendedSettings: boolean, desiredRuntimeSeconds: number | null | undefined) {
  if (!useRecommendedSettings) {
    return problem.settings;
  }

  try {
    const recommended = await solverWorkerService.getRecommendedSettings(problem, desiredRuntimeSeconds ?? 3);
    return normalizeRecommendedSolverSettings(recommended as SolverSettings);
  } catch (error) {
    console.error('[solveProblem] Failed to fetch recommended settings, falling back to current problem settings', error);
    return problem.settings;
  }
}

export async function solveProblem({
  problem,
  useRecommendedSettings = true,
  desiredRuntimeSeconds = 3,
  progressCallback,
  warmStartSchedule,
  enableBestScheduleTelemetry = false,
  onRunProblemPrepared,
}: SolveProblemOptions): Promise<SolveProblemResult> {
  const selectedSettings = await selectSettings(problem, useRecommendedSettings, desiredRuntimeSeconds);
  const runProblem: Problem = {
    ...problem,
    settings: buildRunSettings(selectedSettings, enableBestScheduleTelemetry),
  };

  onRunProblemPrepared?.(runProblem, selectedSettings);

  const { solution, lastProgress } = warmStartSchedule
    ? await solverWorkerService.solveWithProgressWarmStart(runProblem, warmStartSchedule, progressCallback)
    : await solverWorkerService.solveWithProgress(runProblem, progressCallback);

  return {
    selectedSettings,
    runProblem,
    solution,
    lastProgress,
  };
}
