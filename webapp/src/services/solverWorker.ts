import type { Problem, Solution, SolverSettings, Constraint } from "../types";
import type { ProgressUpdate, ProgressCallback } from "./wasm";

interface WorkerMessage {
  type: string;
  id: string;
  data?: unknown;
}

interface SolverMessageData {
  problemJson?: string;
  useProgress?: boolean;
  args?: unknown[];
  desired_runtime_seconds?: number;
}

interface SolverResult {
  result: string;
  lastProgress?: ProgressUpdate | null;
}

interface WorkerMessageData {
  progressJson?: string;
  result?: string;
  lastProgressJson?: string;
  error?: string;
  problemJson?: string;
  level?: string;
  args?: unknown[];
}

interface RustSolverParams {
  initial_temperature: number;
  final_temperature: number;
  reheat_cycles?: number;
  reheat_after_no_improvement: number;
}

interface RustSolverSettings {
  solver_type: string;
  [key: string]: unknown;
}

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

export class SolverWorkerService {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingMessages = new Map<
    string,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      progressCallback?: ProgressCallback;
    }
  >();
  private isInitialized = false;
  private lastProgressUpdate: ProgressUpdate | null = null;

  async initialize(): Promise<void> {
    if (this.worker || this.isInitialized) {
      return;
    }

    try {
      // Prefer module worker that imports ESM wasm glue
      try {
        this.worker = new Worker(
          new URL("../workers/solverWorker.ts", import.meta.url),
          {
            type: "module",
          }
        );
      } catch (e) {
        // Fallback to legacy script worker in /public for older environments
        // eslint-disable-next-line no-console
        console.warn(
          "Falling back to legacy script worker due to module worker init error:",
          (e as Error).message
        );
        this.worker = new Worker("/solver-worker.js");
      }
      this.setupMessageHandler();

      // Initialize the worker
      await this.sendMessage("INIT", {});
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize solver worker:", error);
      this.worker = null;
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize solver worker: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { type, id, data } = e.data;
      const pending = this.pendingMessages.get(id);

      switch (type) {
        case "INIT_SUCCESS":
          if (pending) {
            pending.resolve(true);
            this.pendingMessages.delete(id);
          }
          break;

        case "PROGRESS":
          if (pending?.progressCallback) {
            try {
              const messageData = data as WorkerMessageData;
              const progress: ProgressUpdate = JSON.parse(
                messageData.progressJson || "{}"
              );
              pending.progressCallback(progress);
              this.lastProgressUpdate = progress;
            } catch (error) {
              console.error("Failed to parse progress update:", error);
            }
          }
          break;

        case "SOLVE_SUCCESS":
          if (pending) {
            // The worker now returns both the result and the last progress JSON
            const messageData = data as WorkerMessageData;
            const { result, lastProgressJson } = messageData;

            let lastProgress: ProgressUpdate | null = null;
            if (lastProgressJson) {
              try {
                lastProgress = JSON.parse(lastProgressJson);
              } catch (e) {
                console.error("Failed to parse last progress update:", e);
              }
            }

            // Resolve with both the final result and the last progress update
            pending.resolve({ result: result || "", lastProgress });
            this.pendingMessages.delete(id);
          }
          break;

        case "CANCELLED":
          if (pending) {
            pending.reject(new Error("Solver cancelled"));
            this.pendingMessages.delete(id);
          }
          break;

        case "ERROR": {
          if (pending) {
            const messageData = data as WorkerMessageData;
            pending.reject(new Error(messageData.error || "Unknown error"));
            this.pendingMessages.delete(id);
          } else {
            console.error("Worker error:", data);
          }
          const messageData = data as WorkerMessageData;
          if (messageData.problemJson) {
            console.debug(
              "[Worker] Solver input JSON that caused the error:",
              messageData.problemJson
            );
          }
          break;
        }

        case "LOG":
          {
            const messageData = data as WorkerMessageData;
            const { level, args } = messageData;
            if (Array.isArray(args)) {
              switch (level) {
                case "warn":
                  console.warn("[Worker]", ...args);
                  break;
                case "error":
                  console.error("[Worker]", ...args);
                  break;
                case "debug":
                  console.debug("[Worker]", ...args);
                  break;
                default:
                  console.log("[Worker]", ...args);
              }
            }
          }
          break;

        case "RPC_SUCCESS":
          if (pending) {
            const messageData = data as WorkerMessageData;
            pending.resolve(messageData.result || "");
            this.pendingMessages.delete(id);
          }
          break;

        case "RPC_ERROR":
          if (pending) {
            const messageData = data as WorkerMessageData;
            pending.reject(new Error(messageData.error || "Unknown error"));
            this.pendingMessages.delete(id);
          }
          break;

        case "PROBLEM_JSON":
          {
            const messageData = data as WorkerMessageData;
            const { problemJson } = messageData;
            try {
              // Store globally for quick copy/paste in devtools
              (
                window as unknown as Record<string, unknown>
              ).lastSolverProblemJson = problemJson;
              // Emit a browser event so other parts of the UI / devtools can listen
              window.dispatchEvent(
                new CustomEvent("solver-problem-json", { detail: problemJson })
              );
            } catch {
              /* no-op */
            }
            console.debug("[Worker] Problem JSON received:", problemJson);
          }
          break;

        default:
          console.warn("Unknown worker message type:", type);
      }
    };

    this.worker.onerror = () => {
      console.error("Worker error occurred");
      // Reject all pending messages
      this.pendingMessages.forEach(({ reject }) => {
        reject(new Error("Worker error"));
      });
      this.pendingMessages.clear();
    };
  }

  private sendMessage(
    type: string,
    data: SolverMessageData,
    progressCallback?: ProgressCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const id = (++this.messageId).toString();
      this.pendingMessages.set(id, { resolve, reject, progressCallback });

      this.worker.postMessage({ type, id, data });
    });
  }

  private sendMessageWithProgress(
    type: string,
    data: SolverMessageData,
    progressCallback?: ProgressCallback
  ): Promise<SolverResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const id = (++this.messageId).toString();
      this.pendingMessages.set(id, { resolve, reject, progressCallback });

      this.worker.postMessage({ type, id, data });
    });
  }

  async solve(problem: Problem): Promise<Solution> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Build the JSON once so we can log it on errors
    const problemJson = JSON.stringify(
      this.convertProblemToRustFormat(problem)
    );

    // For debugging purposes, log the payload we are about to send to the worker
    console.debug(
      "[SolverWorkerService] Problem JSON sent to worker:",
      problemJson
    );

    const resultJson = await this.sendMessage("SOLVE", {
      problemJson,
      useProgress: false,
    });
    const rustResult = JSON.parse(resultJson);
    return this.convertRustResultToSolution(rustResult, null);
  }

  async solveWithProgress(
    problem: Problem,
    progressCallback?: ProgressCallback
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const problemJson = JSON.stringify(
      this.convertProblemToRustFormat(problem)
    );

    console.debug(
      "[SolverWorkerService] Problem JSON sent to worker (with progress):",
      problemJson
    );

    // The promise now resolves with an object { result, lastProgress }
    const { result, lastProgress } = await this.sendMessageWithProgress(
      "SOLVE",
      {
        problemJson,
        useProgress: true,
      },
      progressCallback
    );

    const rustResult = JSON.parse(result);
    const solution = this.convertRustResultToSolution(rustResult, lastProgress);

    // Return both the solution and the last progress update
    return { solution, lastProgress: lastProgress || null };
  }

  async solveWithProgressWarmStart(
    problem: Problem,
    initialSchedule: Record<string, Record<string, string[]>>,
    progressCallback?: ProgressCallback
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Inject initial_schedule into the payload expected by Rust ApiInput
    const payload = this.convertProblemToRustFormat(problem) as Record<
      string,
      unknown
    > & {
      initial_schedule?: Record<string, Record<string, string[]>>;
    };
    payload.initial_schedule = initialSchedule;

    const problemJson = JSON.stringify(payload);

    console.debug(
      "[SolverWorkerService] Problem JSON (warm-start) sent to worker:",
      problemJson
    );

    const { result, lastProgress } = await this.sendMessageWithProgress(
      "SOLVE",
      { problemJson, useProgress: true },
      progressCallback
    );

    const rustResult = JSON.parse(result);
    const solution = this.convertRustResultToSolution(rustResult, lastProgress);
    return { solution, lastProgress: lastProgress || null };
  }

  async cancel(): Promise<void> {
    if (!this.worker) return;

    // Reject all pending messages with a specific cancellation error
    this.pendingMessages.forEach(({ reject }) => {
      reject(new Error("Solver cancelled by user"));
    });
    this.pendingMessages.clear();

    // Terminate the current worker
    this.worker.terminate();
    this.worker = null;
    this.isInitialized = false;

    // Reinitialize for future use
    try {
      await this.initialize();
    } catch (error) {
      console.error("Failed to reinitialize worker after cancellation:", error);
      // Don't throw here - cancellation succeeded even if reinitialization failed
    }
  }

  // Convert Problem to the format expected by the Rust solver
  private convertProblemToRustFormat(
    problem: Problem
  ): Record<string, unknown> {
    // Convert solver_params from UI format to Rust format
    const solverSettings = { ...problem.settings };

    // The UI sends solver_params as { "SimulatedAnnealing": { ... } }
    // But Rust expects { "solver_type": "SimulatedAnnealing", initial_temperature: ..., etc }
    // due to the #[serde(tag = "solver_type")] attribute on the SolverParams enum
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
          .SimulatedAnnealing as RustSolverParams;
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
        if (params.reheat_cycles !== undefined) {
          params.reheat_cycles = sanitizeNumber(params.reheat_cycles, 0);
        }
        params.reheat_after_no_improvement = sanitizeNumber(
          params.reheat_after_no_improvement,
          0
        );

        // Flatten for serde tagged enum
        (solverSettings as RustSolverSettings).solver_params = {
          solver_type: solverType,
          ...solverSettings.solver_params.SimulatedAnnealing,
        };
      }
    }

    // Prepare objectives list – if none provided, fall back to a sensible default so that
    // existing problems created before objectives were introduced continue to work.
    const objectives =
      problem.objectives && problem.objectives.length > 0
        ? problem.objectives
        : [
            {
              type: "maximize_unique_contacts",
              weight: 1.0,
            },
          ];

    // Clean constraints: ensure penalty_weight is a number when required to satisfy Rust deserialization
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

    // Ensure immovable constraints always include sessions (Rust requires them)
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
      objectives,
      constraints: normalizedConstraints,
      solver: solverSettings,
    };
  }

  // Convert Rust solver result to our Solution format
  private convertRustResultToSolution(
    rustResult: RustResult,
    lastProgress?: ProgressUpdate | null
  ): Solution {
    // Convert the schedule format to assignments
    const assignments: Array<{
      person_id: string;
      group_id: string;
      session_id: number;
    }> = [];

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

    // Use the provided lastProgress if available, otherwise fall back to the stored one
    const progressToUse = lastProgress || this.lastProgressUpdate;

    return {
      assignments,
      final_score: rustResult.final_score,
      unique_contacts: rustResult.unique_contacts,
      repetition_penalty: rustResult.repetition_penalty,
      attribute_balance_penalty: rustResult.attribute_balance_penalty,
      constraint_penalty: rustResult.constraint_penalty,
      iteration_count: progressToUse?.iteration || 0,
      elapsed_time_ms: (progressToUse?.elapsed_seconds || 0) * 1000,
      // Add the new weighted penalty fields
      weighted_repetition_penalty: rustResult.weighted_repetition_penalty,
      weighted_constraint_penalty: rustResult.weighted_constraint_penalty,
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
    this.pendingMessages.clear();
  }

  // Helper to invoke RPC-style methods exposed by the worker / WASM module
  private async callSolver(
    method: string,
    ...args: unknown[]
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let data: SolverMessageData = {};

    switch (method) {
      case "get_default_settings":
        // No extra data needed
        data = {};
        break;
      case "get_recommended_settings":
        // Expect args: problemJson, desired_runtime_seconds
        data = {
          problemJson: args[0] as string,
          desired_runtime_seconds: args[1] as number,
        };
        break;
      default:
        // Generic mapping: send raw args array
        data = { args };
    }

    const result = await this.sendMessage(method, data);
    return result;
  }

  public async get_default_settings(): Promise<SolverSettings> {
    const result = await this.callSolver("get_default_settings");
    return JSON.parse(result as string);
  }

  public async get_recommended_settings(
    problem: Problem,
    desired_runtime_seconds: number
  ): Promise<SolverSettings> {
    // ===== DEBUG LOGGING =====
    // These logs help verify exactly what is sent to the WASM layer and what comes back.
    try {
      console.debug(
        "[SolverWorker] get_recommended_settings → problem:",
        JSON.stringify(problem, null, 2)
      );
      console.debug(
        "[SolverWorker] get_recommended_settings → desired_runtime_seconds:",
        desired_runtime_seconds
      );
    } catch {
      // Swallow JSON.stringify errors for circular structures – shouldn't happen here.
    }

    const result = await this.callSolver(
      "get_recommended_settings",
      JSON.stringify(problem),
      desired_runtime_seconds
    );

    // Log the raw JSON result for inspection before parsing.
    try {
      console.debug(
        "[SolverWorker] get_recommended_settings ← raw result:",
        result
      );
    } catch {
      /* ignore */
    }

    return JSON.parse(result as string);
  }
}

export const solverWorkerService = new SolverWorkerService();
