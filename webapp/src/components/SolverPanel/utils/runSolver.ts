import type { MutableRefObject } from 'react';
import type { Scenario, ScenarioResult, SavedScenario, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { buildTelemetryPayload, getPersistedTelemetryAttribution, trackLandingEvent } from '../../../services/landingInstrumentation';
import { scenarioStorage } from '../../../services/scenarioStorage';
import { solveScenario } from '../../../services/solver/solveScenario';
import type { ProgressUpdate } from '../../../services/wasm/types';
import { solverWorkerService } from '../../../services/solverWorker';
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
  setLiveVizState: (value: { schedule: Record<string, Record<string, string[]>>; progress: ProgressUpdate | null } | null) => void;
  liveVizLastUiUpdateRef: MutableRefObject<number>;
  runScenarioSnapshotRef: MutableRefObject<Scenario | null>;
  cancelledRef: MutableRefObject<boolean>;
  solverCompletedRef: MutableRefObject<boolean>;
  restartAfterSaveRef: MutableRefObject<boolean>;
  saveInProgressRef: MutableRefObject<boolean>;
}

export async function runSolver({
  useRecommended,
  scenario,
  currentScenarioId,
  savedScenarios,
  warmStartResultId,
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
}: RunSolverArgs) {
  const currentScenario = ensureScenarioExists();

  if (!validateScenarioForSolve(currentScenario, addNotification)) {
    return;
  }

  try {
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

    const progressCallback = createProgressCallback({
      showLiveVizRef,
      solverCompletedRef,
      cancelledRef,
      setSolverState,
      setLiveVizState,
      liveVizLastUiUpdateRef,
    });

    let warmStartSchedule: Record<string, Record<string, string[]>> | undefined;
    if (warmStartResultId) {
      try {
        const sourceScenario = currentScenarioId ? savedScenarios[currentScenarioId] : null;
        const result = sourceScenario?.results.find((savedResult) => savedResult.id === warmStartResultId);
        if (!result) {
          throw new Error('Selected warm-start result not found');
        }
        warmStartSchedule = reconcileResultToInitialSchedule(currentScenario, result);
      } catch (error) {
        console.error('[SolverPanel] Warm-start failed, falling back to normal start:', error);
        addNotification({
          type: 'warning',
          title: 'Warm Start Failed',
          message: error instanceof Error ? error.message : 'Falling back to default start',
        });
      } finally {
        setWarmStartFromResult(null);
      }
    }

    const { solution, lastProgress, selectedSettings, runScenario } = await solveScenario({
      scenario: {
        ...currentScenario,
        settings: solverSettings,
      },
      useRecommendedSettings: useRecommended,
      desiredRuntimeSeconds: desiredRuntimeMain,
      progressCallback,
      warmStartSchedule,
      enableBestScheduleTelemetry: showLiveVizRef.current,
      onRunScenarioPrepared: (preparedRunScenario) => {
        setRunSettings(preparedRunScenario.settings);
      },
    });

    setRunSettings(selectedSettings);

    solverCompletedRef.current = true;

    setSolution(solution);

    const finalNoImprovementCount = lastProgress ? lastProgress.no_improvement_count : solverState.noImprovementCount;

    await new Promise((resolve) => setTimeout(resolve, 50));

    if (cancelledRef.current) {
      setSolverState({
        isRunning: false,
        isComplete: false,
        currentIteration: solution.iteration_count,
        elapsedTime: solution.elapsed_time_ms,
        currentScore: lastProgress?.current_score ?? (solverState.currentScore ?? 0),
        bestScore: lastProgress?.best_score ?? solution.final_score,
        noImprovementCount: finalNoImprovementCount,
      });
    } else {
      setSolverState({
        isRunning: false,
        isComplete: true,
        currentIteration: solution.iteration_count,
        elapsedTime: solution.elapsed_time_ms,
        currentScore: lastProgress?.current_score ?? (solverState.currentScore ?? 0),
        bestScore: lastProgress?.best_score ?? solution.final_score,
        noImprovementCount: finalNoImprovementCount,
      });
      addNotification({
        type: 'success',
        title: 'Optimization Complete',
        message: `Found solution with score ${solution.final_score.toFixed(2)}`,
      });
    }

    const storeScenarioId = useAppStore.getState().currentScenarioId;
    const activeScenarioId = currentScenarioId ?? storeScenarioId ?? scenarioStorage.getCurrentScenarioId();

    if (activeScenarioId && storeScenarioId !== activeScenarioId) {
      useAppStore.setState({ currentScenarioId: activeScenarioId });
    }

    let savedResult: ScenarioResult | null = null;
    if (activeScenarioId) {
      const snapshotScenario = runScenarioSnapshotRef.current || undefined;
      if (storeScenarioId && storeScenarioId === activeScenarioId) {
        savedResult = addResult(solution, selectedSettings, undefined, snapshotScenario);
      } else {
        savedResult = persistResultWithExplicitScenarioId({
          scenarioId: activeScenarioId,
          solution,
          selectedSettings,
          snapshotScenario,
          addNotification,
        });
      }

      if (!savedResult && activeScenarioId) {
        savedResult = persistResultWithExplicitScenarioId({
          scenarioId: activeScenarioId,
          solution,
          selectedSettings,
          snapshotScenario,
          addNotification,
        });
      }
    } else {
      addNotification({
        type: 'warning',
        title: 'Result Not Saved',
        message: 'The solver finished, but no current scenario was available for saving the result.',
      });
    }

    if (!cancelledRef.current) {
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

    if (cancelledRef.current) {
      if (restartAfterSaveRef.current) {
        restartAfterSaveRef.current = false;
        saveInProgressRef.current = false;
        cancelledRef.current = false;

        if (!savedResult) {
          addNotification({
            type: 'warning',
            title: 'Resume Skipped',
            message: 'Best-so-far could not be saved, so the solver was left stopped.',
          });
          return;
        }

        addNotification({
          type: 'info',
          title: 'Resuming Solver',
          message: 'Best-so-far saved. Resuming with the same settings...',
        });

        const resumeScenario = runScenario;
        const initialSchedule = solution.assignments.reduce<Record<string, Record<string, string[]>>>(
          (acc, a) => {
            const sessionKey = `session_${a.session_id}`;
            if (!acc[sessionKey]) acc[sessionKey] = {};
            if (!acc[sessionKey][a.group_id]) acc[sessionKey][a.group_id] = [];
            acc[sessionKey][a.group_id].push(a.person_id);
            return acc;
          },
          {},
        );
        solverCompletedRef.current = false;
        startSolver();
        setTimeout(async () => {
          try {
            await solverWorkerService.solveWithProgressWarmStart(resumeScenario, initialSchedule, progressCallback);
          } catch (e) {
            console.error('[SolverPanel] Warm-start resume failed:', e);
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
        return;
      } else {
        cancelledRef.current = false;
        saveInProgressRef.current = false;
        if (!savedResult) {
          addNotification({
            type: 'warning',
            title: 'Best-So-Far Not Saved',
            message: 'The solver stopped, but the best-so-far snapshot could not be saved.',
          });
        }
        return;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('cancelled')) {
      setSolverState({ isRunning: false, isComplete: false });
      addNotification({
        type: 'warning',
        title: 'Solver Cancelled',
        message: 'Optimization was cancelled by user',
      });
    } else {
      setSolverState({ isRunning: false, error: errorMessage });
      addNotification({
        type: 'error',
        title: 'Solver Error',
        message: errorMessage,
      });
    }
  }
}
