import type { SolverSettings } from "../../types";
import type { ProgressUpdate, RustResult } from "./types";

export type WasmProgressJsonCallback = (progressJson: string) => boolean;
export type WasmContractProgressCallback = (progress: ProgressUpdate) => boolean;

export type WasmContractSolveInput = Record<string, unknown>;

export interface WasmRecommendSettingsRequest {
  problem_definition: Record<string, unknown>;
  objectives: unknown[];
  constraints: unknown[];
  desired_runtime_seconds: number;
}

export interface WasmValidationIssue {
  code?: string;
  message: string;
  path?: string;
}

export interface WasmValidateResponse {
  valid: boolean;
  issues: WasmValidationIssue[];
}

export interface WasmResultSummary {
  final_score: number;
  unique_contacts: number;
  repetition_penalty: number;
  attribute_balance_penalty: number;
  constraint_penalty: number;
  effective_seed?: number;
  stop_reason?: string;
}

export interface WasmPublicError {
  code: string;
  message: string;
  where_path?: string;
  why?: string;
  valid_alternatives?: string[];
  recovery?: string;
  related_help?: string[];
}

export interface WasmPublicErrorEnvelope {
  error: WasmPublicError;
}

export type WasmInitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export interface WasmInitOutput {
  readonly memory: WebAssembly.Memory;
}

export interface WasmSolverModule {
  solve: (problemJson: string) => string;
  solve_with_progress(problemJson: string, progressCallback?: WasmProgressJsonCallback | null): string;
  solve_with_progress(input: WasmContractSolveInput, progressCallback?: WasmContractProgressCallback | null): RustResult;
  validate_problem: (problemJson: string) => string;
  get_default_settings: () => string;
  get_recommended_settings: (
    problemJson: string,
    desiredRuntimeSeconds: bigint,
  ) => string;
  validate_problem_contract: (input: WasmContractSolveInput) => WasmValidateResponse;
  get_default_solver_configuration: () => SolverSettings;
  recommend_settings: (input: WasmRecommendSettingsRequest) => SolverSettings;
  evaluate_input_contract: (input: WasmContractSolveInput) => RustResult;
  inspect_result_contract: (result: RustResult) => WasmResultSummary;
  solve_contract?: (input: WasmContractSolveInput) => RustResult;
  recommend_settings_contract?: (input: WasmRecommendSettingsRequest) => SolverSettings;
  evaluate_input?: (inputJson: string) => string;
  init_panic_hook?: () => void;
  default: (moduleOrPath?: WasmInitInput | Promise<WasmInitInput>) => Promise<WasmInitOutput>;
}

export type WasmContractModule = WasmSolverModule;

export function isWasmSolverModule(value: unknown): value is WasmSolverModule {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const module = value as Partial<WasmSolverModule>;

  return (
    typeof module.solve === 'function' &&
    typeof module.solve_with_progress === 'function' &&
    typeof module.validate_problem === 'function' &&
    typeof module.get_default_settings === 'function' &&
    typeof module.get_recommended_settings === 'function' &&
    typeof module.default === 'function'
  );
}

export function isWasmContractModule(value: unknown): value is WasmSolverModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const module = value as Partial<WasmSolverModule>;

  return (
    typeof module.solve_with_progress === "function" &&
    typeof module.validate_problem_contract === "function" &&
    typeof module.get_default_solver_configuration === "function" &&
    typeof module.recommend_settings === "function" &&
    typeof module.evaluate_input_contract === "function" &&
    typeof module.inspect_result_contract === "function" &&
    typeof module.default === "function"
  );
}
