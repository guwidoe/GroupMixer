/* tslint:disable */
export const memory: WebAssembly.Memory;
export const evaluate_input: (a: number, b: number) => [number, number, number, number];
export const get_default_settings: () => [number, number, number, number];
export const get_recommended_settings: (a: number, b: number, c: bigint) => [number, number, number, number];
export const solve: (a: number, b: number) => [number, number, number, number];
export const solve_with_progress: (a: number, b: number, c: number) => [number, number, number, number];
export const test_callback_consistency: (a: number, b: number) => [number, number, number, number];
export const validate_problem: (a: number, b: number) => [number, number, number, number];
export const init_panic_hook: () => void;
export const greet: () => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
