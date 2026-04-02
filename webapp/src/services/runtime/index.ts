import { LocalWasmRuntime } from './localWasmRuntime';
import type { SolverRuntime } from './runtime';

let runtimeSingleton: SolverRuntime | null = null;

export function getRuntime(): SolverRuntime {
  runtimeSingleton ??= new LocalWasmRuntime();
  return runtimeSingleton;
}

export function setRuntimeForTests(runtime: SolverRuntime | null): void {
  runtimeSingleton = runtime;
}

export * from './types';
export * from './runtime';
export * from './localWasmRuntime';
