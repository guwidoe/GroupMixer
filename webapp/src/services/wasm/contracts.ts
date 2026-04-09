import type { Assignment, Scenario, Solution, SolverSettings } from "../../types";
import { convertRustResultToSolution } from "./conversions";
import {
  buildWasmRecommendSettingsRequest,
  buildWasmScenarioInput,
  buildWasmWarmStartInput,
} from "./scenarioContract";
import {
  isWasmContractModule,
  type WasmContractModule,
  type WasmContractSolveInput,
  type WasmBootstrapResponse,
  type WasmErrorLookupResponse,
  type WasmPublicErrorEnvelope,
  type WasmOperationHelpResponse,
  type WasmRecommendSettingsRequest,
  type WasmSolverCatalogResponse,
  type WasmSolverDescriptor,
  type WasmSchemaLookupResponse,
  type WasmSchemaSummary,
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

function buildSolvePayload(scenario: Scenario): WasmContractSolveInput {
  return buildWasmScenarioInput(scenario);
}

function buildEvaluatePayload(
  scenario: Scenario,
  assignments: Assignment[],
): WasmContractSolveInput & {
  initial_schedule: Record<string, Record<string, string[]>>;
} {
  return buildWasmWarmStartInput(scenario, assignmentsToSchedule(assignments));
}

export class WasmContractClient {
  private module: WasmContractModule | null = null;
  private loading = false;
  private initializationFailed = false;

  constructor(
    private readonly loadModule: WasmModuleLoader = () => import("./runtimeModule"),
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

  async capabilities(): Promise<WasmBootstrapResponse> {
    const module = await this.requireModule();

    try {
      return module.capabilities();
    } catch (error) {
      throw normalizeContractError(error, "Failed to read solver capabilities");
    }
  }

  async getOperationHelp(operationId: string): Promise<WasmOperationHelpResponse> {
    const module = await this.requireModule();

    try {
      return module.get_operation_help(operationId);
    } catch (error) {
      throw normalizeContractError(error, `Failed to read operation help for ${operationId}`);
    }
  }

  async listSchemas(): Promise<WasmSchemaSummary[]> {
    const module = await this.requireModule();

    try {
      return module.list_schemas();
    } catch (error) {
      throw normalizeContractError(error, "Failed to list public schemas");
    }
  }

  async getSchema(schemaId: string): Promise<WasmSchemaLookupResponse> {
    const module = await this.requireModule();

    try {
      return module.get_schema(schemaId);
    } catch (error) {
      throw normalizeContractError(error, `Failed to get schema ${schemaId}`);
    }
  }

  async listPublicErrors(): Promise<WasmErrorLookupResponse[]> {
    const module = await this.requireModule();

    try {
      return module.list_public_errors();
    } catch (error) {
      throw normalizeContractError(error, "Failed to list public errors");
    }
  }

  async getPublicError(errorCode: string): Promise<WasmErrorLookupResponse> {
    const module = await this.requireModule();

    try {
      return module.get_public_error(errorCode);
    } catch (error) {
      throw normalizeContractError(error, `Failed to get public error ${errorCode}`);
    }
  }

  async listSolvers(): Promise<WasmSolverCatalogResponse> {
    const module = await this.requireModule();

    if (typeof module.list_solvers !== "function") {
      throw new WasmContractClientError(
        "Failed to list solvers: runtime does not expose list_solvers",
      );
    }

    try {
      return module.list_solvers();
    } catch (error) {
      throw normalizeContractError(error, "Failed to list solvers");
    }
  }

  async getSolverDescriptor(solverId: string): Promise<WasmSolverDescriptor> {
    const module = await this.requireModule();

    if (typeof module.get_solver_descriptor !== "function") {
      throw new WasmContractClientError(
        "Failed to get solver descriptor: runtime does not expose get_solver_descriptor",
      );
    }

    try {
      return module.get_solver_descriptor(solverId);
    } catch (error) {
      throw normalizeContractError(error, `Failed to get solver descriptor ${solverId}`);
    }
  }

  async recommendSettings(
    scenario: Scenario,
    desiredRuntimeSeconds: number,
  ): Promise<SolverSettings> {
    const module = await this.requireModule();

    try {
      return module.recommend_settings(
        buildWasmRecommendSettingsRequest(scenario, desiredRuntimeSeconds),
      );
    } catch (error) {
      throw normalizeContractError(error, "Failed to recommend solver settings");
    }
  }

  async solve(scenario: Scenario): Promise<Solution> {
    const module = await this.requireModule();

    try {
      const result = module.solve(buildSolvePayload(scenario));
      return convertRustResultToSolution(result as RustResult);
    } catch (error) {
      throw normalizeContractError(error, "Failed to solve scenario");
    }
  }

  async solveContract(input: WasmContractSolveInput): Promise<RustResult> {
    const module = await this.requireModule();

    try {
      return module.solve(input);
    } catch (error) {
      throw normalizeContractError(error, "Failed to solve scenario");
    }
  }

  async solveWithProgress(
    scenario: Scenario,
    progressCallback?: ProgressCallback,
  ): Promise<{ solution: Solution; lastProgress: ProgressUpdate | null }> {
    const module = await this.requireModule();

    try {
      let lastProgress: ProgressUpdate | null = null;
      const result = module.solve_with_progress(
        buildSolvePayload(scenario),
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
      throw normalizeContractError(error, "Failed to solve scenario");
    }
  }

  async solveContractWithProgress(
    input: WasmContractSolveInput,
    progressCallback?: ProgressCallback,
  ): Promise<{ result: RustResult; lastProgress: ProgressUpdate | null }> {
    const module = await this.requireModule();

    try {
      let lastProgress: ProgressUpdate | null = null;
      const result = module.solve_with_progress(
        input,
        progressCallback
          ? ((progress: ProgressUpdate) => {
              lastProgress = progress;
              progressCallback(progress);
              return true;
            })
          : undefined,
      );

      return { result: result as RustResult, lastProgress };
    } catch (error) {
      throw normalizeContractError(error, "Failed to solve scenario");
    }
  }

  async validateScenario(scenario: Scenario): Promise<WasmValidateResponse> {
    const module = await this.requireModule();

    try {
      return module.validate_scenario(buildSolvePayload(scenario));
    } catch (error) {
      throw normalizeContractError(error, "Failed to validate scenario");
    }
  }

  async validateScenarioContract(input: WasmContractSolveInput): Promise<WasmValidateResponse> {
    const module = await this.requireModule();

    try {
      return module.validate_scenario(input);
    } catch (error) {
      throw normalizeContractError(error, "Failed to validate scenario");
    }
  }

  async recommendSettingsContract(
    input: WasmRecommendSettingsRequest,
  ): Promise<SolverSettings> {
    const module = await this.requireModule();

    try {
      return module.recommend_settings(input);
    } catch (error) {
      throw normalizeContractError(error, "Failed to recommend solver settings");
    }
  }

  async evaluateInput(scenario: Scenario, assignments: Assignment[]): Promise<Solution> {
    const module = await this.requireModule();

    try {
      const result = module.evaluate_input(buildEvaluatePayload(scenario, assignments));
      return convertRustResultToSolution(result as RustResult);
    } catch (error) {
      throw normalizeContractError(error, "Failed to evaluate input");
    }
  }

  async evaluateInputContract(input: WasmContractSolveInput): Promise<RustResult> {
    const module = await this.requireModule();

    try {
      return module.evaluate_input(input);
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
