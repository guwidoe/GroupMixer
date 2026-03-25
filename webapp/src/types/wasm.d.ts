import type { SolverSettings } from '../types';
import type { ProgressUpdate, RustResult } from '../services/wasm/types';

declare module 'virtual:wasm-solver' {
  export type WasmProgressCallback = (progress_json: string) => boolean;
  export type WasmContractProgressCallback = (progress: ProgressUpdate) => boolean;

  export type ContractSolveInput = Record<string, unknown>;

  export interface RecommendSettingsRequest {
    problem_definition: Record<string, unknown>;
    objectives: unknown[];
    constraints: unknown[];
    desired_runtime_seconds: number;
  }

  export interface ValidationIssue {
    code?: string;
    message: string;
    path?: string;
  }

  export interface ValidateResponse {
    valid: boolean;
    issues: ValidationIssue[];
  }

  export interface ResultSummary {
    final_score: number;
    unique_contacts: number;
    repetition_penalty: number;
    attribute_balance_penalty: number;
    constraint_penalty: number;
    effective_seed?: number;
    stop_reason?: string;
  }

  export function get_default_solver_configuration(): SolverSettings;
  export function get_default_settings_legacy_json(): string;
  export function greet(): void;
  export function init_panic_hook(): void;
  export function recommend_settings(input: RecommendSettingsRequest): SolverSettings;
  export function get_recommended_settings_legacy_json(problem_json: string, desired_runtime_seconds: bigint): string;
  export function solve(input: ContractSolveInput): RustResult;
  export function solve_legacy_json(problem_json: string): string;
  export function solve_with_progress(input: ContractSolveInput, progress_callback?: WasmContractProgressCallback | null): RustResult;
  export function solve_with_progress_legacy_json(problem_json: string, progress_callback?: WasmProgressCallback | null): string;
  export function validate_problem(input: ContractSolveInput): ValidateResponse;
  export function validate_problem_legacy_json(problem_json: string): string;
  export function evaluate_input(input: ContractSolveInput): RustResult;
  export function evaluate_input_legacy_json(input_json: string): string;
  export function inspect_result(result: RustResult): ResultSummary;
  export function test_callback_consistency(problem_json: string): string;

  export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

  export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly evaluate_input: (a: number, b: number) => [number, number, number, number];
    readonly get_default_settings: () => [number, number, number, number];
    readonly get_recommended_settings: (a: number, b: number, c: bigint) => [number, number, number, number];
    readonly solve: (a: number, b: number) => [number, number, number, number];
    readonly solve_with_progress: (a: number, b: number, c: number) => [number, number, number, number];
    readonly test_callback_consistency: (a: number, b: number) => [number, number, number, number];
    readonly validate_problem: (a: number, b: number) => [number, number, number, number];
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
