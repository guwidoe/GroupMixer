import type { MutableRefObject } from 'react';
import type { Problem, ProblemResult, SavedProblem, SolverSettings, SolverState, Solution, Notification } from '../../../types';
import type { ProgressUpdate } from '../../../services/wasm/types';
import { solverWorkerService } from '../../../services/solverWorker';
import { reconcileResultToInitialSchedule } from '../../../utils/warmStart';
import { useAppStore } from '../../../store';
import { normalizeRecommendedSolverSettings } from './recommendedSettings';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

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
  const activeProblemId = useAppStore.getState().currentProblemId;

  if (!currentProblem.people || currentProblem.people.length === 0) {
    addNotification({
      type: 'error',
      title: 'No People',
      message: 'Please add people to the problem first',
    });
    return;
  }

  if (!currentProblem.groups || currentProblem.groups.length === 0) {
    addNotification({
      type: 'error',
      title: 'No Groups',
      message: 'Please add groups to the problem first',
    });
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

    let selectedSettings: SolverSettings = solverSettings;

    if (useRecommended) {
      try {
        const rawSettings = await solverWorkerService.getRecommendedSettings(
          currentProblem,
          desiredRuntimeMain ?? 3,
        );
        selectedSettings = normalizeRecommendedSolverSettings(rawSettings as SolverSettings);
      } catch (err) {
        console.error('[SolverPanel] Failed to fetch recommended settings – falling back to existing settings', err);
      }
    }

    const runSelectedSettings: SolverSettings = showLiveVizRef.current
      ? {
          ...selectedSettings,
          telemetry: {
            ...(selectedSettings.telemetry || {}),
            emit_best_schedule: true,
            best_schedule_every_n_callbacks: selectedSettings.telemetry?.best_schedule_every_n_callbacks ?? 3,
          },
        }
      : selectedSettings;

    setRunSettings(runSelectedSettings);
    setLiveVizState(null);
    liveVizLastUiUpdateRef.current = 0;

    const problemWithSettings = {
      ...currentProblem,
      settings: runSelectedSettings,
    };

    try {
      runProblemSnapshotRef.current = JSON.parse(JSON.stringify(currentProblem));
    } catch {
      runProblemSnapshotRef.current = { ...currentProblem } as Problem;
    }

    const progressCallback = (progress: ProgressUpdate): void => {
      if (solverCompletedRef.current) {
        return;
      }
      if (cancelledRef.current) {
        return;
      }

      setSolverState({
        ...(progress.iteration === 0 && { initialConstraintPenalty: progress.current_constraint_penalty }),
        currentIteration: progress.iteration,
        currentScore: progress.current_score,
        bestScore: progress.best_score,
        elapsedTime: progress.elapsed_seconds * 1000,
        noImprovementCount: progress.no_improvement_count,
        temperature: progress.temperature,
        coolingProgress: progress.cooling_progress,
        cliqueSwapsTried: progress.clique_swaps_tried,
        cliqueSwapsAccepted: progress.clique_swaps_accepted,
        transfersTried: progress.transfers_tried,
        transfersAccepted: progress.transfers_accepted,
        swapsTried: progress.swaps_tried,
        swapsAccepted: progress.swaps_accepted,
        overallAcceptanceRate: progress.overall_acceptance_rate,
        recentAcceptanceRate: progress.recent_acceptance_rate,
        avgAttemptedMoveDelta: progress.avg_attempted_move_delta,
        avgAcceptedMoveDelta: progress.avg_accepted_move_delta,
        biggestAcceptedIncrease: progress.biggest_accepted_increase,
        biggestAttemptedIncrease: progress.biggest_attempted_increase,
        currentRepetitionPenalty: progress.current_repetition_penalty,
        currentBalancePenalty: progress.current_balance_penalty,
        currentConstraintPenalty: progress.current_constraint_penalty,
        bestRepetitionPenalty: progress.best_repetition_penalty,
        bestBalancePenalty: progress.best_balance_penalty,
        bestConstraintPenalty: progress.best_constraint_penalty,
        reheatsPerformed: progress.reheats_performed,
        iterationsSinceLastReheat: progress.iterations_since_last_reheat,
        localOptimaEscapes: progress.local_optima_escapes,
        avgTimePerIterationMs: progress.avg_time_per_iteration_ms,
        cliqueSwapSuccessRate: progress.clique_swap_success_rate,
        transferSuccessRate: progress.transfer_success_rate,
        swapSuccessRate: progress.swap_success_rate,
        scoreVariance: progress.score_variance,
        searchEfficiency: progress.search_efficiency,
      });

      if (showLiveVizRef.current && progress.best_schedule) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - liveVizLastUiUpdateRef.current > 200) {
          liveVizLastUiUpdateRef.current = now;
          setLiveVizState({
            schedule: progress.best_schedule,
            progress,
          });
        }
      }

    };

    let solution;
    let lastProgress;
    if (warmStartResultId) {
      try {
        const sourceProblem = currentProblemId ? savedProblems[currentProblemId] : null;
        const result = sourceProblem?.results.find((r) => r.id === warmStartResultId);
        if (!result) {
          throw new Error('Selected warm-start result not found');
        }
        const initialSchedule = reconcileResultToInitialSchedule(currentProblem, result);
        setWarmStartFromResult(null);
        const out = await solverWorkerService.solveWithProgressWarmStart(
          problemWithSettings,
          initialSchedule,
          progressCallback,
        );
        solution = out.solution;
        lastProgress = out.lastProgress;
      } catch (e) {
        console.error('[SolverPanel] Warm-start failed, falling back to normal start:', e);
        addNotification({
          type: 'warning',
          title: 'Warm Start Failed',
          message: e instanceof Error ? e.message : 'Falling back to default start',
        });
        setWarmStartFromResult(null);
        const out = await solverWorkerService.solveWithProgress(problemWithSettings, progressCallback);
        solution = out.solution;
        lastProgress = out.lastProgress;
      }
    } else {
      const out = await solverWorkerService.solveWithProgress(problemWithSettings, progressCallback);
      solution = out.solution;
      lastProgress = out.lastProgress;
    }

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

    let savedResult: ProblemResult | null = null;
    if (activeProblemId) {
      savedResult = addResult(solution, selectedSettings, undefined, runProblemSnapshotRef.current || undefined);
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

        const resumeProblem = problemWithSettings;
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
