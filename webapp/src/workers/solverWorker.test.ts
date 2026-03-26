import { beforeEach, describe, expect, it, vi } from "vitest";
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
      init_panic_hook: vi.fn(),
      solve_with_progress: vi.fn((input: Record<string, unknown>, callback?: ((progress: Record<string, unknown>) => boolean) | null) => {
        callback?.({ iteration: 1, best_score: 3 });
        return { schedule: {}, final_score: 1, input };
      }),
      validate_problem: vi.fn((input: Record<string, unknown>) => ({ valid: true, issues: [], input })),
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
      data: { problemPayload: { problem: { people: [] } }, useProgress: false },
    });

    expect(wasmInit).toHaveBeenCalledTimes(1);
    expect(wasmModule.solve_with_progress).toHaveBeenCalledWith(
      { problem: { people: [] } },
      undefined,
    );
    expect(postedMessages).toEqual([
      {
        type: "SOLVE_SUCCESS",
        id: "1",
        data: { result: { schedule: {}, final_score: 1, input: { problem: { people: [] } } }, lastProgress: null },
      },
    ]);
  });

  it("streams structured progress updates and captures the final progress payload", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: { problemPayload: { problem: { people: [] } }, useProgress: true },
    });

    expect(wasmModule.solve_with_progress).toHaveBeenCalledTimes(1);
    expect(postedMessages).toEqual([
      { type: "PROGRESS", id: "2", data: { progress: { iteration: 1, best_score: 3 } } },
      {
        type: "SOLVE_SUCCESS",
        id: "2",
        data: {
          result: { schedule: {}, final_score: 1, input: { problem: { people: [] } } },
          lastProgress: { iteration: 1, best_score: 3 },
        },
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
          problem_definition: { people: [] },
          objectives: [],
          constraints: [],
          desired_runtime_seconds: 11,
        },
      },
    });

    expect(wasmModule.get_default_solver_configuration).toHaveBeenCalledTimes(1);
    expect(wasmModule.recommend_settings).toHaveBeenCalledWith({
      problem_definition: { people: [] },
      objectives: [],
      constraints: [],
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
              problem_definition: { people: [] },
              objectives: [],
              constraints: [],
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
    await runtime.handleMessage({ type: "validate_problem", id: "4", data: { problemPayload: { problem: { people: [] } } } });
    await runtime.handleMessage({ type: "inspect_result", id: "5", data: { resultPayload: { schedule: {}, final_score: 7 } as never } });

    expect(wasmModule.capabilities).toHaveBeenCalledTimes(1);
    expect(wasmModule.get_operation_help).toHaveBeenCalledWith("solve");
    expect(wasmModule.validate_problem).toHaveBeenCalledWith({ problem: { people: [] } });
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
        data: { result: { valid: true, issues: [], input: { problem: { people: [] } } } },
      },
      {
        type: "RPC_SUCCESS",
        id: "5",
        data: { result: { final_score: 7 } },
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

  it("posts solve errors without relying on legacy problem json context", async () => {
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
      data: { problemPayload: { problem: { people: [] } }, useProgress: false },
    });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "solve boom" },
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
