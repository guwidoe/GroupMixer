import type { SolverSettings } from '../types';
import type {
  ProgressUpdate,
  RustResult,
} from '../services/wasm/types';
import type {
  WasmBootstrapResponse,
  WasmErrorLookupResponse,
  WasmOperationHelpResponse,
  WasmRecommendSettingsRequest,
  WasmResultSummary,
  WasmSchemaLookupResponse,
  WasmSchemaSummary,
  WasmValidateResponse,
} from '../services/wasm/module';

declare module 'virtual:wasm-solver' {
  export type WasmProgressCallback = (progress_json: string) => boolean;
  export type WasmContractProgressCallback = (progress: ProgressUpdate) => boolean;

  export type ContractSolveInput = Record<string, unknown>;

  export function capabilities(): WasmBootstrapResponse;
  export function get_operation_help(operationId: string): WasmOperationHelpResponse;
  export function list_schemas(): WasmSchemaSummary[];
  export function get_schema(schemaId: string): WasmSchemaLookupResponse;
  export function list_public_errors(): WasmErrorLookupResponse[];
  export function get_public_error(errorCode: string): WasmErrorLookupResponse;
  export function get_default_solver_configuration(): SolverSettings;
  export function get_default_settings_legacy_json(): string;
  export function greet(): void;
  export function init_panic_hook(): void;
  export function recommend_settings(input: WasmRecommendSettingsRequest): SolverSettings;
  export function get_recommended_settings_legacy_json(scenario_json: string, desired_runtime_seconds: bigint): string;
  export function solve(input: ContractSolveInput): RustResult;
  export function solve_legacy_json(scenario_json: string): string;
  export function solve_with_progress(input: ContractSolveInput, progress_callback?: WasmContractProgressCallback | null): RustResult;
  export function solve_with_progress_legacy_json(scenario_json: string, progress_callback?: WasmProgressCallback | null): string;
  export function validate_scenario(input: ContractSolveInput): WasmValidateResponse;
  export function validate_scenario_legacy_json(scenario_json: string): string;
  export function evaluate_input(input: ContractSolveInput): RustResult;
  export function evaluate_input_legacy_json(input_json: string): string;
  export function inspect_result(result: RustResult): WasmResultSummary;
  export function test_callback_consistency(scenario_json: string): string;

  export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

  export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly evaluate_input: (a: number, b: number) => [number, number, number, number];
    readonly get_default_settings: () => [number, number, number, number];
    readonly get_recommended_settings: (a: number, b: number, c: bigint) => [number, number, number, number];
    readonly solve: (a: number, b: number) => [number, number, number, number];
    readonly solve_with_progress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly test_callback_consistency: (a: number, b: number) => [number, number, number, number];
    readonly validate_scenario: (a: number, b: number) => [number, number, number, number];
    readonly init_panic_hook: () => void;
    readonly greet: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
  }

  export type SyncInitInput = BufferSource | WebAssembly.Module;

  export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

  export default function init(
    module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
  ): Promise<InitOutput>;
}
