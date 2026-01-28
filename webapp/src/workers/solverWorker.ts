// Module-based Web Worker for running the WASM solver off the main thread
// Uses ESM imports instead of importScripts to work with wasm-pack --target web output

import wasmInit, * as wasmModule from "virtual:wasm-solver";

let isInitializing = false as boolean;
let isInitialized = false as boolean;
let lastProblemJson: string | null = null;

async function initWasm(): Promise<void> {
  if (isInitialized) return;
  if (isInitializing) {
    while (isInitializing) {
      // Wait briefly for concurrent initialization
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return;
  }

  isInitializing = true;
  try {
    // Initialize the wasm-bindgen module (ESM glue exports default init)
    if (typeof wasmInit === "function") {
      await wasmInit();
    }

    // Optional: set panic hook for better Rust panics
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.onmessage = async (e: MessageEvent<any>) => {
  const { type, id, data } = e.data as {
    type: string;
    id: string;
    data?: unknown;
  };

  try {
    switch (type) {
      case "INIT": {
        await initWasm();
        self.postMessage({ type: "INIT_SUCCESS", id });
        break;
      }

      case "SOLVE": {
        const { problemJson, useProgress } = data as {
          problemJson: string;
          useProgress?: boolean;
        };
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
            return true; // continue
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
        // Cooperative cancellation would require wasm changes; acknowledge for now
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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          self.postMessage({ type: "RPC_ERROR", id, data: { error: message } });
        }
        break;
      }

      case "get_recommended_settings": {
        try {
          if (!isInitialized) throw new Error("WASM module not initialized.");
          const { problemJson, desired_runtime_seconds } = data as {
            problemJson: string;
            desired_runtime_seconds: number;
          };
          const settings = (
            wasmModule as unknown as {
              get_recommended_settings: (pj: string, seconds: bigint) => string;
            }
          ).get_recommended_settings(
            problemJson,
            BigInt(desired_runtime_seconds)
          );
          self.postMessage({
            type: "RPC_SUCCESS",
            id,
            data: { result: settings },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          self.postMessage({ type: "RPC_ERROR", id, data: { error: message } });
        }
        break;
      }

      default: {
        console.warn(`Unknown message type: ${type}`);
      }
    }
  } catch (error) {
    console.error("Worker error:", error);
    const errorString =
      error && (error as Error).message
        ? (error as Error).message
        : String(error);
    self.postMessage({
      type: "ERROR",
      id,
      data: {
        error: errorString,
        problemJson: lastProblemJson,
      },
    });
  }
};

// Forward uncaught worker errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.onerror = function (error: any) {
  const errMsg = error && error.message ? error.message : String(error);
  self.postMessage({
    type: "ERROR",
    data: { error: errMsg, filename: error.filename, lineno: error.lineno },
  });
};
