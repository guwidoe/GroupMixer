import type { Assignment, Problem, Solution, SolverSettings } from "../types";
import {
  buildRustProblemJson,
  buildRustProblemPayload,
  parseProgressUpdate,
  parseRustSolution,
} from "./rustBoundary";
import { isWasmSolverModule, type WasmSolverModule } from "./wasm/module";
import type { ProgressCallback, ProgressUpdate } from "./wasm/types";

class WasmService {
  private module: WasmSolverModule | null = null;
  private loading = false;
  private initializationFailed = false;

  private formatErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    const text = String(error);
    return text && text !== "[object Object]" ? text : fallback;
  }

  private async requireModule(): Promise<WasmSolverModule> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      throw new Error(
        "WASM module not available. Please check the build configuration."
      );
    }

    return this.module;
  }

  async initialize(): Promise<void> {
    if (this.module || this.loading || this.initializationFailed) {
      return;
    }

    this.loading = true;

    try {
      // Load the WASM module via the virtual alias (vite alias → public/pkg/solver_wasm.js)
      const wasmModule = await import("virtual:wasm-solver").catch((error) => {
        console.warn(
          "WASM module not found. This might be a build issue:",
          error.message
        );
        throw new Error(
          "WASM module not available. Please check the build configuration."
        );
      });

      if (typeof wasmModule.default !== "function") {
        throw new Error("WASM module does not expose the expected async initializer.");
      }

      if (!isWasmSolverModule(wasmModule)) {
        throw new Error("WASM module shape does not match the expected runtime contract.");
      }

      await wasmModule.default();
      this.module = wasmModule;
    } catch (error) {
      console.error("Failed to load WASM module:", error);
      this.initializationFailed = true;
      throw new Error(
        `Failed to initialize WASM solver: ${this.formatErrorMessage(
          error,
          "Unknown initialization error"
        )}`
      );
    } finally {
      this.loading = false;
    }
  }

  async solve(problem: Problem): Promise<Solution> {
    const module = await this.requireModule();

    let problemJson: string | undefined;
    try {
      problemJson = buildRustProblemJson(problem);
      const resultJson = module.solve(problemJson);
      return parseRustSolution(resultJson);
    } catch (error) {
      console.error("WASM solve error:", error);
      if (problemJson) {
        console.error("WASM solve error occurred after serializing solver input.");
      }
      throw new Error(
        `Failed to solve problem: ${this.formatErrorMessage(error, "Unknown solver error")}`
      );
    }
  }

  async solveWithProgress(
    problem: Problem,
    progressCallback?: ProgressCallback
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    const module = await this.requireModule();

    let problemJson: string | undefined;
    try {
      problemJson = buildRustProblemJson(problem);

      let lastProgress: ProgressUpdate | null = null;

      const wasmProgressCallback = progressCallback
        ? (progressJson: string) => {
            try {
              const progress = parseProgressUpdate(progressJson);
              lastProgress = progress; // Track the last progress update
              progressCallback(progress);
              return true;
            } catch (e) {
              console.error("Failed to parse progress update:", e);
              return true; // Continue on parse error
            }
          }
        : undefined;

      const resultJson = module.solve_with_progress(
        problemJson,
        wasmProgressCallback
      );

      return {
        solution: parseRustSolution(resultJson, lastProgress ?? undefined),
        lastProgress,
      };
    } catch (error) {
      console.error("WASM solveWithProgress error:", error);
      if (problemJson) {
        console.error(
          "WASM solveWithProgress error occurred after serializing solver input."
        );
      }
      throw new Error(
        `Failed to solve problem: ${this.formatErrorMessage(
          error,
          "Unknown solver error"
        )}`
      );
    }
  }

  async validateProblem(
    problem: Problem
  ): Promise<{ valid: boolean; errors: string[] }> {
    const module = await this.requireModule();

    try {
      const problemJson = JSON.stringify(problem);
      const resultJson = module.validate_problem(problemJson);
      return JSON.parse(resultJson);
    } catch (error) {
      console.error("WASM validation error:", error);
      throw new Error(
        `Failed to validate problem: ${this.formatErrorMessage(
          error,
          "Unknown validation error"
        )}`
      );
    }
  }

  async getDefaultSettings(): Promise<SolverSettings> {
    const module = await this.requireModule();

    try {
      const settingsJson = module.get_default_settings();
      return JSON.parse(settingsJson);
    } catch (error) {
      console.error("WASM get default settings error:", error);
      throw new Error(
        `Failed to get default settings: ${this.formatErrorMessage(
          error,
          "Unknown settings error"
        )}`
      );
    }
  }

  isReady(): boolean {
    return this.module !== null;
  }

  isLoading(): boolean {
    return this.loading;
  }

  hasInitializationFailed(): boolean {
    return this.initializationFailed;
  }

  async evaluateSolution(
    problem: Problem,
    assignments: Assignment[]
  ): Promise<Solution> {
    const module = await this.requireModule();
    // Build ApiInput with initial_schedule populated from assignments
    const payload = buildRustProblemPayload(problem) as Record<string, unknown> & {
      initial_schedule?: Record<string, Record<string, string[]>>;
    };

    // Convert assignments → schedule map
    const schedule: Record<string, Record<string, string[]>> = {};
    for (const a of assignments) {
      const sessionKey = `session_${a.session_id}`;
      schedule[sessionKey] = schedule[sessionKey] || {};
      schedule[sessionKey][a.group_id] = schedule[sessionKey][a.group_id] || [];
      schedule[sessionKey][a.group_id].push(a.person_id);
    }
    payload.initial_schedule = schedule;

    try {
      const resultJson = module.evaluate_input!(JSON.stringify(payload));
      return parseRustSolution(resultJson);
    } catch (error) {
      console.error("WASM evaluateSolution error:", error);
      throw new Error(
        `Failed to evaluate solution: ${this.formatErrorMessage(
          error,
          "Unknown evaluation error"
        )}`
      );
    }
  }

}

export const wasmService = new WasmService();
