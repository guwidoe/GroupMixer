export type WasmProgressJsonCallback = (progressJson: string) => boolean;

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
  solve_with_progress: (
    problemJson: string,
    progressCallback?: WasmProgressJsonCallback | null,
  ) => string;
  validate_problem: (problemJson: string) => string;
  get_default_settings: () => string;
  get_recommended_settings: (
    problemJson: string,
    desiredRuntimeSeconds: bigint,
  ) => string;
  evaluate_input?: (inputJson: string) => string;
  init_panic_hook?: () => void;
  default: (moduleOrPath?: WasmInitInput | Promise<WasmInitInput>) => Promise<WasmInitOutput>;
}

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
