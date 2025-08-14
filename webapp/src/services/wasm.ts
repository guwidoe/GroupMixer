import type {
  Problem,
  Solution,
  SolverSettings,
  Assignment,
  Constraint,
} from "../types";
import type { WasmModule } from "../types/wasm";

// Progress update interface matching the Rust ProgressUpdate struct
export interface ProgressUpdate {
  // === Basic Progress Information ===
  iteration: number;
  max_iterations: number;
  temperature: number;
  current_score: number;
  best_score: number;
  current_contacts: number;
  best_contacts: number;
  repetition_penalty: number;
  elapsed_seconds: number;
  no_improvement_count: number;

  // === Move Type Statistics ===
  clique_swaps_tried: number;
  clique_swaps_accepted: number;
  clique_swaps_rejected: number;
  transfers_tried: number;
  transfers_accepted: number;
  transfers_rejected: number;
  swaps_tried: number;
  swaps_accepted: number;
  swaps_rejected: number;

  // === Acceptance and Quality Metrics ===
  overall_acceptance_rate: number;
  recent_acceptance_rate: number;
  avg_attempted_move_delta: number;
  avg_accepted_move_delta: number;
  biggest_accepted_increase: number;
  biggest_attempted_increase: number;

  // === Current State Breakdown ===
  current_repetition_penalty: number;
  current_balance_penalty: number;
  current_constraint_penalty: number;
  best_repetition_penalty: number;
  best_balance_penalty: number;
  best_constraint_penalty: number;

  // === Algorithm State Information ===
  reheats_performed: number;
  iterations_since_last_reheat: number;
  local_optima_escapes: number;
  avg_time_per_iteration_ms: number;
  cooling_progress: number;

  // === Move Type Success Rates ===
  clique_swap_success_rate: number;
  transfer_success_rate: number;
  swap_success_rate: number;

  // === Advanced Analytics ===
  score_variance: number;
  search_efficiency: number;
}

// Progress callback type
export type ProgressCallback = (progress: ProgressUpdate) => boolean;

interface RustResult {
  schedule: Record<string, Record<string, string[]>>;
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
  weighted_repetition_penalty: number;
  weighted_constraint_penalty: number;
}

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
      // Load the WASM module via the virtual alias
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
      await wasmModule.default();

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
      problemJson = JSON.stringify(this.convertProblemToRustFormat(problem));
      console.log("Solver input JSON:", problemJson);
      const resultJson = this.module.solve(problemJson);
      const rustResult = JSON.parse(resultJson);
      return this.convertRustResultToSolution(rustResult);
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
      problemJson = JSON.stringify(this.convertProblemToRustFormat(problem));

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
      return this.convertRustResultToSolution(rustResult, lastProgress);
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

  // Convert Problem to the format expected by the Rust solver
  private convertProblemToRustFormat(
    problem: Problem
  ): Record<string, unknown> {
    // Convert solver_params from UI format to Rust format
    const solverSettings = { ...problem.settings };

    // The UI sends solver_params as { "SimulatedAnnealing": { ... } }
    // But Rust expects { "solver_type": "SimulatedAnnealing", ... }
    if (
      solverSettings.solver_params &&
      typeof solverSettings.solver_params === "object"
    ) {
      const solverType = solverSettings.solver_type;
      if (
        solverType === "SimulatedAnnealing" &&
        "SimulatedAnnealing" in solverSettings.solver_params
      ) {
        const params = solverSettings.solver_params
          .SimulatedAnnealing as unknown as Record<string, unknown>;
        // Provide defaults when fields are null / undefined / NaN
        const sanitizeNumber = (v: unknown, d: number) =>
          typeof v === "number" && !isNaN(v) ? v : d;
        params.initial_temperature = sanitizeNumber(
          params.initial_temperature,
          1.0
        );
        params.final_temperature = sanitizeNumber(
          params.final_temperature,
          0.01
        );
        params.reheat_after_no_improvement = sanitizeNumber(
          params.reheat_after_no_improvement,
          0
        );

        (solverSettings.solver_params as unknown as Record<string, unknown>) = {
          solver_type: solverType,
          ...solverSettings.solver_params.SimulatedAnnealing,
        };
      }
    }

    // Clean constraints and inject sensible defaults to satisfy Rust deserialization
    const cleanedConstraints = (problem.constraints || []).map(
      (c: Constraint) => {
        if (
          (c.type === "ShouldStayTogether" ||
            c.type === "ShouldNotBeTogether") &&
          (c.penalty_weight === undefined || c.penalty_weight === null)
        ) {
          return { ...c, penalty_weight: 1000 };
        }
        if (
          c.type === "AttributeBalance" &&
          (c.penalty_weight === undefined || c.penalty_weight === null)
        ) {
          return { ...c, penalty_weight: 50 };
        }
        if (
          c.type === "RepeatEncounter" &&
          (c.penalty_weight === undefined || c.penalty_weight === null)
        ) {
          return { ...c, penalty_weight: 1 };
        }
        return c;
      }
    );

    // Ensure immovable constraints always include sessions (Rust requires it)
    const allSessions = Array.from(
      { length: problem.num_sessions },
      (_, i) => i
    );
    const normalizedConstraints = cleanedConstraints.map((c: Constraint) => {
      if (c.type === "ImmovablePeople") {
        const sessions = (c as unknown as { sessions?: number[] }).sessions;
        return {
          ...c,
          sessions:
            Array.isArray(sessions) && sessions.length > 0
              ? sessions
              : allSessions,
        } as Constraint;
      }
      if (c.type === "ImmovablePerson") {
        const sessions = (c as unknown as { sessions?: number[] }).sessions;
        return {
          ...c,
          sessions:
            Array.isArray(sessions) && sessions.length > 0
              ? sessions
              : allSessions,
        } as Constraint;
      }
      return c;
    });

    return {
      problem: {
        people: problem.people,
        groups: problem.groups,
        num_sessions: problem.num_sessions,
      },
      objectives: [
        {
          type: "maximize_unique_contacts",
          weight: 1.0,
        },
      ],
      constraints: normalizedConstraints,
      solver: solverSettings,
    };
  }

  // Convert Rust solver result to our Solution format
  private convertRustResultToSolution(
    rustResult: RustResult,
    lastProgress?: ProgressUpdate
  ): Solution {
    // Convert the schedule format to assignments
    const assignments: Assignment[] = [];

    for (const [sessionName, groups] of Object.entries(rustResult.schedule)) {
      const sessionId = parseInt(sessionName.replace("session_", ""));
      for (const [groupId, people] of Object.entries(
        groups as Record<string, string[]>
      )) {
        for (const personId of people) {
          assignments.push({
            person_id: personId,
            group_id: groupId,
            session_id: sessionId,
          });
        }
      }
    }

    return {
      assignments,
      final_score: rustResult.final_score,
      unique_contacts: rustResult.unique_contacts,
      repetition_penalty: rustResult.repetition_penalty,
      attribute_balance_penalty: rustResult.attribute_balance_penalty,
      constraint_penalty: rustResult.constraint_penalty,
      iteration_count: lastProgress?.iteration || 0,
      elapsed_time_ms: lastProgress ? lastProgress.elapsed_seconds * 1000 : 0,
      // Add the new weighted penalty fields
      weighted_repetition_penalty: rustResult.weighted_repetition_penalty,
      weighted_constraint_penalty: rustResult.weighted_constraint_penalty,
    };
  }
}

export const wasmService = new WasmService();
