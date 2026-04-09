import type { MutableRefObject } from 'react';
import type { Scenario, SolverSettings, SolverState, Notification } from '../../../types';
import type { RuntimeProgressUpdate } from '../../../services/runtime';

export type AddNotification = (notification: Omit<Notification, 'id'>) => void;

export function validateScenarioForSolve(scenario: Scenario, addNotification: AddNotification): boolean {
  if (!scenario.people || scenario.people.length === 0) {
    addNotification({
      type: 'error',
      title: 'No People',
      message: 'Please add people to the scenario first',
    });
    return false;
  }

  if (!scenario.groups || scenario.groups.length === 0) {
    addNotification({
      type: 'error',
      title: 'No Groups',
      message: 'Please add groups to the scenario first',
    });
    return false;
  }

  return true;
}

export function buildRunSettings(selectedSettings: SolverSettings, showLiveViz: boolean): SolverSettings {
  if (!showLiveViz) {
    return selectedSettings;
  }

  return {
    ...selectedSettings,
    telemetry: {
      ...(selectedSettings.telemetry || {}),
      emit_best_schedule: true,
      best_schedule_every_n_callbacks: selectedSettings.telemetry?.best_schedule_every_n_callbacks ?? 3,
    },
  };
}

export function snapshotScenario(scenario: Scenario): Scenario {
  try {
    return JSON.parse(JSON.stringify(scenario)) as Scenario;
  } catch {
    return { ...scenario } as Scenario;
  }
}

function finiteNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function mapProgressToSolverState(progress: RuntimeProgressUpdate): Partial<SolverState> {
  return {
    latestProgress: progress,
    ...(progress.iteration === 0 && { initialConstraintPenalty: finiteNumber(progress.current_constraint_penalty) }),
    currentIteration: finiteNumber(progress.iteration),
    currentScore: finiteNumber(progress.current_score),
    bestScore: finiteNumber(progress.best_score),
    elapsedTime: finiteNumber(progress.elapsed_seconds) * 1000,
    noImprovementCount: finiteNumber(progress.no_improvement_count),
    temperature: finiteNumber(progress.temperature),
    coolingProgress: finiteNumber(progress.cooling_progress),
    cliqueSwapsTried: finiteNumber(progress.clique_swaps_tried),
    cliqueSwapsAccepted: finiteNumber(progress.clique_swaps_accepted),
    transfersTried: finiteNumber(progress.transfers_tried),
    transfersAccepted: finiteNumber(progress.transfers_accepted),
    swapsTried: finiteNumber(progress.swaps_tried),
    swapsAccepted: finiteNumber(progress.swaps_accepted),
    overallAcceptanceRate: finiteNumber(progress.overall_acceptance_rate),
    recentAcceptanceRate: finiteNumber(progress.recent_acceptance_rate),
    avgAttemptedMoveDelta: finiteNumber(progress.avg_attempted_move_delta),
    avgAcceptedMoveDelta: finiteNumber(progress.avg_accepted_move_delta),
    biggestAcceptedIncrease: finiteNumber(progress.biggest_accepted_increase),
    biggestAttemptedIncrease: finiteNumber(progress.biggest_attempted_increase),
    currentRepetitionPenalty: finiteNumber(progress.current_repetition_penalty),
    currentBalancePenalty: finiteNumber(progress.current_balance_penalty),
    currentConstraintPenalty: finiteNumber(progress.current_constraint_penalty),
    bestRepetitionPenalty: finiteNumber(progress.best_repetition_penalty),
    bestBalancePenalty: finiteNumber(progress.best_balance_penalty),
    bestConstraintPenalty: finiteNumber(progress.best_constraint_penalty),
    reheatsPerformed: finiteNumber(progress.reheats_performed),
    iterationsSinceLastReheat: finiteNumber(progress.iterations_since_last_reheat),
    localOptimaEscapes: finiteNumber(progress.local_optima_escapes),
    avgTimePerIterationMs: finiteNumber(progress.avg_time_per_iteration_ms),
    cliqueSwapSuccessRate: finiteNumber(progress.clique_swap_success_rate),
    transferSuccessRate: finiteNumber(progress.transfer_success_rate),
    swapSuccessRate: finiteNumber(progress.swap_success_rate),
    scoreVariance: finiteNumber(progress.score_variance),
    searchEfficiency: finiteNumber(progress.search_efficiency),
  };
}

export function createProgressCallback({
  showLiveVizRef,
  solverCompletedRef,
  cancelledRef,
  setSolverState,
  setLiveVizState,
  liveVizLastUiUpdateRef,
}: {
  showLiveVizRef: MutableRefObject<boolean>;
  solverCompletedRef: MutableRefObject<boolean>;
  cancelledRef: MutableRefObject<boolean>;
  setSolverState: (partial: Partial<SolverState>) => void;
  setLiveVizState: (value: { schedule: Record<string, Record<string, string[]>>; progress: RuntimeProgressUpdate | null } | null) => void;
  liveVizLastUiUpdateRef: MutableRefObject<number>;
}) {
  return (progress: RuntimeProgressUpdate): void => {
    if (solverCompletedRef.current || cancelledRef.current) {
      return;
    }

    setSolverState(mapProgressToSolverState(progress));

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
}
