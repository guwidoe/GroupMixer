import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scenario } from "../../types";
import { createSampleScenario, createSampleSolverSettings } from "../../test/fixtures";
import { buildRustScenarioPayload } from "../rustBoundary";
import { convertRustResultToSolution } from "./conversions";
import {
  normalizeContractError,
  WasmContractClient,
  WasmContractClientError,
} from "./contracts";

vi.mock("../rustBoundary", () => ({
  buildRustScenarioPayload: vi.fn(() => ({
    scenario: { people: [], groups: [], num_sessions: 2 },
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
  capabilities: ReturnType<typeof vi.fn>;
  get_operation_help: ReturnType<typeof vi.fn>;
  list_schemas: ReturnType<typeof vi.fn>;
  get_schema: ReturnType<typeof vi.fn>;
  list_public_errors: ReturnType<typeof vi.fn>;
  get_public_error: ReturnType<typeof vi.fn>;
  solve: ReturnType<typeof vi.fn>;
  solve_with_progress: ReturnType<typeof vi.fn>;
  validate_scenario: ReturnType<typeof vi.fn>;
  get_default_solver_configuration: ReturnType<typeof vi.fn>;
  recommend_settings: ReturnType<typeof vi.fn>;
  evaluate_input: ReturnType<typeof vi.fn>;
  inspect_result: ReturnType<typeof vi.fn>;
  solve_legacy_json: ReturnType<typeof vi.fn>;
  validate_scenario_legacy_json: ReturnType<typeof vi.fn>;
  get_default_settings_legacy_json: ReturnType<typeof vi.fn>;
  get_recommended_settings_legacy_json: ReturnType<typeof vi.fn>;
  solve_with_progress_legacy_json: ReturnType<typeof vi.fn>;
  default: ReturnType<typeof vi.fn>;
};

function createScenario(): Scenario {
  return createSampleScenario();
}

function createContractModule(): FakeContractModule {
  return {
    capabilities: vi.fn(() => ({ bootstrap: { title: "GroupMixer solver contracts" } })),
    get_operation_help: vi.fn((operationId: string) => ({ operation: { id: operationId } })),
    list_schemas: vi.fn(() => [{ id: "solve-request", version: "1.0.0" }]),
    get_schema: vi.fn((schemaId: string) => ({ id: schemaId, version: "1.0.0", schema: {} })),
    list_public_errors: vi.fn(() => [{ error: { code: "invalid-input", message: "bad input" } }]),
    get_public_error: vi.fn((errorCode: string) => ({ error: { code: errorCode, message: "bad input" } })),
    solve: vi.fn(() => ({ schedule: {}, final_score: 8, unique_contacts: 2 })),
    solve_with_progress: vi.fn((_: Record<string, unknown>, callback?: ((progress: unknown) => boolean) | null) => {
      callback?.({ iteration: 5, elapsed_seconds: 1.5, best_score: 7 });
      return { schedule: {}, final_score: 9, unique_contacts: 1 };
    }),
    validate_scenario: vi.fn(() => ({ valid: true, issues: [] })),
    get_default_solver_configuration: vi.fn(() => createSampleSolverSettings()),
    recommend_settings: vi.fn(() => createSampleSolverSettings()),
    evaluate_input: vi.fn(() => ({ schedule: {}, final_score: 6, unique_contacts: 2 })),
    inspect_result: vi.fn(() => ({ final_score: 9, unique_contacts: 1, repetition_penalty: 0, attribute_balance_penalty: 0, constraint_penalty: 0 })),
    solve_legacy_json: vi.fn(),
    validate_scenario_legacy_json: vi.fn(),
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
    const scenario = createScenario();

    await expect(client.getDefaultSolverConfiguration()).resolves.toEqual(createSampleSolverSettings());
    await expect(client.recommendSettings(scenario, 11)).resolves.toEqual(createSampleSolverSettings());

    expect(wasmModule.recommend_settings).toHaveBeenCalledWith({
      problem_definition: { people: [], groups: [], num_sessions: 2 },
      objectives: [{ type: "maximize_unique_contacts", weight: 1 }],
      constraints: [],
      desired_runtime_seconds: 11,
    });
  });

  it("surfaces discovery metadata from the wasm contract module", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await expect(client.capabilities()).resolves.toEqual({
      bootstrap: { title: "GroupMixer solver contracts" },
    });
    await expect(client.getOperationHelp("solve")).resolves.toEqual({
      operation: { id: "solve" },
    });
    await expect(client.listSchemas()).resolves.toEqual([
      { id: "solve-request", version: "1.0.0" },
    ]);
    await expect(client.getSchema("solve-request")).resolves.toEqual({
      id: "solve-request",
      version: "1.0.0",
      schema: {},
    });
    await expect(client.listPublicErrors()).resolves.toEqual([
      { error: { code: "invalid-input", message: "bad input" } },
    ]);
    await expect(client.getPublicError("invalid-input")).resolves.toEqual({
      error: { code: "invalid-input", message: "bad input" },
    });
  });

  it("solves with structured progress payloads and converts results once", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);
    const progressCallback = vi.fn();

    const result = await client.solveWithProgress(createScenario(), progressCallback);

    expect(buildRustScenarioPayload).toHaveBeenCalled();
    expect(wasmModule.solve_with_progress).toHaveBeenCalledWith(
      expect.objectContaining({ scenario: expect.any(Object) }),
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

    await client.solve(createScenario());

    expect(wasmModule.solve).toHaveBeenCalledWith(
      expect.objectContaining({ scenario: expect.any(Object) }),
    );
  });

  it("supports raw contract-native solve calls for browser agents", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await expect(client.solveContract({ problem: { people: [] } })).resolves.toEqual({
      schedule: {},
      final_score: 8,
      unique_contacts: 2,
    });
    await expect(
      client.solveContractWithProgress({ problem: { people: [] } }),
    ).resolves.toEqual({
      result: { schedule: {}, final_score: 9, unique_contacts: 1 },
      lastProgress: null,
    });
  });

  it("attaches initial_schedule for structured evaluation calls", async () => {
    const wasmModule = createContractModule();
    const client = new WasmContractClient(async () => wasmModule);

    await client.evaluateInput(createScenario(), [
      { person_id: "p1", group_id: "g1", session_id: 0 },
      { person_id: "p2", group_id: "g2", session_id: 1 },
    ]);

    expect(wasmModule.evaluate_input).toHaveBeenCalledWith({
      scenario: { people: [], groups: [], num_sessions: 2 },
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

    await expect(client.recommendSettings(createScenario(), 5)).rejects.toThrow(
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
          message: "scenario rejected",
        },
      },
      "Failed to solve scenario",
    );

    expect(error).toBeInstanceOf(WasmContractClientError);
    expect(error.code).toBe("invalid-input");
    expect(error.message).toBe("Failed to solve scenario: invalid-input: scenario rejected");
  });
});
