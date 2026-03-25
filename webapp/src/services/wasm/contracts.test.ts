import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "../../types";
import { createSampleProblem, createSampleSolverSettings } from "../../test/fixtures";
import { buildRustProblemPayload } from "../rustBoundary";
import { convertRustResultToSolution } from "./conversions";
import {
  normalizeContractError,
  WasmContractClient,
  WasmContractClientError,
} from "./contracts";

vi.mock("../rustBoundary", () => ({
  buildRustProblemPayload: vi.fn(() => ({
    problem: { people: [], groups: [], num_sessions: 2 },
    objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
    constraints: [],
    solver: { solver_type: "SimulatedAnnealing" },
  })),
}));

vi.mock("./conversions", () => ({
  convertRustResultToSolution: vi.fn(() => ({
    assignments: [{ person_id: "p1", group_id: "g1", session_id: 0 }],
    final_score: 9,
    unique_contacts: 1,
    repetition_penalty: 0,
    attribute_balance_penalty: 0,
    constraint_penalty: 0,
    iteration_count: 7,
    elapsed_time_ms: 1200,
  })),
}));

type FakeContractModule = {
  solve: ReturnType<typeof vi.fn>;
  solve_with_progress: ReturnType<typeof vi.fn>;
  validate_problem: ReturnType<typeof vi.fn>;
  get_default_solver_configuration: ReturnType<typeof vi.fn>;
  recommend_settings: ReturnType<typeof vi.fn>;
  evaluate_input: ReturnType<typeof vi.fn>;
  inspect_result: ReturnType<typeof vi.fn>;
  solve_legacy_json: ReturnType<typeof vi.fn>;
  validate_problem_legacy_json: ReturnType<typeof vi.fn>;
  get_default_settings_legacy_json: ReturnType<typeof vi.fn>;
  get_recommended_settings_legacy_json: ReturnType<typeof vi.fn>;
  solve_with_progress_legacy_json: ReturnType<typeof vi.fn>;
  default: ReturnType<typeof vi.fn>;
};

function createProblem(): Problem {
  return createSampleProblem();
}

function createContractModule(): FakeContractModule {
  return {
    solve: vi.fn(() => ({ schedule: {}, final_score: 8, unique_contacts: 2 })),
    solve_with_progress: vi.fn((_: Record<string, unknown>, callback?: ((progress: unknown) => boolean) | null) => {
      callback?.({ iteration: 5, elapsed_seconds: 1.5, best_score: 7 });
      return { schedule: {}, final_score: 9, unique_contacts: 1 };
    }),
    validate_problem: vi.fn(() => ({ valid: true, issues: [] })),
    get_default_solver_configuration: vi.fn(() => createSampleSolverSettings()),
    recommend_settings: vi.fn(() => createSampleSolverSettings()),
    evaluate_input: vi.fn(() => ({ schedule: {}, final_score: 6, unique_contacts: 2 })),
    inspect_result: vi.fn(() => ({ final_score: 9, unique_contacts: 1, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 })),
    solve_legacy_json: vi.fn(),
    validate_problem_legacy_json: vi.fn(),
    get_default_settings_legacy_json: vi.fn(),
    get_recommended_settings_legacy_json: vi.fn(),
    solve_with_progress_legacy_json: vi.fn(),
    default: vi.fn(async () => ({ memory: {} })),
  };
}

describe("WasmContractClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes when the module exposes the canonical contract surface", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await client.initialize();

    expect(wasmModule.default).toHaveBeenCalledTimes(1);
    expect(client.isReady()).toBe(true);
    expect(client.hasInitializationFailed()).toBe(false);
  });

  it("rejects modules missing the canonical contract exports", async () => {
    const client = new WasmContractClient(async () => ({ default: vi.fn(async () => ({ memory: {} })) }));

    await expect(client.initialize()).rejects.toThrow(
      "Failed to initialize contract-native WASM solver: WASM module shape does not match the expected contract-native runtime surface.",
    );
    expect(client.hasInitializationFailed()).toBe(true);
  });

  it("returns default solver configuration and runtime-aware recommendations", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);
    const problem = createProblem();

    await expect(client.getDefaultSolverConfiguration()).resolves.toEqual(createSampleSolverSettings());
    await expect(client.recommendSettings(problem, 11)).resolves.toEqual(createSampleSolverSettings());

    expect(wasmModule.recommend_settings).toHaveBeenCalledWith({
      problem_definition: { people: [], groups: [], num_sessions: 2 },
      objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
      constraints: [],
      desired_runtime_seconds: 11,
    });
  });

  it("solves with structured progress payloads and converts results once", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);
    const progressCallback = vi.fn();

    const result = await client.solveWithProgress(createProblem(), progressCallback);

    expect(buildRustProblemPayload).toHaveBeenCalled();
    expect(wasmModule.solve_with_progress).toHaveBeenCalledWith(
      expect.objectContaining({ problem: expect.any(Object) }),
      expect.any(Function),
    );
    expect(progressCallback).toHaveBeenCalledWith({ iteration: 5, elapsed_seconds: 1.5, best_score: 7 });
    expect(result.lastProgress).toEqual({ iteration: 5, elapsed_seconds: 1.5, best_score: 7 });
    expect(convertRustResultToSolution).toHaveBeenCalledWith(
      { schedule: {}, final_score: 9, unique_contacts: 1 },
      { iteration: 5, elapsed_seconds: 1.5, best_score: 7 },
    );
  });

  it("uses the clean solve export for non-progress solves", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await client.solve(createProblem());

    expect(wasmModule.solve).toHaveBeenCalledWith(
      expect.objectContaining({ problem: expect.any(Object) }),
    );
  });

  it("attaches initial_schedule for structured evaluation calls", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await client.evaluateInput(createProblem(), [
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g2", session_id: 1 },
    ]);

    expect(wasmModule.evaluate_input).toHaveBeenCalledWith({
      problem: { people: [], groups: [], num_sessions: 2 },
      objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
      constraints: [],
      solver: { solver_type: "SimulatedAnnealing" },
      initial_schedule: {
        session_0: { g1: ["p1"] },
        session_1: { g2: ["p2"] },
      },
    });
  });

  it("normalizes canonical public error envelopes once in the adapter", async () => {
    const wasmModule = createContractModule();
    wasmModule.recommend_settings.mockImplementation(() => {
      throw {
        error: {
          code: "invalid-input",
          message: "recommendation request rejected",
        },
      };
    });
    const client = new WasmContractClient(async () => wasmModule);

    await expect(client.recommendSettings(createProblem(), 5)).rejects.toThrow(
      "Failed to recommend solver settings: invalid-input: recommendation request rejected",
    );
  });
});

describe("normalizeContractError", () => {
  it("returns a typed error for public error envelopes", () => {
    const error = normalizeContractError(
      {
        error: {
          code: "invalid-input",
          message: "problem rejected",
        },
      },
      "Failed to solve problem",
    );

    expect(error).toBeInstanceOf(WasmContractClientError);
    expect(error.code).toBe("invalid-input");
    expect(error.message).toBe("Failed to solve problem: invalid-input: problem rejected");
  });
});
