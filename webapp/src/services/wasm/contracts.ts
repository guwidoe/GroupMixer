import type { Assignment, Problem, Solution, SolverSettings } from "../../types";
import { buildRustProblemPayload } from "../rustBoundary";
import { convertRustResultToSolution } from "./conversions";
import {
  isWasmContractModule,
  type WasmContractModule,
  type WasmPublicErrorEnvelope,
  type WasmRecommendSettingsRequest,
  type WasmValidateResponse,
  type WasmResultSummary,
  type WasmModuleLoader,
} from "./module";
import type { ProgressCallback, ProgressUpdate, RustResult } from "./types";

export class WasmContractClientError extends Error {
  readonly code?: string;
  readonly envelope?: WasmPublicErrorEnvelope;

  constructor(message: string, options?: { code?: string; envelope?: WasmPublicErrorEnvelope }) {
    super(message);
    this.name = "WasmContractClientError";
    this.code = options?.code;
    this.envelope = options?.envelope;
  }
}

function isPublicErrorEnvelope(value: unknown): value is WasmPublicErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const error = record.error;
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as Record<string, unknown>;
  return typeof errorRecord.code === "string" && typeof errorRecord.message === "string";
}

export function normalizeContractError(
  error: unknown,
  fallbackPrefix: string,
): WasmContractClientError {
  if (error instanceof WasmContractClientError) {
    return error;
  }

  if (isPublicErrorEnvelope(error)) {
    const code = error.error.code;
    const message = error.error.message;
    return new WasmContractClientError(`${fallbackPrefix}: ${code}: ${message}`, {
      code,
      envelope: error,
    });
  }

  if (error instanceof Error && error.message) {
    return new WasmContractClientError(`${fallbackPrefix}: ${error.message}`);
  }

  if (error && typeof error === "object") {
    const record = error as { message?: unknown };
    if (typeof record.message === "string" && record.message) {
      return new WasmContractClientError(`${fallbackPrefix}: ${record.message}`);
    }
  }

  const text = String(error);
  return new WasmContractClientError(
    text && text !== "[object Object]" ? `${fallbackPrefix}: ${text}` : fallbackPrefix,
  );
}

function buildRecommendSettingsRequest(
  problem: Problem,
  desiredRuntimeSeconds: number,
): WasmRecommendSettingsRequest {
  const payload = buildRustProblemPayload(problem) as {
    problem?: Record<string, unknown>;
    objectives?: unknown[];
    constraints?: unknown[];
  };

  return {
    problem_definition: payload.problem ?? {},
    objectives: payload.objectives ?? [],
    constraints: payload.constraints ?? [],
    desired_runtime_seconds: desiredRuntimeSeconds,
  };
}

function assignmentsToSchedule(
  assignments: Assignment[],
): Record<string, Record<string, string[]>> {
  const schedule: Record<string, Record<string, string[]>> = {};

  for (const assignment of assignments) {
    const sessionKey = `session_${assignment.session_id}`;
    schedule[sessionKey] = schedule[sessionKey] || {};
    schedule[sessionKey][assignment.group_id] = schedule[sessionKey][assignment.group_id] || [];
    schedule[sessionKey][assignment.group_id].push(assignment.person_id);
  }

  return schedule;
}

function buildSolvePayload(problem: Problem): Record<string, unknown> {
  return buildRustProblemPayload(problem);
}

function buildEvaluatePayload(
  problem: Problem,
  assignments: Assignment[],
): Record<string, unknown> & {
  initial_schedule: Record<string, Record<string, string[]>>;
} {
  const payload = buildSolvePayload(problem) as Record<string, unknown> & {
    initial_schedule?: Record<string, Record<string, string[]>>;
  };
  payload.initial_schedule = assignmentsToSchedule(assignments);
  return payload as Record<string, unknown> & {
    initial_schedule: Record<string, Record<string, string[]>>;
  };
}

export class WasmContractClient {
  private module: WasmContractModule | null = null;
  private loading = false;
  private initializationFailed = false;

  constructor(
    private readonly loadModule: WasmModuleLoader = () => import("virtual:wasm-solver"),
  ) {}

  private async requireModule(): Promise<WasmContractModule> {
    if (!this.module && !this.initializationFailed) {
      await this.initialize();
    }

    if (!this.module) {
      throw new WasmContractClientError(
        "Contract-native WASM module not available. Please check the build configuration.",
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
      const wasmModule = await this.loadModule().catch((error) => {
        throw new Error(
          error instanceof Error && error.message
            ? error.message
            : "Unknown module load error",
        );
      });

      if (typeof (wasmModule as { default?: unknown }).default !== "function") {
        throw new Error("WASM module does not expose the expected async initializer.");
      }

      if (!isWasmContractModule(wasmModule)) {
        throw new Error(
          "WASM module shape does not match the expected contract-native runtime surface.",
        );
      }

      await wasmModule.default();
      this.module = wasmModule;
    } catch (error) {
      this.initializationFailed = true;
      throw normalizeContractError(error, "Failed to initialize contract-native WASM solver");
    } finally {
      this.loading = false;
    }
  }

  async getDefaultSolverConfiguration(): Promise<SolverSettings> {
    const module = await this.requireModule();

    try {
      return module.get_default_solver_configuration();
    } catch (error) {
      throw normalizeContractError(error, "Failed to get default solver configuration");
    }
  }

  async recommendSettings(
    problem: Problem,
    desiredRuntimeSeconds: number,
  ): Promise<SolverSettings> {
    const module = await this.requireModule();

    try {
      return module.recommend_settings(
        buildRecommendSettingsRequest(problem, desiredRuntimeSeconds),
      );
    } catch (error) {
      throw normalizeContractError(error, "Failed to recommend solver settings");
    }
  }

  async solve(problem: Problem): Promise<Solution> {
    const module = await this.requireModule();

    try {
      const result = module.solve(buildSolvePayload(problem));
      return convertRustResultToSolution(result as RustResult);
    } catch (error) {
      throw normalizeContractError(error, "Failed to solve problem");
    }
  }

  async solveWithProgress(
    problem: Problem,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    const module = await this.requireModule();

    try {
      let lastProgress: ProgressUpdate | null = null;
      const result = module.solve_with_progress(
        buildSolvePayload(problem),
        progressCallback
          ? ((progress: ProgressUpdate) => {
              lastProgress = progress;
              progressCallback(progress);
              return true;
            })
          : undefined,
      );

      return {
        solution: convertRustResultToSolution(result as RustResult, lastProgress ?? undefined),
        lastProgress,
      };
    } catch (error) {
      throw normalizeContractError(error, "Failed to solve problem");
    }
  }

  async validateProblem(problem: Problem): Promise<WasmValidateResponse> {
    const module = await this.requireModule();

    try {
      return module.validate_problem(buildSolvePayload(problem));
    } catch (error) {
      throw normalizeContractError(error, "Failed to validate problem");
    }
  }

  async evaluateInput(problem: Problem, assignments: Assignment[]): Promise<Solution> {
    const module = await this.requireModule();

    try {
      const result = module.evaluate_input(buildEvaluatePayload(problem, assignments));
      return convertRustResultToSolution(result as RustResult);
    } catch (error) {
      throw normalizeContractError(error, "Failed to evaluate input");
    }
  }

  async inspectResult(result: RustResult): Promise<WasmResultSummary> {
    const module = await this.requireModule();

    try {
      return module.inspect_result(result);
    } catch (error) {
      throw normalizeContractError(error, "Failed to inspect result");
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
}

export const wasmContractClient = new WasmContractClient();
