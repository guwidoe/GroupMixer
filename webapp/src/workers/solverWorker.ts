// Module-based Web Worker for running the WASM solver off the main thread
// Uses ESM imports instead of importScripts to work with wasm-pack --target web output

import wasmInit, * as wasmModule from "../services/wasm/runtimeModule";
import type { WasmContractModule } from "../services/wasm/module";
import {
  createFatalErrorMessage,
  createProgressMessage,
  createRequestErrorMessage,
  createRpcSuccessMessage,
  createSolveSuccessMessage,
  isSolverRpcMethod,
  type WorkerErrorData,
  type RpcRequestMessage,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from "../services/solverWorker/protocol";
import type { ProgressUpdate, RustResult } from "../services/wasm/types";

type WorkerConsole = Pick<Console, "warn" | "error">;

type WorkerWasmModule = Partial<Pick<
  WasmContractModule,
  | "capabilities"
  | "get_operation_help"
  | "list_schemas"
  | "get_schema"
  | "list_public_errors"
  | "get_public_error"
  | "solve_with_progress"
  | "validate_scenario"
  | "get_default_solver_configuration"
  | "recommend_settings"
  | "evaluate_input"
  | "inspect_result"
>> & {
  init_panic_hook?: () => void;
};

export interface SolverWorkerRuntimeDeps {
  wasmInit?: (() => Promise<unknown>) | (() => unknown);
  wasmModule: WorkerWasmModule;
  postMessage: (message: WorkerResponseMessage) => void;
  console?: WorkerConsole;
  setTimeoutFn?: (callback: () => void, ms: number) => unknown;
}

export interface SolverWorkerRuntime {
  handleMessage: (message: WorkerRequestMessage) => Promise<void>;
  handleError: (error: Pick<ErrorEvent, "message" | "filename" | "lineno">) => void;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSolverWorkerRuntime({
  wasmInit: wasmInitFn,
  wasmModule: wasm,
  postMessage,
  console: workerConsole = console,
  setTimeoutFn = (callback, ms) => setTimeout(callback, ms),
}: SolverWorkerRuntimeDeps): SolverWorkerRuntime {
  let isInitializing = false;
  let isInitialized = false;

  async function initWasm(): Promise<void> {
    if (isInitialized) return;
    if (isInitializing) {
      while (isInitializing) {
        await new Promise((resolve) => setTimeoutFn(resolve as () => void, 10));
      }
      return;
    }

    isInitializing = true;
    try {
      if (typeof wasmInitFn === "function") {
        await wasmInitFn();
      }

      if (typeof wasm.init_panic_hook === "function") {
        wasm.init_panic_hook();
      }

      isInitialized = true;
    } catch (error) {
      isInitializing = false;
      throw new Error(`WASM initialization failed: ${errorToMessage(error)}`);
    } finally {
      isInitializing = false;
    }
  }

  function postFatalError(data: WorkerErrorData): void {
    postMessage(createFatalErrorMessage(data));
  }

  function postRequestError(id: string, data: WorkerErrorData): void {
    postMessage(createRequestErrorMessage(id, data));
  }

  function requireMethod<K extends keyof WorkerWasmModule>(
    key: K,
  ): NonNullable<WorkerWasmModule[K]> {
    const method = wasm[key];
    if (typeof method !== "function") {
      throw new Error(`WASM module is missing ${String(key)}`);
    }

    return method as NonNullable<WorkerWasmModule[K]>;
  }

  function requireStringArg(message: RpcRequestMessage, name: string): string {
    const value = message.data.args?.[0];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Worker RPC ${message.type} requires ${name}`);
    }
    return value;
  }

  function handleRpcMessage(message: RpcRequestMessage): void {
    const { id, type } = message;

    if (!isSolverRpcMethod(type)) {
      workerConsole.warn(`Unknown message type: ${type}`);
      return;
    }

    let result: unknown;

    switch (type) {
      case "capabilities":
        result = requireMethod("capabilities")();
        break;
      case "get_operation_help":
        result = requireMethod("get_operation_help")(requireStringArg(message, "operationId"));
        break;
      case "list_schemas":
        result = requireMethod("list_schemas")();
        break;
      case "get_schema":
        result = requireMethod("get_schema")(requireStringArg(message, "schemaId"));
        break;
      case "list_public_errors":
        result = requireMethod("list_public_errors")();
        break;
      case "get_public_error":
        result = requireMethod("get_public_error")(requireStringArg(message, "errorCode"));
        break;
      case "validate_scenario":
        result = requireMethod("validate_scenario")(message.data.scenarioPayload || {});
        break;
      case "get_default_solver_configuration":
        result = requireMethod("get_default_solver_configuration")();
        break;
      case "recommend_settings":
        result = requireMethod("recommend_settings")(
          message.data.recommendRequest || {
            scenario: {
              people: [],
              groups: [],
              num_sessions: 0,
              objectives: [],
              constraints: [],
              settings: { solver_type: "SimulatedAnnealing", stop_conditions: {}, solver_params: {} },
            },
            desired_runtime_seconds: 0,
          },
        );
        break;
      case "evaluate_input":
        result = requireMethod("evaluate_input")(message.data.scenarioPayload || {});
        break;
      case "inspect_result":
        result = requireMethod("inspect_result")(message.data.resultPayload || { schedule: {}, final_score: 0 });
        break;
    }

    postMessage(createRpcSuccessMessage(id, result));
  }

  async function handleMessage(message: WorkerRequestMessage): Promise<void> {
    const { type, id } = message;

    try {
      switch (type) {
        case "INIT": {
          await initWasm();
          postMessage({ type: "INIT_SUCCESS", id });
          break;
        }

        case "SOLVE": {
          const { scenarioPayload, useProgress } = message.data;

          if (!isInitialized) {
            await initWasm();
          }

          if (!isInitialized) {
            throw new Error("WASM module not initialized");
          }

          if (typeof wasm.solve_with_progress !== "function") {
            throw new Error("WASM module is missing solve_with_progress");
          }

          let lastProgress: ProgressUpdate | null = null;
          const progressCallback = useProgress
            ? (progress: ProgressUpdate): boolean => {
                lastProgress = progress;
                postMessage(createProgressMessage(id, progress));
                return true;
              }
            : undefined;

          const result = wasm.solve_with_progress(
            scenarioPayload || {},
            progressCallback,
          ) as RustResult;
          postMessage(createSolveSuccessMessage(id, result, lastProgress));
          break;
        }

        case "CANCEL": {
          postMessage({ type: "CANCELLED", id });
          break;
        }

        default:
          try {
            if (!isInitialized) {
              throw new Error("WASM module not initialized.");
            }

            handleRpcMessage(message as RpcRequestMessage);
          } catch (error) {
            postMessage(
              createRequestErrorMessage(
                id,
                { error: errorToMessage(error) },
                "RPC_ERROR",
              ),
            );
          }
      }
    } catch (error) {
      workerConsole.error("Worker error:", error);
      postRequestError(id, {
        error: errorToMessage(error),
      });
    }
  }

  function handleError(error: Pick<ErrorEvent, "message" | "filename" | "lineno">): void {
    postFatalError({
      error: error?.message || String(error),
      filename: error?.filename,
      lineno: error?.lineno,
    });
  }

  return {
    handleMessage,
    handleError,
  };
}

function isWorkerGlobalScope(value: unknown): value is DedicatedWorkerGlobalScope {
  return typeof WorkerGlobalScope !== "undefined" && value instanceof WorkerGlobalScope;
}

export function attachSolverWorkerRuntime(
  scope: Pick<DedicatedWorkerGlobalScope, "postMessage" | "onmessage" | "onerror">,
  runtime: SolverWorkerRuntime,
): void {
  scope.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
    void runtime.handleMessage(event.data);
  };

  scope.onerror = (error: ErrorEvent) => {
    runtime.handleError(error);
  };
}

const runtime = createSolverWorkerRuntime({
  wasmInit: typeof wasmInit === "function" ? wasmInit : undefined,
  wasmModule: wasmModule as WorkerWasmModule,
  postMessage: (message) => self.postMessage(message),
});

if (typeof self !== "undefined" && isWorkerGlobalScope(self)) {
  attachSolverWorkerRuntime(self, runtime);
}
