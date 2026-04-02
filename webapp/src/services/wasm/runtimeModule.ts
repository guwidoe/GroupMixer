import {
  WASM_RUNTIME_EXPORT_NAMES,
  type WasmContractModule,
} from "./module";

type RuntimeModule = {
  default?: (...args: unknown[]) => Promise<unknown>;
  [key: string]: unknown;
};

let loadedRuntimeModule: RuntimeModule | null = null;
let runtimeModulePromise: Promise<RuntimeModule> | null = null;

function getRuntimeSpecifier(): string {
  if (import.meta.env?.VITEST) {
    return new URL("../../../public/pkg/gm_wasm.js", import.meta.url).href;
  }

  if (typeof globalThis.location?.href === "string") {
    return new URL("/pkg/gm_wasm.js", globalThis.location.href).href;
  }

  return "/pkg/gm_wasm.js";
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

function bindRuntimeFunction<K extends keyof WasmContractModule>(
  name: K,
): NonNullable<WasmContractModule[K]> {
  return ((...args: unknown[]) =>
    requireRuntimeFunction(WASM_RUNTIME_EXPORT_NAMES[name])(...args)) as NonNullable<
    WasmContractModule[K]
  >;
}

export default async function init(...args: unknown[]): Promise<unknown> {
  const runtimeModule = await loadRuntimeModule();
  const initialize = runtimeModule.default;

  if (typeof initialize !== "function") {
    throw new Error("WASM runtime does not expose the expected async initializer.");
  }

  return initialize(...args);
}

export const initSync =
  ((...args: unknown[]) => requireRuntimeFunction(WASM_RUNTIME_EXPORT_NAMES.initSync)(...args));
export const capabilities = bindRuntimeFunction("capabilities");
export const get_operation_help = bindRuntimeFunction("get_operation_help");
export const list_schemas = bindRuntimeFunction("list_schemas");
export const get_schema = bindRuntimeFunction("get_schema");
export const list_public_errors = bindRuntimeFunction("list_public_errors");
export const get_public_error = bindRuntimeFunction("get_public_error");
export const get_default_solver_configuration = bindRuntimeFunction(
  "get_default_solver_configuration",
);
export const init_panic_hook = bindRuntimeFunction("init_panic_hook");
export const recommend_settings = bindRuntimeFunction("recommend_settings");
export const solve = bindRuntimeFunction("solve");
export const solve_with_progress = bindRuntimeFunction("solve_with_progress");
export const validate_scenario = bindRuntimeFunction("validate_scenario");
export const evaluate_input = bindRuntimeFunction("evaluate_input");
export const inspect_result = bindRuntimeFunction("inspect_result");
