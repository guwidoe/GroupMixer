import { describe, expect, it } from 'vitest';
import type { ProgressUpdate } from '../../../services/wasm/types';
import { mapProgressToSolverState } from './runSolverHelpers';

function createProgress(overrides: Partial<ProgressUpdate> = {}): ProgressUpdate {
  return {
    iteration: 0,
    max_iterations: 100,
    temperature: 0.5,
    current_score: 10,
    best_score: 9,
    current_contacts: 4,
    best_contacts: 5,
    repetition_penalty: 1,
    elapsed_seconds: 2,
    no_improvement_count: 3,
    clique_swaps_tried: 1,
    clique_swaps_accepted: 0,
    clique_swaps_rejected: 1,
    transfers_tried: 2,
    transfers_accepted: 1,
    transfers_rejected: 1,
    swaps_tried: 3,
    swaps_accepted: 1,
    swaps_rejected: 2,
    overall_acceptance_rate: 0.25,
    recent_acceptance_rate: 0.5,
    avg_attempted_move_delta: -0.5,
    avg_accepted_move_delta: -1.5,
    biggest_accepted_increase: 2,
    biggest_attempted_increase: 5,
    current_repetition_penalty: 1,
    current_balance_penalty: 0,
    current_constraint_penalty: 0,
    best_repetition_penalty: 1,
    best_balance_penalty: 0,
    best_constraint_penalty: 0,
    reheats_performed: 0,
    iterations_since_last_reheat: 0,
    local_optima_escapes: 0,
    avg_time_per_iteration_ms: 0.2,
    cooling_progress: 0.1,
    clique_swap_success_rate: 0,
    transfer_success_rate: 0.5,
    swap_success_rate: 0.33,
    score_variance: 1.2,
    search_efficiency: 4.5,
    ...overrides,
  };
}

describe('mapProgressToSolverState', () => {
  it('sanitizes non-finite progress metrics before they reach the UI', () => {
    const mapped = mapProgressToSolverState(
      createProgress({
        temperature: Number.NaN,
        avg_attempted_move_delta: Number.POSITIVE_INFINITY,
        biggest_attempted_increase: Number.NEGATIVE_INFINITY,
        cooling_progress: Number.NaN,
        overall_acceptance_rate: Number.POSITIVE_INFINITY,
        avg_time_per_iteration_ms: Number.NaN,
      }),
    );

    expect(mapped.temperature).toBe(0);
    expect(mapped.avgAttemptedMoveDelta).toBe(0);
    expect(mapped.biggestAttemptedIncrease).toBe(0);
    expect(mapped.coolingProgress).toBe(0);
    expect(mapped.overallAcceptanceRate).toBe(0);
    expect(mapped.avgTimePerIterationMs).toBe(0);
  });
});
