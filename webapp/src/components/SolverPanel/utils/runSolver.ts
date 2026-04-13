import type { MutableRefObject } from 'react';
import type { Scenario, ScenarioResult, SavedScenario, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { isRuntimeCancelledError, type RuntimeProgressUpdate } from '../../../services/runtime';
import { solveScenario } from '../../../services/solver/solveScenario';
import { reconcileResultToInitialSchedule } from '../../../utils/warmStart';
import {
  finalizeCancelledRun,
  persistCompletedRunResult,
  resolveActiveScenarioId,
  trackCompletedRun,
} from './runSolverCompletion';
import {
  createProgressCallback,
  snapshotScenario,
  validateScenarioForSolve,
} from './runSolverHelpers';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface RunSolverArgs {
  useRecommended: boolean;
  scenario: Scenario | null;
  currentScenarioId: string | null;
  savedScenarios: Record<string, SavedScenario>;
  warmStartResultId: string | null;
  setWarmStartFromResult: (id: string | null) => void;
  solverSettings: SolverSettings;
  solverState: SolverState;
  desiredRuntimeMain: number | null;
  showLiveVizRef: MutableRefObject<boolean>;
  startSolver: () => void;
  setSolverState: (partial: Partial<SolverState>) => void;
  setSolution: (solution: Solution) => void;
  addNotification: AddNotification;
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotScenarioOverride?: Scenario,
  ) => ScenarioResult | null;
  ensureScenarioExists: () => Scenario;
  setRunSettings: (settings: SolverSettings) => void;
  setLiveVizState: (value: { schedule: Record<string, Record<string, string[]>>; progress: RuntimeProgressUpdate | null } | null) => void;
  liveVizLastUiUpdateRef: MutableRefObject<number>;
  runScenarioSnapshotRef: MutableRefObject<Scenario | null>;
  cancelledRef: MutableRefObject<boolean>;
  solverCompletedRef: MutableRefObject<boolean>;
  restartAfterSaveRef: MutableRefObject<boolean>;
  saveInProgressRef: MutableRefObject<boolean>;
}

interface RunSetup {
  progressCallback: (progress: RuntimeProgressUpdate) => void;
}

interface SolveExecutionResult {
  solution: Solution;
  lastProgress: RuntimeProgressUpdate | null;
  selectedSettings: SolverSettings;
  runScenario: Scenario;
}

function normalizeCompletedRunSettings(
  selectedSettings: SolverSettings,
  lastProgress: RuntimeProgressUpdate | null,
): SolverSettings {
  const finalMaxIterations = lastProgress?.max_iterations;

  if (
    !selectedSettings.stop_conditions.time_limit_seconds
    || typeof finalMaxIterations !== 'number'
    || !Number.isFinite(finalMaxIterations)
    || finalMaxIterations <= 0
  ) {
    return selectedSettings;
  }

  return {
    ...selectedSettings,
    stop_conditions: {
      ...selectedSettings.stop_conditions,
      max_iterations: finalMaxIterations,
    },
  };
}

function beginRunLifecycle({
  currentScenario,
  showLiveVizRef,
  startSolver,
  addNotification,
  setLiveVizState,
  liveVizLastUiUpdateRef,
  runScenarioSnapshotRef,
  cancelledRef,
  solverCompletedRef,
  setSolverState,
}: Pick<RunSolverArgs, 'showLiveVizRef' | 'startSolver' | 'addNotification' | 'setLiveVizState' | 'liveVizLastUiUpdateRef' | 'runScenarioSnapshotRef' | 'cancelledRef' | 'solverCompletedRef' | 'setSolverState'> & {
  currentScenario: Scenario;
  useRecommended: boolean;
}): RunSetup {
  cancelledRef.current = false;
  solverCompletedRef.current = false;

  startSolver();
  addNotification({
    type: 'info',
    title: 'Solving',
    message: 'Optimization algorithm started',
  });

  setLiveVizState(null);
  liveVizLastUiUpdateRef.current = 0;
  runScenarioSnapshotRef.current = snapshotScenario(currentScenario);

  return {
    progressCallback: createProgressCallback({
      showLiveVizRef,
      solverCompletedRef,
      cancelledRef,
      setSolverState,
      setLiveVizState,
      liveVizLastUiUpdateRef,
    }),
  };
}

