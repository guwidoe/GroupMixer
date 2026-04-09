import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressMailboxReader, getProgressMailboxByteLength } from "../services/runtime/progressMailbox";
import {
  attachSolverWorkerRuntime,
  createSolverWorkerRuntime,
  type SolverWorkerRuntime,
} from "./solverWorker";
import type { WorkerRequestMessage, WorkerResponseMessage } from "../services/solverWorker/protocol";

type PostedMessage = WorkerResponseMessage;

describe("solverWorker runtime", () => {
  let postedMessages: PostedMessage[];
  let workerConsole: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    postedMessages = [];
    workerConsole = {
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  function createRuntime(overrides: Partial<Parameters<typeof createSolverWorkerRuntime>[0]> = {}) {
    const wasmInit = vi.fn(async () => undefined);
    const wasmModule = {
      capabilities: vi.fn(() => ({ bootstrap: { title: "GroupMixer solver contracts" } })),
      get_operation_help: vi.fn((operationId: string) => ({ operation: { id: operationId } })),
      list_schemas: vi.fn(() => [{ id: "solve-request", version: "1.0.0" }]),
      get_schema: vi.fn((schemaId: string) => ({ id: schemaId, version: "1.0.0", schema: {} })),
      list_public_errors: vi.fn(() => [{ error: { code: "invalid-input", message: "bad input" } }]),
      get_public_error: vi.fn((errorCode: string) => ({ error: { code: errorCode, message: "bad input" } })),
      list_solvers: vi.fn(() => ({ solvers: [{ canonical_id: "solver1", display_name: "Solver 1" }] })),
      get_solver_descriptor: vi.fn((solverId: string) => ({ canonical_id: solverId, display_name: `Solver ${solverId}` })),
      init_panic_hook: vi.fn(),
      solve_with_progress: vi.fn((input: Record<string, unknown>, callback?: ((progress: Record<string, unknown>) => boolean) | null) => {
        callback?.({ iteration: 1, best_score: 3 });
        return { schedule: {}, final_score: 1, input };
      }),
      solve_with_progress_snapshot: vi.fn((
        input: Record<string, unknown>,
        callback?: ((progress: Record<string, unknown>) => boolean) | null,
        bestScheduleCallback?: ((schedule: Record<string, unknown>) => void) | null,
      ) => {
        callback?.({ iteration: 1, best_score: 3 });
        bestScheduleCallback?.({ session_0: { g1: ["p1", "p2"] } });
        return { schedule: {}, final_score: 1, input };
      }),
      validate_scenario: vi.fn((input: Record<string, unknown>) => ({ valid: true, issues: [], input })),
      get_default_solver_configuration: vi.fn(() => ({ solver_type: "SimulatedAnnealing" })),
      recommend_settings: vi.fn((request: Record<string, unknown>) => ({ request })),
      evaluate_input: vi.fn((input: Record<string, unknown>) => ({ schedule: {}, final_score: 2, input })),
      inspect_result: vi.fn((result: Record<string, unknown>) => ({ final_score: result.final_score ?? 0 })),
    };

    const runtime = createSolverWorkerRuntime({
      wasmInit,
      wasmModule,
      postMessage: (message) => postedMessages.push(message),
      console: workerConsole,
      ...overrides,
    });

    return { runtime, wasmInit, wasmModule };
  }

  async function initializeRuntime(runtime: SolverWorkerRuntime): Promise<void> {
    await runtime.handleMessage({ type: "INIT", id: "1" });
    expect(postedMessages).toContainEqual({ type: "INIT_SUCCESS", id: "1" });
  }

  it("initializes wasm and posts INIT_SUCCESS", async () => {
    const { runtime, wasmInit, wasmModule } = createRuntime();

    await runtime.handleMessage({ type: "INIT", id: "1" });

    expect(wasmInit).toHaveBeenCalledTimes(1);
    expect(wasmModule.init_panic_hook).toHaveBeenCalledTimes(1);
    expect(postedMessages).toEqual([{ type: "INIT_SUCCESS", id: "1" }]);
  });

  it("posts request errors when wasm initialization fails", async () => {
    const { runtime } = createRuntime({
      wasmInit: vi.fn(async () => {
        throw new Error("init boom");
      }),
    });

    await runtime.handleMessage({ type: "INIT", id: "1" });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "1",
        data: { error: "WASM initialization failed: init boom" },
      },
    ]);
  });

  it("solves without progress and auto-initializes the worker runtime through the canonical solve surface", async () => {
    const { runtime, wasmInit, wasmModule } = createRuntime();

    await runtime.handleMessage({
      type: "SOLVE",
      id: "1",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
        useProgress: false,
      },
    });

    expect(wasmInit).toHaveBeenCalledTimes(1);
    expect(wasmModule.solve_with_progress).toHaveBeenCalledWith(
      {
        scenario: {
          people: [],
          groups: [],
          num_sessions: 1,
          objectives: [],
          constraints: [],
          settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
        },
      },
      undefined,
    );
    expect(postedMessages).toEqual([
      {
        type: "SOLVE_SUCCESS",
        id: "1",
        data: {
          result: {
            schedule: {},
            final_score: 1,
            input: {
              scenario: {
                people: [],
                groups: [],
                num_sessions: 1,
                objectives: [],
                constraints: [],
                settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
              },
            },
          },
          lastProgress: null,
        },
      },
    ]);
  });

  it("streams structured progress updates and captures the final progress payload", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];
    const progressMailbox = new SharedArrayBuffer(getProgressMailboxByteLength());

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
        useProgress: true,
        progressMailbox,
      },
    });

    expect(wasmModule.solve_with_progress_snapshot).toHaveBeenCalledTimes(1);
    expect(postedMessages).toEqual([
      {
        type: "BEST_SCHEDULE",
        id: "2",
        data: { schedule: { session_0: { g1: ["p1", "p2"] } } },
      },
      {
        type: "SOLVE_SUCCESS",
        id: "2",
        data: {
          result: {
            schedule: {},
            final_score: 1,
            input: {
              scenario: {
                people: [],
                groups: [],
                num_sessions: 1,
                objectives: [],
                constraints: [],
                settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
              },
            },
          },
          lastProgress: null,
        },
      },
    ]);

    const readResult = createProgressMailboxReader(progressMailbox).read();
    expect(readResult?.snapshot).toEqual(
      expect.objectContaining({
        status: "completed",
        iteration: 1,
        best_score: 3,
      }),
    );
  });

  it("fails loudly when mailbox snapshot export is missing", async () => {
    const { runtime } = createRuntime({
      wasmModule: {
        solve_with_progress_snapshot: undefined,
      },
    });
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
        useProgress: true,
        progressMailbox: new SharedArrayBuffer(getProgressMailboxByteLength()),
      },
    });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "WASM module is missing solve_with_progress_snapshot" },
      },
    ]);
  });

  it("fails loudly when progress solves omit the shared mailbox", async () => {
    const { runtime } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
        useProgress: true,
      },
    });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "Shared progress mailbox is required for progress-enabled solves" },
      },
    ]);
  });

  it("returns default configuration and recommended settings through canonical RPC responses", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "get_default_solver_configuration", id: "2", data: {} });
    await runtime.handleMessage({
      type: "recommend_settings",
      id: "3",
      data: {
        recommendRequest: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
          desired_runtime_seconds: 11,
        },
      },
    });

    expect(wasmModule.get_default_solver_configuration).toHaveBeenCalledTimes(1);
    expect(wasmModule.recommend_settings).toHaveBeenCalledWith({
      scenario: {
        people: [],
        groups: [],
        num_sessions: 1,
        objectives: [],
        constraints: [],
        settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
      },
      desired_runtime_seconds: 11,
    });
    expect(postedMessages).toEqual([
      {
        type: "RPC_SUCCESS",
        id: "2",
        data: { result: { solver_type: "SimulatedAnnealing" } },
      },
      {
        type: "RPC_SUCCESS",
        id: "3",
        data: {
          result: {
            request: {
              scenario: {
                people: [],
                groups: [],
                num_sessions: 1,
                objectives: [],
                constraints: [],
                settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
              },
              desired_runtime_seconds: 11,
            },
          },
        },
      },
    ]);
  });

  it("returns discovery and contract inspection RPC responses", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "capabilities", id: "2", data: {} });
    await runtime.handleMessage({ type: "get_operation_help", id: "3", data: { args: ["solve"] } });
    await runtime.handleMessage({ type: "list_solvers", id: "4", data: {} });
    await runtime.handleMessage({ type: "get_solver_descriptor", id: "5", data: { args: ["solver3"] } });
    await runtime.handleMessage({
      type: "validate_scenario",
      id: "6",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
      },
    });
    await runtime.handleMessage({ type: "inspect_result", id: "7", data: { resultPayload: { schedule: {}, final_score: 7 } as never } });

    expect(wasmModule.capabilities).toHaveBeenCalledTimes(1);
    expect(wasmModule.get_operation_help).toHaveBeenCalledWith("solve");
    expect(wasmModule.list_solvers).toHaveBeenCalledTimes(1);
    expect(wasmModule.get_solver_descriptor).toHaveBeenCalledWith("solver3");
    expect(wasmModule.validate_scenario).toHaveBeenCalledWith({
      scenario: {
        people: [],
        groups: [],
        num_sessions: 1,
        objectives: [],
        constraints: [],
        settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
      },
    });
    expect(wasmModule.inspect_result).toHaveBeenCalledWith({ schedule: {}, final_score: 7 });
    expect(postedMessages).toEqual([
      {
        type: "RPC_SUCCESS",
        id: "2",
        data: { result: { bootstrap: { title: "GroupMixer solver contracts" } } },
      },
      {
        type: "RPC_SUCCESS",
        id: "3",
        data: { result: { operation: { id: "solve" } } },
      },
      {
        type: "RPC_SUCCESS",
        id: "4",
        data: { result: { solvers: [{ canonical_id: "solver1", display_name: "Solver 1" }] } },
      },
      {
        type: "RPC_SUCCESS",
        id: "5",
        data: { result: { canonical_id: "solver3", display_name: "Solver solver3" } },
      },
      {
        type: "RPC_SUCCESS",
        id: "6",
        data: {
          result: {
            valid: true,
            issues: [],
            input: {
              scenario: {
                people: [],
                groups: [],
                num_sessions: 1,
                objectives: [],
                constraints: [],
                settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
              },
            },
          },
        },
      },
      {
        type: "RPC_SUCCESS",
        id: "7",
        data: { result: { final_score: 7 } },
      },
    ]);
  });

  it("auto-initializes discovery RPCs before handling list_solvers", async () => {
    const { runtime, wasmInit, wasmModule } = createRuntime();

    await runtime.handleMessage({ type: 'list_solvers', id: '2', data: {} });

    expect(wasmInit).toHaveBeenCalledTimes(1);
    expect(wasmModule.list_solvers).toHaveBeenCalledTimes(1);
    expect(postedMessages).toEqual([
      {
        type: 'RPC_SUCCESS',
        id: '2',
        data: { result: { solvers: [{ canonical_id: 'solver1', display_name: 'Solver 1' }] } },
      },
    ]);
  });

  it("returns RPC_ERROR when RPC handlers fail", async () => {
    const { runtime } = createRuntime({
      wasmModule: {
        get_default_solver_configuration: vi.fn(() => {
          throw new Error("settings boom");
        }),
      },
    });
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "get_default_solver_configuration", id: "2", data: {} });

    expect(postedMessages).toEqual([
      {
        type: "RPC_ERROR",
        id: "2",
        data: { error: "settings boom" },
      },
    ]);
  });

  it("fails loudly when canonical RPC payloads are missing", async () => {
    const { runtime } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "recommend_settings", id: "2", data: {} });
    await runtime.handleMessage({ type: "get_solver_descriptor", id: "3", data: {} });
    await runtime.handleMessage({ type: "validate_scenario", id: "4", data: {} });
    await runtime.handleMessage({ type: "inspect_result", id: "5", data: {} });

    expect(postedMessages).toEqual([
      {
        type: "RPC_ERROR",
        id: "2",
        data: { error: "Worker RPC recommend_settings requires recommendRequest" },
      },
      {
        type: "RPC_ERROR",
        id: "3",
        data: { error: "Worker RPC get_solver_descriptor requires solverId" },
      },
      {
        type: "RPC_ERROR",
        id: "4",
        data: { error: "Worker RPC validate_scenario requires scenarioPayload" },
      },
      {
        type: "RPC_ERROR",
        id: "5",
        data: { error: "Worker RPC inspect_result requires resultPayload" },
      },
    ]);
  });

  it("posts solve errors without relying on legacy scenario json context", async () => {
    const { runtime } = createRuntime({
      wasmModule: {
        solve_with_progress: vi.fn(() => {
          throw new Error("solve boom");
        }),
      },
    });
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: {
        scenarioPayload: {
          scenario: {
            people: [],
            groups: [],
            num_sessions: 1,
            objectives: [],
            constraints: [],
            settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
          },
        },
        useProgress: false,
      },
    });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "solve boom" },
      },
    ]);
  });

  it("rejects solve requests that omit scenarioPayload", async () => {
    const { runtime } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "SOLVE", id: "2", data: { useProgress: false } as never });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "Worker RPC SOLVE requires scenarioPayload" },
      },
    ]);
  });

  it("posts fatal errors from the worker global error hook", () => {
    const { runtime } = createRuntime();

    runtime.handleError({ message: "fatal", filename: "worker.ts", lineno: 42 });

    expect(postedMessages).toEqual([
      {
        type: "FATAL_ERROR",
        data: { error: "fatal", filename: "worker.ts", lineno: 42 },
      },
    ]);
  });

  it("can be attached to a worker-like scope for message wiring", async () => {
    const { runtime } = createRuntime();
    const scope = {
      postMessage: vi.fn(),
      onmessage: null as DedicatedWorkerGlobalScope["onmessage"],
      onerror: null as DedicatedWorkerGlobalScope["onerror"],
    };

    attachSolverWorkerRuntime(scope, runtime);

    const request: WorkerRequestMessage = { type: "INIT", id: "1" };
    scope.onmessage?.({ data: request } as MessageEvent<WorkerRequestMessage>);
    await vi.waitFor(() => {
      expect(postedMessages[0]).toEqual({ type: "INIT_SUCCESS", id: "1" });
    });
    scope.onerror?.({ message: "fatal" } as ErrorEvent);

    expect(postedMessages[1]).toEqual({ type: "FATAL_ERROR", data: { error: "fatal", filename: undefined, lineno: undefined } });
  });
});
