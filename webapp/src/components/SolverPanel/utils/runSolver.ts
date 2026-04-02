import type { MutableRefObject } from 'react';
import type { Scenario, ScenarioResult, SavedScenario, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { buildTelemetryPayload, getPersistedTelemetryAttribution, trackLandingEvent } from '../../../services/landingInstrumentation';
import { getRuntime, isRuntimeCancelledError, type RuntimeProgressUpdate } from '../../../services/runtime';
import { scenarioStorage } from '../../../services/scenarioStorage';
import { solveScenario } from '../../../services/solver/solveScenario';
import { useAppStore } from '../../../store';
import { reconcileResultToInitialSchedule } from '../../../utils/warmStart';
import {
  createProgressCallback,
  snapshotScenario,
  validateScenarioForSolve,
} from './runSolverHelpers';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

function persistResultWithExplicitScenarioId({
  scenarioId,
  solution,
  selectedSettings,
  snapshotScenario,
  addNotification,
}: {
  scenarioId: string;
  solution: Solution;
  selectedSettings: SolverSettings;
  snapshotScenario?: Scenario;
  addNotification: AddNotification;
}): ScenarioResult | null {
  try {
    const result = scenarioStorage.addResult(scenarioId, solution, selectedSettings, undefined, snapshotScenario);
    const persistedScenario = scenarioStorage.getScenario(scenarioId);

    useAppStore.setState((state) => ({
      currentScenarioId: scenarioId,
      savedScenarios: persistedScenario
        ? {
            ...state.savedScenarios,
            [scenarioId]: {
              ...persistedScenario,
              scenario: state.scenario || persistedScenario.scenario,
            },
          }
        : state.savedScenarios,
    }));

    addNotification({
      type: 'success',
      title: 'Result Saved',
      message: `Result "${result.name}" has been saved to the current scenario.`,
    });

    return result;
  } catch (error) {
    addNotification({
      type: 'error',
      title: 'Save Result Failed',
      message: error instanceof Error ? error.message : 'Failed to save result',
    });
    return null;
  }
}

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

function beginRunLifecycle({
  currentScenario,
  useRecommended,
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

  trackLandingEvent(
    'solver_started',
    buildTelemetryPayload(
      {
        entryPath: '/app/solver',
        mode: useRecommended ? 'automatic' : 'custom',
      },
      getPersistedTelemetryAttribution(),
    ),
  );

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
  });

  if (!cancelled) {
    addNotification({
      type: 'success',
      title: 'Optimization Complete',
      message: `Found solution with score ${solution.final_score.toFixed(2)}`,
    });
  }
}

function resolveActiveScenarioId(currentScenarioId: string | null): string | null {
  const storeScenarioId = useAppStore.getState().currentScenarioId;
  const activeScenarioId = currentScenarioId ?? storeScenarioId ?? scenarioStorage.getCurrentScenarioId();

  if (activeScenarioId && storeScenarioId !== activeScenarioId) {
    useAppStore.setState({ currentScenarioId: activeScenarioId });
  }

  return activeScenarioId;
}

function persistCompletedRunResult({
  activeScenarioId,
  solution,
  selectedSettings,
  runScenarioSnapshotRef,
  addResult,
  addNotification,
}: Pick<RunSolverArgs, 'addResult' | 'addNotification' | 'runScenarioSnapshotRef'> & {
  activeScenarioId: string | null;
  solution: Solution;
  selectedSettings: SolverSettings;
}): ScenarioResult | null {
  const storeScenarioId = useAppStore.getState().currentScenarioId;

  if (!activeScenarioId) {
    addNotification({
      type: 'warning',
      title: 'Result Not Saved',
      message: 'The solver finished, but no current scenario was available for saving the result.',
    });
    return null;
  }

  const snapshotScenario = runScenarioSnapshotRef.current || undefined;

  if (storeScenarioId && storeScenarioId === activeScenarioId) {
    const directSave = addResult(solution, selectedSettings, undefined, snapshotScenario);
    if (directSave) {
      return directSave;
    }
  }

  return persistResultWithExplicitScenarioId({
    scenarioId: activeScenarioId,
    solution,
    selectedSettings,
    snapshotScenario,
    addNotification,
  });
}

function buildInitialScheduleFromSolution(solution: Solution): Record<string, Record<string, string[]>> {
  return solution.assignments.reduce<Record<string, Record<string, string[]>>>(
    (acc, assignment) => {
      const sessionKey = `session_${assignment.session_id}`;
      if (!acc[sessionKey]) acc[sessionKey] = {};
      if (!acc[sessionKey][assignment.group_id]) acc[sessionKey][assignment.group_id] = [];
      acc[sessionKey][assignment.group_id].push(assignment.person_id);
      return acc;
    },
    {},
  );
}