function prepareWarmStartSchedule({
  currentScenario,
  currentScenarioId,
  savedScenarios,
  warmStartResultId,
  setWarmStartFromResult,
  addNotification,
}: Pick<RunSolverArgs, 'currentScenarioId' | 'savedScenarios' | 'warmStartResultId' | 'setWarmStartFromResult' | 'addNotification'> & {
  currentScenario: Scenario;
}): Record<string, Record<string, string[]>> | undefined {
  if (!warmStartResultId) {
    return undefined;
  }

  try {
    const sourceScenario = currentScenarioId ? savedScenarios[currentScenarioId] : null;
    const result = sourceScenario?.results.find((savedResult) => savedResult.id === warmStartResultId);
    if (!result) {
      throw new Error('Selected warm-start result not found');
    }

    return reconcileResultToInitialSchedule(currentScenario, result);
  } catch (error) {
    console.error('[SolverPanel] Warm-start failed, falling back to normal start:', error);
    addNotification({
      type: 'warning',
      title: 'Warm Start Failed',
      message: error instanceof Error ? error.message : 'Falling back to default start',
    });
    return undefined;
  } finally {
    setWarmStartFromResult(null);
  }
}

async function executeSolvePhase({
  currentScenario,
  solverSettings,
  useRecommended,
  desiredRuntimeMain,
  progressCallback,
  warmStartSchedule,
  showLiveViz,
  setRunSettings,
}: {
  currentScenario: Scenario;
  solverSettings: SolverSettings;
  useRecommended: boolean;
  desiredRuntimeMain: number | null;
  progressCallback: (progress: RuntimeProgressUpdate) => void;
  warmStartSchedule?: Record<string, Record<string, string[]>>;
  showLiveViz: boolean;
  setRunSettings: (settings: SolverSettings) => void;
  addNotification: AddNotification;
}): Promise<SolveExecutionResult> {
  const result = await solveScenario({
    scenario: {
      ...currentScenario,
      settings: solverSettings,
    },
    useRecommendedSettings: useRecommended,
    desiredRuntimeSeconds: desiredRuntimeMain,
    progressCallback,
    warmStartSchedule,
    enableBestScheduleTelemetry: showLiveViz,
    recommendationFailurePolicy: 'use-current-settings',
    onRecommendedSettingsFailure: (error) => {
      console.error('[SolverPanel] Failed to fetch recommended settings – falling back to existing settings', error);
      addNotification({
        type: 'warning',
        title: 'Recommended Settings Unavailable',
        message: 'Falling back to the current solver settings for this run.',
      });
    },
    onRunScenarioPrepared: (preparedRunScenario) => {
      setRunSettings(preparedRunScenario.settings);
    },
  });

  setRunSettings(result.selectedSettings);
  return result;
}

function applyCompletedSolverState({
  cancelled,
  solution,
  lastProgress,
  solverState,
  setSolverState,
  addNotification,
}: {
  cancelled: boolean;
  solution: Solution;
  lastProgress: RuntimeProgressUpdate | null;
  solverState: SolverState;
  setSolverState: (partial: Partial<SolverState>) => void;
  addNotification: AddNotification;
}): void {
  const finalNoImprovementCount = lastProgress ? lastProgress.no_improvement_count : solverState.noImprovementCount;

  setSolverState({
    isRunning: false,
    isComplete: !cancelled,
    currentIteration: solution.iteration_count,
    elapsedTime: solution.elapsed_time_ms,
    currentScore: lastProgress?.current_score ?? (solverState.currentScore ?? 0),
    bestScore: lastProgress?.best_score ?? solution.final_score,
    noImprovementCount: finalNoImprovementCount,
    latestProgress: lastProgress,
    latestSolution: solution,
  });

  if (!cancelled) {
    addNotification({
      type: 'success',
      title: 'Optimization Complete',
      message: `Found solution with score ${solution.final_score.toFixed(2)}`,
    });
  }
}

