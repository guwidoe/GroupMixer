import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "../types";
import { createSampleProblem, createSampleSolverSettings } from "../test/fixtures";
import { WasmService } from "./wasm";
import {
  buildRustProblemJson,
  buildRustProblemPayload,
  parseProgressUpdate,
  parseRustSolution,
} from "./rustBoundary";

vi.mock("./rustBoundary", () => ({
  buildRustProblemJson: vi.fn(() => "problem-json"),
  buildRustProblemPayload: vi.fn(() => ({
    problem: { people: [], groups: [], num_sessions: 2 },
    objectives: [],
    constraints: [],
    solver: { solver_type: "SimulatedAnnealing" },
  })),
  parseProgressUpdate: vi.fn((payload: string) => JSON.parse(payload)),
  parseRustSolution: vi.fn(() => ({
    assignments: [{ person_id: "p1", group_id: "g1", session_id: 0 }],
    final_score: 9,
    unique_contacts: 1,
    repetition_penalty: 0,
    attribute_balance_penalty: 0,
    constraint_penalty: 0,
    iteration_count: 7,
    elapsed_time_ms: 2000,
  })),
}));

type FakeModule = {
  solve: ReturnType<typeof vi.fn>;
  solve_with_progress: ReturnType<typeof vi.fn>;
  validate_problem: ReturnType<typeof vi.fn>;
  get_default_settings: ReturnType<typeof vi.fn>;
  get_recommended_settings: ReturnType<typeof vi.fn>;
  evaluate_input: ReturnType<typeof vi.fn>;
  default: ReturnType<typeof vi.fn>;
};

function createProblem(): Problem {
  return createSampleProblem();
}

function createModule(): FakeModule {
  return {
    solve: vi.fn(() => "result-json"),
    solve_with_progress: vi.fn((_: string, callback?: ((payload: string) => boolean) | null) => {
      callback?.('{"iteration":7,"elapsed_seconds":2}');
      return "progress-result-json";
    }),
    validate_problem: vi.fn(() => JSON.stringify({ valid: true, errors: [] })),
    get_default_settings: vi.fn(() => JSON.stringify(createSampleSolverSettings())),
    get_recommended_settings: vi.fn(() => JSON.stringify(createSampleSolverSettings())),
    evaluate_input: vi.fn(() => "evaluation-result-json"),
    default: vi.fn(async () => ({ memory: {} })),
  };
}

describe("WasmService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(parseProgressUpdate).mockImplementation((payload: string) => JSON.parse(payload));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("initializes a valid wasm module and marks it ready", async () => {
    const wasmModule = createModule();
    const service = new WasmService(async () => wasmModule);

    await service.initialize();

    expect(wasmModule.default).toHaveBeenCalledTimes(1);
    expect(service.isReady()).toBe(true);
    expect(service.hasInitializationFailed()).toBe(false);
  });

  it("rejects invalid module shapes during initialization", async () => {
    const service = new WasmService(async () => ({ default: vi.fn(async () => ({ memory: {} })) }));

    await expect(service.initialize()).rejects.toThrow(
      "Failed to initialize WASM solver: WASM module shape does not match the expected runtime contract.",
    );
    expect(service.hasInitializationFailed()).toBe(true);
  });

  it("solves problems through the wasm runtime and shared result parser", async () => {
    const wasmModule = createModule();
    const service = new WasmService(async () => wasmModule);

    const solution = await service.solve(createProblem());

    expect(buildRustProblemJson).toHaveBeenCalledWith(expect.objectContaining({ people: expect.any(Array) }));
    expect(wasmModule.solve).toHaveBeenCalledWith("problem-json");
    expect(parseRustSolution).toHaveBeenCalledWith("result-json");
    expect(solution.final_score).toBe(9);
  });

  it("propagates progress updates and returns the last parsed progress payload", async () => {
    const wasmModule = createModule();
    const service = new WasmService(async () => wasmModule);
    const progressCallback = vi.fn();

    const result = await service.solveWithProgress(createProblem(), progressCallback);

    expect(wasmModule.solve_with_progress).toHaveBeenCalledWith(
      "problem-json",
      expect.any(Function),
    );
    expect(parseProgressUpdate).toHaveBeenCalledWith('{"iteration":7,"elapsed_seconds":2}');
    expect(progressCallback).toHaveBeenCalledWith({ iteration: 7, elapsed_seconds: 2 });
    expect(result.lastProgress).toEqual({ iteration: 7, elapsed_seconds: 2 });
    expect(parseRustSolution).toHaveBeenCalledWith(
      "progress-result-json",
      { iteration: 7, elapsed_seconds: 2 },
    );
  });

  it("continues solving when a malformed progress payload cannot be parsed", async () => {
    const wasmModule = createModule();
    wasmModule.solve_with_progress.mockImplementation((_: string, callback?: ((payload: string) => boolean) | null) => {
      callback?.("{not-json");
      return "progress-result-json";
    });
    vi.mocked(parseProgressUpdate).mockImplementation(() => {
      throw new Error("bad progress payload");
    });
    const service = new WasmService(async () => wasmModule);
    const progressCallback = vi.fn();

    const result = await service.solveWithProgress(createProblem(), progressCallback);

    expect(progressCallback).not.toHaveBeenCalled();
    expect(result.lastProgress).toBeNull();
    expect(parseRustSolution).toHaveBeenCalledWith("progress-result-json", undefined);
  });

  it("parses validation, default settings, and recommended settings responses", async () => {
    const wasmModule = createModule();
    const service = new WasmService(async () => wasmModule);
    const problem = createProblem();

    await expect(service.validateProblem(problem)).resolves.toEqual({ valid: true, errors: [] });
    await expect(service.getDefaultSettings()).resolves.toEqual(createSampleSolverSettings());
    await expect(service.getRecommendedSettings(problem, 11)).resolves.toEqual(createSampleSolverSettings());
    expect(wasmModule.get_recommended_settings).toHaveBeenCalledWith(JSON.stringify(problem), 11n);
  });

  it("attaches initial_schedule when evaluating explicit assignments", async () => {
    const wasmModule = createModule();
    const service = new WasmService(async () => wasmModule);
    const problem = createProblem();
    const assignments = [
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g2", session_id: 1 },
    ];

    await service.evaluateSolution(problem, assignments);

    expect(buildRustProblemPayload).toHaveBeenCalledWith(problem);
    expect(wasmModule.evaluate_input).toHaveBeenCalledWith(
      JSON.stringify({
        problem: { people: [], groups: [], num_sessions: 2 },
        objectives: [],
        constraints: [],
        solver: { solver_type: "SimulatedAnnealing" },
        initial_schedule: {
          session_0: { g1: ["p1"] },
          session_1: { g2: ["p2"] },
        },
      }),
    );
    expect(parseRustSolution).toHaveBeenCalledWith("evaluation-result-json");
  });

  it("normalizes structured public-error envelopes into useful JS errors", async () => {
    const wasmModule = createModule();
    wasmModule.solve.mockImplementation(() => {
      throw {
        error: {
          code: "invalid-input",
          message: "Problem payload was rejected",
        },
      };
    });
    const service = new WasmService(async () => wasmModule);

    await expect(service.solve(createProblem())).rejects.toThrow(
      "Failed to solve problem: invalid-input: Problem payload was rejected",
    );
  });
});
