declare module 'virtual:wasm-solver' {
  export type WasmProgressCallback = (progress_json: string) => boolean;

  export function evaluate_input(input_json: string): string;
  export function get_default_settings(): string;
  export function get_recommended_settings(problem_json: string, desired_runtime_seconds: bigint): string;
  export function greet(): void;
  export function init_panic_hook(): void;
  export function solve(problem_json: string): string;
  export function solve_with_progress(problem_json: string, progress_callback?: WasmProgressCallback | null): string;
  export function test_callback_consistency(problem_json: string): string;
  export function validate_problem(problem_json: string): string;

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
