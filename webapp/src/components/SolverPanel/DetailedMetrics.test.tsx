import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDefaultSolverSettings } from '../../services/solverUi';
import type { SolverState } from '../../types';
import DetailedMetrics from './DetailedMetrics';

function createSolverState(overrides: Partial<SolverState> = {}): SolverState {
  return {
    isRunning: true,
    isComplete: false,
    currentIteration: 0,
    bestScore: 0,
    elapsedTime: 0,
    noImprovementCount: 0,
    ...overrides,
  };
}

describe('DetailedMetrics', () => {
  it('does not render NaN or Infinity when solver metrics contain non-finite values', () => {
    const { container } = render(
      <DetailedMetrics
        solverState={createSolverState({
          latestProgress: {
            iteration: 1,
            max_iterations: 10,
            temperature: Number.NaN,
            current_score: 1,
            best_score: 1,
            current_contacts: 0,
            best_contacts: 0,
            repetition_penalty: 0,
            elapsed_seconds: 0,
            no_improvement_count: 0,
            clique_swaps_tried: 0,
            clique_swaps_accepted: 0,
            clique_swaps_rejected: 0,
            transfers_tried: 0,
            transfers_accepted: 0,
            transfers_rejected: 0,
            swaps_tried: 0,
            swaps_accepted: 0,
            swaps_rejected: 0,
            overall_acceptance_rate: Number.POSITIVE_INFINITY,
            recent_acceptance_rate: 0,
            avg_attempted_move_delta: Number.POSITIVE_INFINITY,
            avg_accepted_move_delta: 0,
            biggest_accepted_increase: 0,
            biggest_attempted_increase: Number.POSITIVE_INFINITY,
            current_repetition_penalty: 0,
            current_balance_penalty: 0,
            current_constraint_penalty: 0,
            best_repetition_penalty: 0,
            best_balance_penalty: 0,
            best_constraint_penalty: 0,
            reheats_performed: 0,
            iterations_since_last_reheat: 0,
            local_optima_escapes: 0,
            avg_time_per_iteration_ms: 0,
            cooling_progress: Number.NaN,
            clique_swap_success_rate: 0,
            transfer_success_rate: 0,
            swap_success_rate: 0,
            score_variance: 0,
            search_efficiency: 0,
          },
        })}
        displaySettings={createDefaultSolverSettings('solver1')}
        showMetrics={true}
        onToggleMetrics={() => {}}
      />,
    );

    expect(container).not.toHaveTextContent('NaN');
    expect(container).not.toHaveTextContent('Infinity');
  });
});
