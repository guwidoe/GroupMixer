import type {
  Problem,
  ProblemResult,
  SavedProblem,
  Solution,
  SolverSettings,
} from "../types";

export function createSampleSolverSettings(): SolverSettings {
  return {
    solver_type: "SimulatedAnnealing",
    stop_conditions: {
      max_iterations: 100,
      time_limit_seconds: 10,
      no_improvement_iterations: 25,
    },
    solver_params: {
      SimulatedAnnealing: {
        initial_temperature: 1,
        final_temperature: 0.01,
        cooling_schedule: "geometric",
        reheat_cycles: 0,
        reheat_after_no_improvement: 0,
      },
    },
  };
}

export function createSampleProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    people: [
      { id: "p1", attributes: { name: "Alice", team: "A" } },
      { id: "p2", attributes: { name: "Bob", team: "B" } },
      { id: "p3", attributes: { name: "Cara", team: "A" } },
      { id: "p4", attributes: { name: "Dan", team: "B" } },
    ],
    groups: [
      { id: "g1", size: 2 },
      { id: "g2", size: 2 },
    ],
    num_sessions: 2,
    objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
    constraints: [],
    settings: createSampleSolverSettings(),
    ...overrides,
  };
}

export function createSampleSolution(
  overrides: Partial<Solution> = {}
): Solution {
  return {
    assignments: [
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g1", session_id: 0 },
      { person_id: "p3", group_id: "g2", session_id: 0 },
      { person_id: "p4", group_id: "g2", session_id: 0 },
      { person_id: "p1", group_id: "g1", session_id: 1 },
      { person_id: "p3", group_id: "g1", session_id: 1 },
      { person_id: "p2", group_id: "g2", session_id: 1 },
      { person_id: "p4", group_id: "g2", session_id: 1 },
    ],
    final_score: 12.5,
    unique_contacts: 4,
    repetition_penalty: 1,
    attribute_balance_penalty: 0,
    constraint_penalty: 0,
    iteration_count: 42,
    elapsed_time_ms: 1234,
    weighted_repetition_penalty: 2,
    weighted_constraint_penalty: 0,
    ...overrides,
  };
}

export function createSavedProblem(overrides: Partial<SavedProblem> = {}): SavedProblem {
  const problem = overrides.problem ?? createSampleProblem();
  const result: ProblemResult = {
    id: "result-1",
    name: "Baseline",
    solution: createSampleSolution(),
    solverSettings: problem.settings,
    problemSnapshot: {
      people: problem.people,
      groups: problem.groups,
      num_sessions: problem.num_sessions,
      objectives: problem.objectives,
      constraints: problem.constraints,
    },
    timestamp: 1000,
    duration: 1234,
  };

  return {
    id: "problem-1",
    name: "Sample Problem",
    problem,
    results: [result],
    createdAt: 1000,
    updatedAt: 1000,
    isTemplate: false,
    ...overrides,
  };
}