function handleRunError({
  error,
  setSolverState,
  addNotification,
}: Pick<RunSolverArgs, 'setSolverState' | 'addNotification'> & {
  error: unknown;
}): void {
  if (isRuntimeCancelledError(error)) {
    setSolverState({ isRunning: false, isComplete: false });
    addNotification({
      type: 'warning',
      title: 'Solver Cancelled',
      message: 'Optimization was cancelled by user',
    });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  setSolverState({ isRunning: false, error: errorMessage });
  addNotification({
    type: 'error',
    title: 'Solver Error',
    message: errorMessage,
  });
}

export async function runSolver(args: RunSolverArgs) {
  const currentScenario = args.ensureScenarioExists();

  if (!validateScenarioForSolve(currentScenario, args.addNotification)) {
    return;
  }

  try {
    const { progressCallback } = beginRunLifecycle({
      currentScenario,
      showLiveVizRef: args.showLiveVizRef,
      startSolver: args.startSolver,
      addNotification: args.addNotification,
      setLiveVizState: args.setLiveVizState,
      liveVizLastUiUpdateRef: args.liveVizLastUiUpdateRef,
      runScenarioSnapshotRef: args.runScenarioSnapshotRef,
      cancelledRef: args.cancelledRef,
      solverCompletedRef: args.solverCompletedRef,
      setSolverState: args.setSolverState,
    });

    const warmStartSchedule = prepareWarmStartSchedule({
      currentScenario,
      currentScenarioId: args.currentScenarioId,
      savedScenarios: args.savedScenarios,
      warmStartResultId: args.warmStartResultId,
      setWarmStartFromResult: args.setWarmStartFromResult,
      addNotification: args.addNotification,
    });

    const { solution, lastProgress, selectedSettings, runScenario } = await executeSolvePhase({
      currentScenario,
      solverSettings: args.solverSettings,
      useRecommended: args.useRecommended,
      desiredRuntimeMain: args.desiredRuntimeMain,
      progressCallback,
      warmStartSchedule,
      showLiveViz: args.showLiveVizRef.current,
      setRunSettings: args.setRunSettings,
      addNotification: args.addNotification,
    });
    const completedRunSettings = normalizeCompletedRunSettings(selectedSettings, lastProgress);

    args.setRunSettings(completedRunSettings);

    args.solverCompletedRef.current = true;
    args.setSolution(solution);

    await new Promise((resolve) => setTimeout(resolve, 50));

    applyCompletedSolverState({
      cancelled: args.cancelledRef.current,
      solution,
      lastProgress,
      solverState: args.solverState,
      setSolverState: args.setSolverState,
      addNotification: args.addNotification,
    });

    const activeScenarioId = resolveActiveScenarioId(args.currentScenarioId);
    const savedResult = persistCompletedRunResult({
      activeScenarioId,
      solution,
      selectedSettings: completedRunSettings,
      runScenarioSnapshotRef: args.runScenarioSnapshotRef,
      addResult: args.addResult,
      addNotification: args.addNotification,
    });

    trackCompletedRun({
      cancelled: args.cancelledRef.current,
      savedResult,
    });

    if (args.cancelledRef.current) {
      await finalizeCancelledRun({
        args,
        runScenario,
        solution,
        progressCallback,
        savedResult,
        restartFallbackRun: runSolver,
      });
      return;
    }
  } catch (error) {
    handleRunError({
      error,
      setSolverState: args.setSolverState,
      addNotification: args.addNotification,
    });
  }
}
