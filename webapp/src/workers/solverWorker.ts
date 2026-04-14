// Module-based Web Worker for running the WASM solver off the main thread
// Uses ESM imports instead of importScripts to work with wasm-pack --target web output

import wasmInit, * as wasmModule from "../services/wasm/runtimeModule";
import { createProgressMailboxWriter } from "../services/runtime/progressMailbox";
import type { WasmContractModule, WasmProgressSnapshot } from "../services/wasm/module";
import {
  createBestScheduleMessage,
  createFatalErrorMessage,
  createRequestErrorMessage,
  createRpcSuccessMessage,
  createSolveSuccessMessage,
  isSolverRpcMethod,
  type WorkerErrorData,
  type RpcRequestMessage,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
} from "../services/solverWorker/protocol";
import type { RustResult } from "../services/wasm/types";
import type {
  WasmContractSolveInput,
  WasmRecommendSettingsRequest,
} from "../services/wasm/module";
import type { WarmStartSchedule } from "../services/wasm/scenarioContract";

type WorkerConsole = Pick<Console, "warn" | "error">;

const WORKER_BUILD_ID = "2026-04-14-worker-header-redeploy-1";

type WorkerWasmModule = Partial<Pick<
  WasmContractModule,
  | "capabilities"
  | "get_operation_help"
  | "list_schemas"
  | "get_schema"
  | "list_public_errors"
  | "get_public_error"
  | "list_solvers"
  | "get_solver_descriptor"
  | "solve_with_progress"
  | "solve_with_progress_snapshot"
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
    void WORKER_BUILD_ID;
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

  function requireScenarioPayload(message: RpcRequestMessage | WorkerRequestMessage): WasmContractSolveInput {
    const value = "data" in message ? message.data?.scenarioPayload : undefined;
    if (!value) {
      throw new Error(`Worker RPC ${message.type} requires scenarioPayload`);
    }
    return value;
  }

  function requireRecommendRequest(message: RpcRequestMessage): WasmRecommendSettingsRequest {
    const value = message.data.recommendRequest;
    if (!value) {
      throw new Error(`Worker RPC ${message.type} requires recommendRequest`);
    }
    return value;
  }

  function requireResultPayload(message: RpcRequestMessage): RustResult {
    const value = message.data.resultPayload;
    if (!value) {
      throw new Error(`Worker RPC ${message.type} requires resultPayload`);
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
      case "list_solvers":
        result = requireMethod("list_solvers")();
        break;
      case "get_solver_descriptor":
        result = requireMethod("get_solver_descriptor")(requireStringArg(message, "solverId"));
        break;
      case "validate_scenario":
        result = requireMethod("validate_scenario")(requireScenarioPayload(message));
        break;
      case "get_default_solver_configuration":
        result = requireMethod("get_default_solver_configuration")();
        break;
      case "recommend_settings":
        result = requireMethod("recommend_settings")(requireRecommendRequest(message));
        break;
      case "evaluate_input":
        result = requireMethod("evaluate_input")(requireScenarioPayload(message));
        break;
      case "inspect_result":
        result = requireMethod("inspect_result")(requireResultPayload(message));
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
          const { useProgress, progressMailbox } = message.data;
          const scenarioPayload = requireScenarioPayload(message);

          if (!isInitialized) {
            await initWasm();
          }

          if (!isInitialized) {
            throw new Error("WASM module not initialized");
          }

          if (useProgress && !progressMailbox) {
            throw new Error("Shared progress mailbox is required for progress-enabled solves");
          }

          if (useProgress && typeof wasm.solve_with_progress_snapshot !== "function") {
            throw new Error("WASM module is missing solve_with_progress_snapshot");
          }

          if (!useProgress && typeof wasm.solve_with_progress !== "function") {
            throw new Error("WASM module is missing solve_with_progress");
          }

          const mailboxWriter = progressMailbox
            ? createProgressMailboxWriter(progressMailbox)
            : null;

          mailboxWriter?.reset();
          mailboxWriter?.setStatus("running");

          try {
            const result = useProgress
              ? (wasm.solve_with_progress_snapshot!(
                  scenarioPayload,
                  (progress: WasmProgressSnapshot): boolean => {
                    mailboxWriter?.writeProgress(progress);
                    return true;
                  },
                  (schedule: WarmStartSchedule): void => {
                    postMessage(createBestScheduleMessage(id, schedule));
                  },
                ) as RustResult)
              : (wasm.solve_with_progress!(scenarioPayload, undefined) as RustResult);

            mailboxWriter?.setStatus("completed");
            postMessage(createSolveSuccessMessage(id, result, null));
          } catch (error) {
            mailboxWriter?.setStatus("failed");
            throw error;
          }
          break;
        }

        case "CANCEL": {
          postMessage({ type: "CANCELLED", id });
          break;
        }

        default:
          try {
            if (!isInitialized) {
              await initWasm();
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