async function resumeCancelledSolve({
  args,
  runScenario,
  solution,
  progressCallback,
  savedResult,
}: {
  args: RunSolverArgs;
  runScenario: Scenario;
  solution: Solution;
  progressCallback: (progress: RuntimeProgressUpdate) => void;
  savedResult: ScenarioResult | null;
}): Promise<boolean> {
  const {
    scenario,
    currentScenarioId,
    savedScenarios,
    setWarmStartFromResult,
    solverSettings,
    solverState,
    desiredRuntimeMain,
    showLiveVizRef,
    startSolver,
    setSolverState,
    setSolution,
    addNotification,
    addResult,
    ensureScenarioExists,
    setRunSettings,
    setLiveVizState,
    liveVizLastUiUpdateRef,
    runScenarioSnapshotRef,
    cancelledRef,
    solverCompletedRef,
    restartAfterSaveRef,
    saveInProgressRef,
  } = args;

  restartAfterSaveRef.current = false;
  saveInProgressRef.current = false;
  cancelledRef.current = false;

  if (!savedResult) {
    addNotification({
      type: 'warning',
      title: 'Resume Skipped',
      message: 'Best-so-far could not be saved, so the solver was left stopped.',
    });
    return true;
  }

  addNotification({
    type: 'info',
    title: 'Resuming Solver',
    message: 'Best-so-far saved. Resuming with the same settings...',
  });

  const initialSchedule = buildInitialScheduleFromSolution(solution);
  solverCompletedRef.current = false;
  startSolver();

  setTimeout(async () => {
    try {
      await getRuntime().solveWarmStart({
        scenario: runScenario,
        initialSchedule,
        progressCallback,
      });
    } catch (error) {
      console.error('[SolverPanel] Warm-start resume failed:', error);
      await runSolver({
        useRecommended: false,
        scenario,
        currentScenarioId,
        savedScenarios,
        warmStartResultId: null,
        setWarmStartFromResult,
        solverSettings,
        solverState,
        desiredRuntimeMain,
        showLiveVizRef,
        startSolver,
        setSolverState,
        setSolution,
        addNotification,
        addResult,
        ensureScenarioExists,
        setRunSettings,
        setLiveVizState,
        liveVizLastUiUpdateRef,
        runScenarioSnapshotRef,
        cancelledRef,
        solverCompletedRef,
        restartAfterSaveRef,
        saveInProgressRef,
      });
    }
  }, 0);

  return true;
}

async function finalizeCancelledRun({
  args,
  runScenario,
  solution,
  progressCallback,
  savedResult,
}: {
  args: RunSolverArgs;
  runScenario: Scenario;
  solution: Solution;
  progressCallback: (progress: RuntimeProgressUpdate) => void;
  savedResult: ScenarioResult | null;
}): Promise<boolean> {
  const { addNotification, cancelledRef, restartAfterSaveRef, saveInProgressRef } = args;

  if (restartAfterSaveRef.current) {
    return resumeCancelledSolve({
      args,
      runScenario,
      solution,
      progressCallback,
      savedResult,
    });
  }

  cancelledRef.current = false;
  saveInProgressRef.current = false;

  if (!savedResult) {
    addNotification({
      type: 'warning',
      title: 'Best-So-Far Not Saved',
      message: 'The solver stopped, but the best-so-far snapshot could not be saved.',
    });
  }

  return true;
}

function trackCompletedRun({
  cancelled,
  useRecommended,
  savedResult,
}: {
  cancelled: boolean;
  useRecommended: boolean;
  savedResult: ScenarioResult | null;
}): void {
  if (cancelled) {
    return;
  }

  trackLandingEvent(
    'solver_completed',
    buildTelemetryPayload(
      {
        entryPath: '/app/solver',
        mode: useRecommended ? 'automatic' : 'custom',
        resultSaved: Boolean(savedResult),
      },
      getPersistedTelemetryAttribution(),
    ),
  );
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
      useRecommended: args.useRecommended,
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
      selectedSettings,
      runScenarioSnapshotRef: args.runScenarioSnapshotRef,
      addResult: args.addResult,
      addNotification: args.addNotification,
    });

    trackCompletedRun({
      cancelled: args.cancelledRef.current,
      useRecommended: args.useRecommended,
      savedResult,
    });

    if (args.cancelledRef.current) {
      await finalizeCancelledRun({
        args,
        runScenario,
        solution,
        progressCallback,
        savedResult,
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
