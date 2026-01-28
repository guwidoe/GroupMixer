import type { Problem, Solution, SolverSettings } from "../types";
import type { WasmModule } from "../types/wasm";
import { convertProblemToRustFormat, convertRustResultToSolution } from "./wasm/conversions";
import type { ProgressCallback, ProgressUpdate } from "./wasm/types";


class WasmService {
  private module: WasmModule | null = null;
  private loading = false;
  private initializationFailed = false;

  async initialize(): Promise<void> {
    if (this.module || this.loading || this.initializationFailed) {
      return;
    }

    this.loading = true;

    try {
      // Load the WASM module via the virtual alias (vite alias → public/solver_wasm.js)
      const wasmModule = await import("virtual:wasm-solver").catch((error) => {
        console.warn(
          "WASM module not found. This might be a build issue:",
          error.message
        );
        throw new Error(
          "WASM module not available. Please check the build configuration."
        );
      });

      // Initialize the WASM module
      if (
        typeof (wasmModule as unknown as { default?: () => Promise<void> })
          .default === "function"
      ) {
        await (
          wasmModule as unknown as { default: () => Promise<void> }
        ).default();
      } else if (
        typeof (wasmModule as unknown as { wasm_bindgen?: () => Promise<void> })
          .wasm_bindgen === "function"
      ) {
        await (
          wasmModule as unknown as { wasm_bindgen: () => Promise<void> }
        ).wasm_bindgen();
      } else if (
        typeof (
          wasmModule as unknown as { initSync?: (m?: unknown) => unknown }
        ).initSync === "function"
      ) {
        (
          wasmModule as unknown as { initSync: (m?: unknown) => unknown }
        ).initSync();
      } else {
        console.warn(
          "WASM module has no default/wasm_bindgen/initSync initializer; proceeding without explicit init"
        );
      }

      this.module = wasmModule as unknown as WasmModule;
      console.log("WASM module loaded successfully");
    } catch (error) {
      console.error("Failed to load WASM module:", error);
      this.initializationFailed = true;
      throw new Error("Failed to initialize WASM solver");
    } finally {
      this.loading = false;
    }
  }

  async solve(problem: Problem): Promise<Solution> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      throw new Error(
        "WASM module not available. Please check the build configuration."
      );
    }

    let problemJson: string | undefined;
    try {
      problemJson = JSON.stringify(convertProblemToRustFormat(problem));
      console.log("Solver input JSON:", problemJson);
      const resultJson = this.module.solve(problemJson);
      const rustResult = JSON.parse(resultJson);
      return convertRustResultToSolution(rustResult);
    } catch (error) {
      console.error("WASM solve error:", error);
      if (problemJson) {
        console.debug("Solver input JSON that caused the error:", problemJson);
      }
      throw new Error(
        `Failed to solve problem: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`
      );
    }
  }

  async solveWithProgress(
    problem: Problem,
    progressCallback?: ProgressCallback
  ): Promise<Solution> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      throw new Error("WASM module not initialized");
    }

    let problemJson: string | undefined;
    try {
      problemJson = JSON.stringify(convertProblemToRustFormat(problem));

      let lastProgress: ProgressUpdate | undefined;

      const wasmProgressCallback = progressCallback
        ? (progressJson: string) => {
            try {
              const progress: ProgressUpdate = JSON.parse(progressJson);
              lastProgress = progress; // Track the last progress update
              return progressCallback(progress);
            } catch (e) {
              console.error("Failed to parse progress update:", e);
              return true; // Continue on parse error
            }
          }
        : undefined;

      const resultJson = this.module.solve_with_progress(
        problemJson,
        wasmProgressCallback
      );

      const rustResult = JSON.parse(resultJson);
      return convertRustResultToSolution(rustResult, lastProgress);
    } catch (error) {
      console.error("WASM solveWithProgress error:", error);
      if (problemJson) {
        console.debug("Solver input JSON that caused the error:", problemJson);
      }
      throw new Error(
        `Failed to solve problem: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`
      );
    }
  }

  async validateProblem(
    problem: Problem
  ): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      return {
        valid: false,
        errors: [
          "WASM module not available. Please check the build configuration.",
        ],
      };
    }

    try {
      const problemJson = JSON.stringify(problem);
      const resultJson = this.module.validate_problem(problemJson);
      return JSON.parse(resultJson);
    } catch (error) {
      console.error("WASM validation error:", error);
      return { valid: false, errors: ["Validation failed"] };
    }
  }

  async getDefaultSettings(): Promise<SolverSettings> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      // Return reasonable defaults when WASM is not available
      return {
        solver_type: "SimulatedAnnealing",
        stop_conditions: {
          max_iterations: 10000,
          time_limit_seconds: 30,
          no_improvement_iterations: 5000,
        },
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: 1.0,
            final_temperature: 0.01,
            cooling_schedule: "geometric",
            reheat_after_no_improvement: 0,
          },
        },
        logging: {
          log_frequency: 1000,
          log_initial_state: true,
          log_duration_and_score: true,
          display_final_schedule: true,
          log_initial_score_breakdown: true,
          log_final_score_breakdown: true,
          log_stop_condition: true,
        },
      };
    }

    try {
      const settingsJson = this.module.get_default_settings();
      return JSON.parse(settingsJson);
    } catch (error) {
      console.error("WASM get default settings error:", error);
      // Fallback to reasonable defaults
      return {
        solver_type: "SimulatedAnnealing",
        stop_conditions: {
          max_iterations: 10000,
          time_limit_seconds: 30,
          no_improvement_iterations: 5000,
        },
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: 1.0,
            final_temperature: 0.01,
            cooling_schedule: "geometric",
            reheat_after_no_improvement: 0,
          },
        },
        logging: {
          log_frequency: 1000,
          log_initial_state: true,
          log_duration_and_score: true,
          display_final_schedule: true,
          log_initial_score_breakdown: true,
          log_final_score_breakdown: true,
          log_stop_condition: true,
        },
      };
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
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }
    if (!this.module) {
      throw new Error(
        "WASM module not available. Please check the build configuration."
      );
    }
    // Build ApiInput with initial_schedule populated from assignments
    const payload = convertProblemToRustFormat(problem) as Record<
      string,
      unknown
    > & {
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
      const resultJson = this.module.evaluate_input!(JSON.stringify(payload));
      const rustResult = JSON.parse(resultJson);
      return convertRustResultToSolution(rustResult);
    } catch (error) {
      console.error("WASM evaluateSolution error:", error);
      throw new Error(
        `Failed to evaluate solution: ${
          error instanceof Error ? error.stack || error.message : String(error)
        }`
      );
    }
  }

}

export const wasmService = new WasmService();
