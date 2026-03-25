import type { MutableRefObject } from 'react';
import type { Problem, ProblemResult, SavedProblem, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import { problemStorage } from '../../../services/problemStorage';
import { solveProblem } from '../../../services/solver/solveProblem';
import type { ProgressUpdate } from '../../../services/wasm/types';
import { solverWorkerService } from '../../../services/solverWorker';
import { useAppStore } from '../../../store';
import { reconcileResultToInitialSchedule } from '../../../utils/warmStart';
import {
  createProgressCallback,
  snapshotProblem,
  validateProblemForSolve,
} from './runSolverHelpers';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

function persistResultWithExplicitProblemId({
  problemId,
  solution,
  selectedSettings,
  snapshotProblem,
  addNotification,
}: {
  problemId: string;
  solution: Solution;
  selectedSettings: SolverSettings;
  snapshotProblem?: Problem;
  addNotification: AddNotification;
}): ProblemResult | null {
  try {
    const result = problemStorage.addResult(problemId, solution, selectedSettings, undefined, snapshotProblem);
    const persistedProblem = problemStorage.getProblem(problemId);

    useAppStore.setState((state) => ({
      currentProblemId: problemId,
      savedProblems: persistedProblem
        ? {
            ...state.savedProblems,
            [problemId]: {
              ...persistedProblem,
              problem: state.problem || persistedProblem.problem,
            },
          }
        : state.savedProblems,
    }));

    addNotification({
      type: 'success',
      title: 'Result Saved',
      message: `Result "${result.name}" has been saved to the current problem.`,
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
  problem: Problem | null;
  currentProblemId: string | null;
  savedProblems: Record<string, SavedProblem>;
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
    snapshotProblemOverride?: Problem,
  ) => ProblemResult | null;
  ensureProblemExists: () => Problem;
  setRunSettings: (settings: SolverSettings) => void;
  setLiveVizState: (value: { schedule: Record<string, Record<string, string[]>>; progress: ProgressUpdate | null } | null) => void;
  liveVizLastUiUpdateRef: MutableRefObject<number>;
  runProblemSnapshotRef: MutableRefObject<Problem | null>;
  cancelledRef: MutableRefObject<boolean>;
  solverCompletedRef: MutableRefObject<boolean>;
  restartAfterSaveRef: MutableRefObject<boolean>;
  saveInProgressRef: MutableRefObject<boolean>;
}

export async function runSolver({
  useRecommended,
  problem,
  currentProblemId,
  savedProblems,
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
  ensureProblemExists,
  setRunSettings,
  setLiveVizState,
  liveVizLastUiUpdateRef,
  runProblemSnapshotRef,
  cancelledRef,
  solverCompletedRef,
  restartAfterSaveRef,
  saveInProgressRef,
}: RunSolverArgs) {
  const currentProblem = ensureProblemExists();

  if (!validateProblemForSolve(currentProblem, addNotification)) {
    return;
  }

  try {
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

    runProblemSnapshotRef.current = snapshotProblem(currentProblem);

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
        const sourceProblem = currentProblemId ? savedProblems[currentProblemId] : null;
        const result = sourceProblem?.results.find((savedResult) => savedResult.id === warmStartResultId);
        if (!result) {
          throw new Error('Selected warm-start result not found');
        }
        warmStartSchedule = reconcileResultToInitialSchedule(currentProblem, result);
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

    const { solution, lastProgress, selectedSettings, runProblem } = await solveProblem({
      problem: {
        ...currentProblem,
        settings: solverSettings,
      },
      useRecommendedSettings: useRecommended,
      desiredRuntimeSeconds: desiredRuntimeMain,
      progressCallback,
      warmStartSchedule,
      enableBestScheduleTelemetry: showLiveVizRef.current,
    });

    setRunSettings(runProblem.settings);

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

    const storeProblemId = useAppStore.getState().currentProblemId;
    const activeProblemId = currentProblemId ?? storeProblemId ?? problemStorage.getCurrentProblemId();

    if (activeProblemId && storeProblemId !== activeProblemId) {
      useAppStore.setState({ currentProblemId: activeProblemId });
    }

    let savedResult: ProblemResult | null = null;
    if (activeProblemId) {
      const snapshotProblem = runProblemSnapshotRef.current || undefined;
      if (storeProblemId && storeProblemId === activeProblemId) {
        savedResult = addResult(solution, selectedSettings, undefined, snapshotProblem);
      } else {
        savedResult = persistResultWithExplicitProblemId({
          problemId: activeProblemId,
          solution,
          selectedSettings,
          snapshotProblem,
          addNotification,
        });
      }

      if (!savedResult && activeProblemId) {
        savedResult = persistResultWithExplicitProblemId({
          problemId: activeProblemId,
          solution,
          selectedSettings,
          snapshotProblem,
          addNotification,
        });
      }
    } else {
      addNotification({
        type: 'warning',
        title: 'Result Not Saved',
        message: 'The solver finished, but no current problem was available for saving the result.',
      });
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

        const resumeProblem = runProblem;
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
            await solverWorkerService.solveWithProgressWarmStart(resumeProblem, initialSchedule, progressCallback);
          } catch (e) {
            console.error('[SolverPanel] Warm-start resume failed:', e);
              await runSolver({
                useRecommended: false,
                problem,
                currentProblemId,
                savedProblems,
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
              ensureProblemExists,
              setRunSettings,
              setLiveVizState,
              liveVizLastUiUpdateRef,
              runProblemSnapshotRef,
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
