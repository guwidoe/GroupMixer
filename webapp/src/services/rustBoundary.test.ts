import { describe, expect, it } from 'vitest';
import { createSampleScenario } from '../test/fixtures';
import {
  buildRustScenarioJson,
  buildWarmStartScenarioJson,
  parseProgressUpdate,
  parseRustSolution,
} from './rustBoundary';
import type { ProgressUpdate } from './wasm/types';

const progress: ProgressUpdate = {
  iteration: 7,
  max_iterations: 100,
  temperature: 0.5,
  current_score: 10,
  best_score: 9,
  current_contacts: 4,
  best_contacts: 5,
  repetition_penalty: 1,
  elapsed_seconds: 2,
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
  cooling_progress: 0,
  clique_swap_success_rate: 0,
  transfer_success_rate: 0,
  swap_success_rate: 0,
  score_variance: 0,
  search_efficiency: 0,
};

describe('rustBoundary', () => {
  it('builds both standard and warm-start solver payloads', () => {
    const scenario = createSampleScenario({
      groups: [
        { id: 'g1', size: 2, session_sizes: [2, 1] },
        { id: 'g2', size: 2 },
      ],
    });
    const scenarioPayload = JSON.parse(buildRustScenarioJson(scenario)) as {
      scenario: { num_sessions: number; groups: Array<{ id: string; size: number; session_sizes?: number[] }> };
      initial_schedule?: unknown;
    };
    const warmStartPayload = JSON.parse(
      buildWarmStartScenarioJson(scenario, { session_0: { g1: ['p1'] } }),
    ) as {
      initial_schedule: Record<string, Record<string, string[]>>;
    };

    expect(scenarioPayload.scenario.num_sessions).toBe(scenario.num_sessions);
    expect(scenarioPayload.scenario.groups).toEqual([
      { id: 'g1', size: 2, session_sizes: [2, 1] },
      { id: 'g2', size: 2 },
    ]);
    expect(scenarioPayload.initial_schedule).toBeUndefined();
    expect(warmStartPayload.initial_schedule).toEqual({ session_0: { g1: ['p1'] } });
  });

  it('parses progress and result payloads through the shared boundary translator', () => {
    const parsedProgress = parseProgressUpdate(JSON.stringify(progress));
    const solution = parseRustSolution(
      JSON.stringify({
        schedule: { session_0: { g1: ['p1'] } },
        final_score: 9,
        unique_contacts: 1,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
        weighted_repetition_penalty: 0,
        weighted_constraint_penalty: 0,
      }),
      parsedProgress,
    );

    expect(parsedProgress.iteration).toBe(7);
    expect(solution.assignments).toEqual([{ person_id: 'p1', group_id: 'g1', session_id: 0 }]);
    expect(solution.iteration_count).toBe(7);
    expect(solution.elapsed_time_ms).toBe(2000);
  });
});
