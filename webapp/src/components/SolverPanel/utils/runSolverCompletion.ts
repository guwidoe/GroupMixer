import type { MutableRefObject } from 'react';
import type { Scenario, ScenarioResult, SavedScenario, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { buildTelemetryPayload, getPersistedTelemetryAttribution, trackLandingEvent } from '../../../services/landingInstrumentation';
import { getRuntime, type RuntimeProgressUpdate } from '../../../services/runtime';
import { scenarioStorage } from '../../../services/scenarioStorage';
import { useAppStore } from '../../../store';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

interface PersistCompletedRunResultArgs {
  activeScenarioId: string | null;
  solution: Solution;
  selectedSettings: SolverSettings;
  runScenarioSnapshotRef: MutableRefObject<Scenario | null>;
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotScenarioOverride?: Scenario,
  ) => ScenarioResult | null;
  addNotification: AddNotification;
}

interface ResumeRunArgs {
  useRecommended: boolean;
  scenario: Scenario | null;
  currentScenarioId: string | null;
  savedScenarios: Record<string, SavedScenario>;
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

interface FinalizeCancelledRunArgs {
  args: ResumeRunArgs;
  runScenario: Scenario;
  solution: Solution;
  progressCallback: (progress: RuntimeProgressUpdate) => void;
  savedResult: ScenarioResult | null;
  restartFallbackRun: (args: ResumeRunArgs) => Promise<void>;
}

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

function buildInitialScheduleFromSolution(solution: Solution): Record<string, Record<string, string[]>> {
  return solution.assignments.reduce<Record<string, Record<string, string[]>>>(
    (acc, assignment) => {
      const sessionKey = `session_${assignment.session_id}`;
      acc[sessionKey] = acc[sessionKey] ?? {};
      acc[sessionKey][assignment.group_id] = acc[sessionKey][assignment.group_id] ?? [];
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
  restartFallbackRun,
}: FinalizeCancelledRunArgs): Promise<boolean> {
  const {
    addNotification,
    cancelledRef,
    restartAfterSaveRef,
    saveInProgressRef,
    solverCompletedRef,
    startSolver,
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
      await restartFallbackRun({
        ...args,
        useRecommended: false,
      });
    }
  }, 0);

  return true;
}

export function resolveActiveScenarioId(currentScenarioId: string | null): string | null {
  const storeScenarioId = useAppStore.getState().currentScenarioId;
  const activeScenarioId = currentScenarioId ?? storeScenarioId ?? scenarioStorage.getCurrentScenarioId();

  if (activeScenarioId && storeScenarioId !== activeScenarioId) {
    useAppStore.setState({ currentScenarioId: activeScenarioId });
  }

  return activeScenarioId;
}

export function persistCompletedRunResult({
  activeScenarioId,
  solution,
  selectedSettings,
  runScenarioSnapshotRef,
  addResult,
  addNotification,
}: PersistCompletedRunResultArgs): ScenarioResult | null {
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

export async function finalizeCancelledRun({
  args,
  runScenario,
  solution,
  progressCallback,
  savedResult,
  restartFallbackRun,
}: FinalizeCancelledRunArgs): Promise<boolean> {
  const { addNotification, cancelledRef, restartAfterSaveRef, saveInProgressRef } = args;

  if (restartAfterSaveRef.current) {
    return resumeCancelledSolve({
      args,
      runScenario,
      solution,
      progressCallback,
      savedResult,
      restartFallbackRun,
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

export function trackCompletedRun({
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
