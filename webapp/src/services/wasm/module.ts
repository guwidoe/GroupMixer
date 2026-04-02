import type { Scenario, SolverSettings } from "../../types";
import type { ProgressUpdate, RustResult } from "./types";
import type { WarmStartSchedule } from "./scenarioContract";

export type WasmContractProgressCallback = (progress: ProgressUpdate) => boolean;
export type WasmModuleLoader = () => Promise<WasmContractModule>;

export interface WasmContractSolveInput {
  scenario: Scenario;
  initial_schedule?: WarmStartSchedule;
}

export interface WasmRecommendSettingsRequest {
  scenario: Scenario;
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

export interface WasmCapabilityOperationSummary {
  operation_id: string;
  summary: string;
  family: string;
  kind: string;
  help_export_name: string;
  export_name?: string;
  help_target: string;
}

export interface WasmBootstrapMetadata {
  title: string;
  summary: string;
  discovery_note: string;
  top_level_operation_ids: string[];
}

export interface WasmBootstrapResponse {
  bootstrap: WasmBootstrapMetadata;
  help_export_name: string;
  schema_list_export_name: string;
  schema_lookup_export_name: string;
  error_list_export_name: string;
  error_lookup_export_name: string;
  top_level_operations: WasmCapabilityOperationSummary[];
}

export interface WasmOperationExampleSummary {
  id: string;
  summary: string;
  description: string;
}

export interface WasmRelatedOperationSummary {
  operation_id: string;
  summary: string;
  help_export_name: string;
  export_name?: string;
  help_target: string;
}

export interface WasmOperationHelp {
  id: string;
  summary: string;
  description: string;
  kind: string;
  family: string;
  input_schema_ids: string[];
  output_schema_ids: string[];
  progress_schema_ids: string[];
  error_codes: string[];
  related_operation_ids: string[];
  example_ids: string[];
}

export interface WasmOperationHelpResponse {
  operation: WasmOperationHelp;
  help_export_name: string;
  export_name?: string;
  help_target: string;
  examples: WasmOperationExampleSummary[];
  related_operations: WasmRelatedOperationSummary[];
}

export interface WasmSchemaSummary {
  id: string;
  version: string;
}

export interface WasmSchemaLookupResponse {
  id: string;
  version: string;
  schema: unknown;
}

export interface WasmErrorLookupResponse {
  error: {
    code: string;
    category: string;
    message: string;
    summary?: string;
    recovery?: string;
    related_help_operation_ids?: string[];
    valid_alternatives?: string[];
  };
  help_export_name: string;
  related_help_targets: string[];
}

export type WasmInitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;

export type WasmSyncInitInput = BufferSource | WebAssembly.Module;

export interface WasmInitOutput {
  readonly memory: WebAssembly.Memory;
}

export interface WasmContractModule {
  capabilities: () => WasmBootstrapResponse;
  get_operation_help: (operationId: string) => WasmOperationHelpResponse;
  list_schemas: () => WasmSchemaSummary[];
  get_schema: (schemaId: string) => WasmSchemaLookupResponse;
  list_public_errors: () => WasmErrorLookupResponse[];
  get_public_error: (errorCode: string) => WasmErrorLookupResponse;
  solve: (input: WasmContractSolveInput) => RustResult;
  solve_with_progress: (
    input: WasmContractSolveInput,
    progressCallback?: WasmContractProgressCallback | null,
  ) => RustResult;
  validate_scenario: (input: WasmContractSolveInput) => WasmValidateResponse;
  get_default_solver_configuration: () => SolverSettings;
  recommend_settings: (input: WasmRecommendSettingsRequest) => SolverSettings;
  evaluate_input: (input: WasmContractSolveInput) => RustResult;
  inspect_result: (result: RustResult) => WasmResultSummary;
  init_panic_hook?: () => void;
  default: (moduleOrPath?: WasmInitInput | Promise<WasmInitInput>) => Promise<WasmInitOutput>;
}

export const REQUIRED_WASM_CONTRACT_METHODS = [
  "capabilities",
  "get_operation_help",
  "list_schemas",
  "get_schema",
  "list_public_errors",
  "get_public_error",
  "solve",
  "solve_with_progress",
  "validate_scenario",
  "get_default_solver_configuration",
  "recommend_settings",
  "evaluate_input",
  "inspect_result",
  "default",
] as const satisfies ReadonlyArray<keyof WasmContractModule>;

export const WASM_RUNTIME_EXPORT_NAMES = {
  capabilities: "capabilities",
  get_operation_help: "get_operation_help",
  list_schemas: "list_schemas",
  get_schema: "get_schema",
  list_public_errors: "list_public_errors",
  get_public_error: "get_public_error",
  solve: "solve",
  solve_with_progress: "solve_with_progress",
  validate_scenario: "validate_scenario",
  get_default_solver_configuration: "get_default_solver_configuration",
  recommend_settings: "recommend_settings",
  evaluate_input: "evaluate_input",
  inspect_result: "inspect_result",
  init_panic_hook: "init_panic_hook",
  initSync: "initSync",
} as const;

export type WasmSolverModule = WasmContractModule;

function hasRequiredContractMethod<K extends keyof WasmContractModule>(
  module: Partial<WasmContractModule>,
  key: K,
): boolean {
  return typeof module[key] === "function";
}

export function isWasmContractModule(value: unknown): value is WasmContractModule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const module = value as Partial<WasmContractModule>;

  return REQUIRED_WASM_CONTRACT_METHODS.every((key) => hasRequiredContractMethod(module, key));
}

export function isWasmSolverModule(value: unknown): value is WasmSolverModule {
  return isWasmContractModule(value);
}
