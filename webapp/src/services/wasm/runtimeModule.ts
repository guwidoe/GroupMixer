type RuntimeModule = {
  default?: (...args: unknown[]) => Promise<unknown>;
  [key: string]: unknown;
};

let loadedRuntimeModule: RuntimeModule | null = null;
let runtimeModulePromise: Promise<RuntimeModule> | null = null;

function getRuntimeSpecifier(): string {
  if (import.meta.env?.VITEST) {
    return new URL("../../../public/pkg/solver_wasm.js", import.meta.url).href;
  }

  if (typeof globalThis.location?.href === "string") {
    return new URL("/pkg/solver_wasm.js", globalThis.location.href).href;
  }

  return "/pkg/solver_wasm.js";
}

async function loadRuntimeModule(): Promise<RuntimeModule> {
  if (loadedRuntimeModule) {
    return loadedRuntimeModule;
  }

  if (!runtimeModulePromise) {
    runtimeModulePromise = import(/* @vite-ignore */ getRuntimeSpecifier()).then((module) => {
      loadedRuntimeModule = module as RuntimeModule;
      return loadedRuntimeModule;
    });
  }

  return runtimeModulePromise;
}

function requireRuntimeFunction(name: string): (...args: unknown[]) => unknown {
  if (!loadedRuntimeModule) {
    throw new Error(`WASM runtime function "${name}" is unavailable before initialization.`);
  }

  const candidate = loadedRuntimeModule[name];
  if (typeof candidate !== "function") {
    throw new Error(`WASM runtime does not expose "${name}".`);
  }

  return candidate as (...args: unknown[]) => unknown;
}

export default async function init(...args: unknown[]): Promise<unknown> {
  const runtimeModule = await loadRuntimeModule();
  const initialize = runtimeModule.default;

  if (typeof initialize !== "function") {
    throw new Error("WASM runtime does not expose the expected async initializer.");
  }

  return initialize(...args);
}

export function initSync(...args: unknown[]): unknown {
  return requireRuntimeFunction("initSync")(...args);
}

export function capabilities(...args: unknown[]): unknown {
  return requireRuntimeFunction("capabilities")(...args);
}

export function get_operation_help(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_operation_help")(...args);
}

export function list_schemas(...args: unknown[]): unknown {
  return requireRuntimeFunction("list_schemas")(...args);
}

export function get_schema(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_schema")(...args);
}

export function list_public_errors(...args: unknown[]): unknown {
  return requireRuntimeFunction("list_public_errors")(...args);
}

export function get_public_error(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_public_error")(...args);
}

export function get_default_solver_configuration(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_default_solver_configuration")(...args);
}

export function get_default_settings_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_default_settings_legacy_json")(...args);
}

export function greet(...args: unknown[]): unknown {
  return requireRuntimeFunction("greet")(...args);
}

export function init_panic_hook(...args: unknown[]): unknown {
  return requireRuntimeFunction("init_panic_hook")(...args);
}

export function recommend_settings(...args: unknown[]): unknown {
  return requireRuntimeFunction("recommend_settings")(...args);
}

export function get_recommended_settings_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("get_recommended_settings_legacy_json")(...args);
}

export function solve(...args: unknown[]): unknown {
  return requireRuntimeFunction("solve")(...args);
}

export function solve_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("solve_legacy_json")(...args);
}

export function solve_with_progress(...args: unknown[]): unknown {
  return requireRuntimeFunction("solve_with_progress")(...args);
}

export function solve_with_progress_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("solve_with_progress_legacy_json")(...args);
}

export function validate_scenario(...args: unknown[]): unknown {
  return requireRuntimeFunction("validate_problem")(...args);
}

export function validate_scenario_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("validate_problem_legacy_json")(...args);
}

export function evaluate_input(...args: unknown[]): unknown {
  return requireRuntimeFunction("evaluate_input")(...args);
}

export function evaluate_input_legacy_json(...args: unknown[]): unknown {
  return requireRuntimeFunction("evaluate_input_legacy_json")(...args);
}

export function inspect_result(...args: unknown[]): unknown {
  return requireRuntimeFunction("inspect_result")(...args);
}

export function test_callback_consistency(...args: unknown[]): unknown {
  return requireRuntimeFunction("test_callback_consistency")(...args);
}
