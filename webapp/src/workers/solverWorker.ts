// Module-based Web Worker for running the WASM solver off the main thread
// Uses ESM imports instead of importScripts to work with wasm-pack --target web output

import wasmInit, * as wasmModule from "virtual:wasm-solver";
import type { WasmContractModule } from "../services/wasm/module";
import {
  createFatalErrorMessage,
  createProgressMessage,
  createRequestErrorMessage,
  createRpcSuccessMessage,
  createSolveSuccessMessage,
  type WorkerErrorData,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from "../services/solverWorker/protocol";
import type { ProgressUpdate, RustResult } from "../services/wasm/types";

type WorkerConsole = Pick<Console, "warn" | "error">;

type WorkerWasmModule = Partial<Pick<
  WasmContractModule,
  | "solve_with_progress"
  | "get_default_solver_configuration"
  | "recommend_settings"
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
          const { problemPayload, useProgress } = message.data;

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
            problemPayload || {},
            progressCallback,
          ) as RustResult;
          postMessage(createSolveSuccessMessage(id, result, lastProgress));
          break;
        }

        case "CANCEL": {
          postMessage({ type: "CANCELLED", id });
          break;
        }

        case "get_default_solver_configuration": {
          try {
            if (!isInitialized) throw new Error("WASM module not initialized.");
            if (typeof wasm.get_default_solver_configuration !== "function") {
              throw new Error("WASM module is missing get_default_solver_configuration");
            }

            const settings = wasm.get_default_solver_configuration();
            postMessage(createRpcSuccessMessage(id, settings));
          } catch (error) {
            postMessage(
              createRequestErrorMessage(
                id,
                { error: errorToMessage(error) },
                "RPC_ERROR",
              ),
            );
          }
          break;
        }

        case "recommend_settings": {
          try {
            if (!isInitialized) throw new Error("WASM module not initialized.");
            if (typeof wasm.recommend_settings !== "function") {
              throw new Error("WASM module is missing recommend_settings");
            }

            const settings = wasm.recommend_settings(
              message.data.recommendRequest || {
                problem_definition: {},
                objectives: [],
                constraints: [],
                desired_runtime_seconds: 0,
              },
            );
            postMessage(createRpcSuccessMessage(id, settings));
          } catch (error) {
            postMessage(
              createRequestErrorMessage(
                id,
                { error: errorToMessage(error) },
                "RPC_ERROR",
              ),
            );
          }
          break;
        }

        default:
          workerConsole.warn(`Unknown message type: ${type}`);
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
