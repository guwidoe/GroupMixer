import { describe, expect, it } from "vitest";
import { convertRustResultToSolution } from "./conversions";
import { normalizeScenarioForWasm } from "./scenarioContract";
import { createSampleScenario } from "../../test/fixtures";
import type { ProgressUpdate, RustResult } from "./types";

const progress: ProgressUpdate = {
  iteration: 42,
  max_iterations: 100,
  temperature: 0.5,
  current_score: 10,
  best_score: 9,
  current_contacts: 4,
  best_contacts: 5,
  repetition_penalty: 1,
  elapsed_seconds: 1.5,
  no_improvement_count: 3,
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

const rustResult: RustResult = {
  schedule: {
    session_0: {
      g1: ["p1", "p2"],
      g2: ["p3", "p4"],
    },
  },
  final_score: 12,
  unique_contacts: 4,
  repetition_penalty: 1,
  attribute_balance_penalty: 0,
  constraint_penalty: 0,
  weighted_repetition_penalty: 2,
  weighted_constraint_penalty: 0,
};

describe("wasm conversions", () => {
  it("sanitizes solver params and fills in default weights/sessions", () => {
    const rustScenario = normalizeScenarioForWasm(
      createSampleScenario({
        constraints: [
          {
            type: "ShouldStayTogether",
            people: ["p1", "p2"],
            penalty_weight: undefined as unknown as number,
          },
          {
            type: "ImmovablePerson",
            person_id: "p1",
            group_id: "g1",
            sessions: [],
          },
          {
            type: "RepeatEncounter",
            max_allowed_encounters: 1,
            penalty_function: "squared",
            penalty_weight: undefined as unknown as number,
          },
        ],
        settings: {
          ...createSampleScenario().settings,
          solver_params: {
            SimulatedAnnealing: {
              initial_temperature: Number.NaN,
              final_temperature: Number.NaN,
              cooling_schedule: "geometric",
              reheat_cycles: Number.NaN,
              reheat_after_no_improvement: Number.NaN,
            },
          },
        },
        objectives: [],
      })
    ) as {
      objectives: Array<{ type: string; weight: number }>;
      constraints: Array<Record<string, unknown>>;
      settings: { solver_params: Record<string, number | string> };
    };

    expect(rustScenario.objectives).toEqual([
      { type: "maximize_unique_contacts", weight: 1 },
    ]);
    expect(rustScenario.constraints[0].penalty_weight).toBe(1000);
    expect(rustScenario.constraints[1].sessions).toEqual([0, 1]);
    expect(rustScenario.constraints[2].penalty_weight).toBe(1);
    expect(rustScenario.settings.solver_params.initial_temperature).toBe(1);
    expect(rustScenario.settings.solver_params.final_temperature).toBe(0.01);
    expect(rustScenario.settings.solver_params.reheat_cycles).toBe(0);
    expect(rustScenario.settings.solver_params.reheat_after_no_improvement).toBe(0);
  });

  it("passes session-specific group capacities through to Rust", () => {
    const rustScenario = normalizeScenarioForWasm(
      createSampleScenario({
        num_sessions: 3,
        groups: [
          { id: 'g1', size: 4, session_sizes: [4, 0, 2] },
          { id: 'g2', size: 3 },
        ],
      }),
    ) as {
      groups: Array<{ id: string; size: number; session_sizes?: number[] }>;
    };

    expect(rustScenario.groups).toEqual([
      { id: 'g1', size: 4, session_sizes: [4, 0, 2] },
      { id: 'g2', size: 3 },
    ]);
  });

  it("flattens Rust schedules into frontend assignments and timing", () => {
    const solution = convertRustResultToSolution(rustResult, progress);

    expect(solution.assignments).toEqual([
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g1", session_id: 0 },
      { person_id: "p3", group_id: "g2", session_id: 0 },
      { person_id: "p4", group_id: "g2", session_id: 0 },
    ]);
    expect(solution.iteration_count).toBe(42);
    expect(solution.elapsed_time_ms).toBe(1500);
    expect(solution.weighted_repetition_penalty).toBe(2);
  });
});
