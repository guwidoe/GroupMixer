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
      init_panic_hook: vi.fn(),
      solve: vi.fn((problemJson: string) => `solved:${problemJson}`),
      solve_with_progress: vi.fn((problemJson: string, callback: (progress: string) => boolean) => {
        callback('{"iteration":1}');
        return `solved-with-progress:${problemJson}`;
      }),
      get_default_settings: vi.fn(() => '{"solver_type":"SimulatedAnnealing"}'),
      get_recommended_settings: vi.fn((_problemJson: string, desiredRuntimeSeconds: bigint) => {
        return JSON.stringify({ desiredRuntimeSeconds: Number(desiredRuntimeSeconds) });
      }),
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

  it("solves without progress and auto-initializes the worker runtime", async () => {
    const { runtime, wasmInit, wasmModule } = createRuntime();

    await runtime.handleMessage({
      type: "SOLVE",
      id: "1",
      data: { problemJson: "problem-json", useProgress: false },
    });

    expect(wasmInit).toHaveBeenCalledTimes(1);
    expect(wasmModule.solve).toHaveBeenCalledWith("problem-json");
    expect(postedMessages).toEqual([
      { type: "SOLVE_SUCCESS", id: "1", data: { result: "solved:problem-json", lastProgressJson: undefined } },
    ]);
  });

  it("streams progress updates and captures the final progress payload", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: { problemJson: "problem-json", useProgress: true },
    });

    expect(wasmModule.solve_with_progress).toHaveBeenCalledTimes(1);
    expect(postedMessages).toEqual([
      { type: "PROGRESS", id: "2", data: { progressJson: '{"iteration":1}' } },
      {
        type: "SOLVE_SUCCESS",
        id: "2",
        data: {
          result: "solved-with-progress:problem-json",
          lastProgressJson: '{"iteration":1}',
        },
      },
    ]);
  });

  it("returns default settings and recommended settings through RPC responses", async () => {
    const { runtime, wasmModule } = createRuntime();
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "get_default_settings", id: "2", data: {} });
    await runtime.handleMessage({
      type: "get_recommended_settings",
      id: "3",
      data: { problemJson: "problem-json", desired_runtime_seconds: 11 },
    });

    expect(wasmModule.get_default_settings).toHaveBeenCalledTimes(1);
    expect(wasmModule.get_recommended_settings).toHaveBeenCalledWith("problem-json", 11n);
    expect(postedMessages).toEqual([
      {
        type: "RPC_SUCCESS",
        id: "2",
        data: { result: '{"solver_type":"SimulatedAnnealing"}' },
      },
      {
        type: "RPC_SUCCESS",
        id: "3",
        data: { result: '{"desiredRuntimeSeconds":11}' },
      },
    ]);
  });

  it("returns RPC_ERROR when RPC handlers fail", async () => {
    const { runtime } = createRuntime({
      wasmModule: {
        get_default_settings: vi.fn(() => {
          throw new Error("settings boom");
        }),
      },
    });
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({ type: "get_default_settings", id: "2", data: {} });

    expect(postedMessages).toEqual([
      {
        type: "RPC_ERROR",
        id: "2",
        data: { error: "settings boom" },
      },
    ]);
  });

  it("includes the last problem json when solve handling fails", async () => {
    const { runtime } = createRuntime({
      wasmModule: {
        solve: vi.fn(() => {
          throw new Error("solve boom");
        }),
      },
    });
    await initializeRuntime(runtime);
    postedMessages = [];

    await runtime.handleMessage({
      type: "SOLVE",
      id: "2",
      data: { problemJson: "problem-json", useProgress: false },
    });

    expect(postedMessages).toEqual([
      {
        type: "ERROR",
        id: "2",
        data: { error: "solve boom", problemJson: "problem-json" },
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
