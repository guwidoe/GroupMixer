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

const emptyMoveTelemetry = {
  attempts: 0,
  accepted: 0,
  rejected: 0,
  preview_seconds: 0,
  apply_seconds: 0,
  full_recalculation_count: 0,
  full_recalculation_seconds: 0,
};

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

  it('uses solver3-specific metric labels instead of simulated-annealing wording', () => {
    const { container } = render(
      <DetailedMetrics
        solverState={createSolverState({
          latestProgress: {
            iteration: 1,
            max_iterations: 10,
            temperature: 0.25,
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
            overall_acceptance_rate: 0,
            recent_acceptance_rate: 0,
            avg_attempted_move_delta: 0,
            avg_accepted_move_delta: 0,
            biggest_accepted_increase: 0,
            biggest_attempted_increase: 0,
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
            cooling_progress: 0.5,
            clique_swap_success_rate: 0,
            transfer_success_rate: 0,
            swap_success_rate: 0,
            score_variance: 0,
            search_efficiency: 0,
          },
        })}
        displaySettings={createDefaultSolverSettings('solver3')}
        showMetrics={true}
        onToggleMetrics={() => {}}
      />,
    );

    expect(container).toHaveTextContent('Acceptance Threshold');
    expect(container).toHaveTextContent('Search Schedule Progress');
    expect(container).not.toHaveTextContent('Cooling Progress');
  });

  it('renders auto route and budget telemetry from the completed solution', () => {
    const { container } = render(
      <DetailedMetrics
        solverState={createSolverState({
          isRunning: false,
          isComplete: true,
          latestSolution: {
            assignments: [],
            final_score: 0,
            unique_contacts: 0,
            repetition_penalty: 0,
            attribute_balance_penalty: 0,
            constraint_penalty: 0,
            iteration_count: 10,
            elapsed_time_ms: 1000,
            benchmark_telemetry: {
              effective_seed: 7,
              move_policy: {},
              stop_reason: 'time_limit_reached',
              iterations_completed: 10,
              no_improvement_count: 1,
              reheats_performed: 0,
              initial_score: 4,
              best_score: 0,
              final_score: 0,
              initialization_seconds: 0.2,
              search_seconds: 0.8,
              finalization_seconds: 0,
              total_seconds: 1,
              auto: {
                selected_solver: 'solver3',
                complexity_model_version: 'problem_complexity_v1',
                complexity_score: 12.5,
                total_budget_seconds: 1,
                oracle_construction_budget_seconds: 0.3,
                scaffold_budget_seconds: 0.09,
                oracle_recombination_budget_seconds: 0.21,
                search_budget_seconds: 0.7,
                constructor_attempt: 'constraint_scenario_oracle_guided',
                constructor_outcome: 'success',
                constructor_fallback_used: false,
                constructor_wall_seconds: 0.12,
              },
              moves: {
                swap: emptyMoveTelemetry,
                transfer: emptyMoveTelemetry,
                clique_swap: emptyMoveTelemetry,
              },
            },
          },
        })}
        displaySettings={createDefaultSolverSettings('auto')}
        showMetrics={true}
        onToggleMetrics={() => {}}
      />,
    );

    expect(container).toHaveTextContent('Auto Route and Budget Telemetry');
    expect(container).toHaveTextContent('Selected Solver');
    expect(container).toHaveTextContent('solver3');
    expect(container).toHaveTextContent('problem_complexity_v1');
    expect(container).toHaveTextContent('Search Budget');
    expect(container).toHaveTextContent('0.70s');
  });
});
