import { describe, expect, it } from "vitest";
import {
  convertScenarioToRustFormat,
  convertRustResultToSolution,
} from "../wasm/conversions";
import { createSampleScenario } from "../../test/fixtures";
import type { ProgressUpdate } from "../wasm/types";

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

describe("shared solver conversions", () => {
  it("preserves explicit objectives and normalizes immovable sessions", () => {
    const rustScenario = convertScenarioToRustFormat(
      createSampleScenario({
        objectives: [{ type: "custom-objective", weight: 2 }],
        constraints: [
          {
            type: "ImmovablePeople",
            people: ["p1", "p2"],
            group_id: "g1",
            sessions: [],
          },
          {
            type: "AttributeBalance",
            group_id: "g1",
            attribute_key: "team",
            desired_values: { A: 1 },
            penalty_weight: undefined as unknown as number,
          },
        ],
      })
    ) as {
      objectives: Array<{ type: string; weight: number }>;
      constraints: Array<Record<string, unknown>>;
    };

    expect(rustScenario.objectives).toEqual([{ type: "custom-objective", weight: 2 }]);
    expect(rustScenario.constraints[0].sessions).toEqual([0, 1]);
    expect(rustScenario.constraints[1].penalty_weight).toBe(50);
  });

  it("uses the first available progress payload for iteration and elapsed time", () => {
    const solution = convertRustResultToSolution(
      {
        schedule: { session_0: { g1: ["p1"] } },
        final_score: 9,
        unique_contacts: 1,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
        weighted_repetition_penalty: 0,
        weighted_constraint_penalty: 0,
      },
      null,
      progress
    );

    expect(solution.assignments).toEqual([
      { person_id: "p1", group_id: "g1", session_id: 0 },
    ]);
    expect(solution.iteration_count).toBe(7);
    expect(solution.elapsed_time_ms).toBe(2000);
  });

  it("converts browser-local wasm Map schedules into assignments", () => {
    const solution = convertRustResultToSolution(
      {
        schedule: new Map([
          [
            "session_0",
            new Map([
              ["g1", ["p1", "p2"]],
              ["g2", ["p3", "p4"]],
            ]),
          ],
          [
            "session_1",
            new Map([
              ["g1", ["p1", "p3"]],
              ["g2", ["p2", "p4"]],
            ]),
          ],
        ]) as unknown as Record<string, Record<string, string[]>>,
        final_score: 9,
        unique_contacts: 4,
        repetition_penalty: 0,
        attribute_balance_penalty: 0,
        constraint_penalty: 0,
        weighted_repetition_penalty: 0,
        weighted_constraint_penalty: 0,
      },
      progress,
      null
    );

    expect(solution.assignments).toEqual([
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g1", session_id: 0 },
      { person_id: "p3", group_id: "g2", session_id: 0 },
      { person_id: "p4", group_id: "g2", session_id: 0 },
      { person_id: "p1", group_id: "g1", session_id: 1 },
      { person_id: "p3", group_id: "g1", session_id: 1 },
      { person_id: "p2", group_id: "g2", session_id: 1 },
      { person_id: "p4", group_id: "g2", session_id: 1 },
    ]);
  });
});
