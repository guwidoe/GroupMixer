// Module-based Web Worker for running the WASM solver off the main thread
// Uses ESM imports instead of importScripts to work with wasm-pack --target web output

import wasmInit, * as wasmModule from "virtual:wasm-solver";
import type {
  WorkerErrorData,
  WorkerRequestMessage,
} from "../services/solverWorker/protocol";

let isInitializing = false;
let isInitialized = false;
let lastProblemJson: string | null = null;

async function initWasm(): Promise<void> {
  if (isInitialized) return;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return;
  }

  isInitializing = true;
  try {
    if (typeof wasmInit === "function") {
      await wasmInit();
    }

    if (
      typeof (wasmModule as Record<string, unknown>)["init_panic_hook"] ===
      "function"
    ) {
      (
        wasmModule as unknown as { init_panic_hook: () => void }
      ).init_panic_hook();
    }

    isInitialized = true;
  } catch (error) {
    isInitializing = false;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`WASM initialization failed: ${message}`);
  } finally {
    isInitializing = false;
  }
}

function postFatalError(data: WorkerErrorData): void {
  self.postMessage({ type: "FATAL_ERROR", data });
}

function postRequestError(id: string, data: WorkerErrorData): void {
  self.postMessage({ type: "ERROR", id, data });
}

self.onmessage = async (e: MessageEvent<WorkerRequestMessage>) => {
  const { type, id } = e.data;

  try {
    switch (type) {
      case "INIT": {
        await initWasm();
        self.postMessage({ type: "INIT_SUCCESS", id });
        break;
      }

      case "SOLVE": {
        const { problemJson, useProgress } = e.data.data;
        lastProblemJson = problemJson;

        if (!isInitialized) {
          await initWasm();
        }

        if (!isInitialized) {
          throw new Error("WASM module not initialized");
        }

        if (useProgress) {
          let lastProgressJson: string | null = null;

          const progressCallback = (progressJson: string): boolean => {
            lastProgressJson = progressJson;
            self.postMessage({ type: "PROGRESS", id, data: { progressJson } });
            return true;
          };

          const result = (
            wasmModule as unknown as {
              solve_with_progress: (
                pj: string,
                cb: (p: string) => boolean
              ) => string;
            }
          ).solve_with_progress(problemJson, progressCallback);

          self.postMessage({
            type: "SOLVE_SUCCESS",
            id,
            data: { result, lastProgressJson },
          });
        } else {
          const result = (
            wasmModule as unknown as { solve: (pj: string) => string }
          ).solve(problemJson);
          self.postMessage({ type: "SOLVE_SUCCESS", id, data: { result } });
        }
        break;
      }

      case "CANCEL": {
        self.postMessage({ type: "CANCELLED", id });
        break;
      }

      case "get_default_settings": {
        try {
          if (!isInitialized) throw new Error("WASM module not initialized.");
          const settings = (
            wasmModule as unknown as { get_default_settings: () => string }
          ).get_default_settings();
          self.postMessage({
            type: "RPC_SUCCESS",
            id,
            data: { result: settings },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          self.postMessage({
            type: "RPC_ERROR",
            id,
            data: { error: message },
          });
        }
        break;
      }

      case "get_recommended_settings": {
        try {
          if (!isInitialized) throw new Error("WASM module not initialized.");
          const { problemJson, desired_runtime_seconds } = e.data.data;
          const settings = (
            wasmModule as unknown as {
              get_recommended_settings: (pj: string, seconds: bigint) => string;
            }
          ).get_recommended_settings(
            problemJson || "",
            BigInt(desired_runtime_seconds)
          );
          self.postMessage({
            type: "RPC_SUCCESS",
            id,
            data: { result: settings },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          self.postMessage({
            type: "RPC_ERROR",
            id,
            data: { error: message },
          });
        }
        break;
      }

      default:
        console.warn(`Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error("Worker error:", error);
    const errorString =
      error && (error as Error).message
        ? (error as Error).message
        : String(error);
    postRequestError(id, {
      error: errorString,
      problemJson: lastProblemJson || undefined,
    });
  }
};

self.onerror = function (error: ErrorEvent) {
  postFatalError({
    error: error?.message || String(error),
    filename: error?.filename,
    lineno: error?.lineno,
  });
};
