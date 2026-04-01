import type {
  WasmContractModule,
  WasmInitInput,
  WasmInitOutput,
  WasmSyncInitInput,
} from '../services/wasm/module';

declare module 'virtual:wasm-solver' {
  export const capabilities: WasmContractModule['capabilities'];
  export const get_operation_help: WasmContractModule['get_operation_help'];
  export const list_schemas: WasmContractModule['list_schemas'];
  export const get_schema: WasmContractModule['get_schema'];
  export const list_public_errors: WasmContractModule['list_public_errors'];
  export const get_public_error: WasmContractModule['get_public_error'];
  export const get_default_solver_configuration: WasmContractModule['get_default_solver_configuration'];
  export const get_default_settings_legacy_json: NonNullable<WasmContractModule['get_default_settings_legacy_json']>;
  export const greet: NonNullable<WasmContractModule['greet']>;
  export const init_panic_hook: NonNullable<WasmContractModule['init_panic_hook']>;
  export const recommend_settings: WasmContractModule['recommend_settings'];
  export const get_recommended_settings_legacy_json: NonNullable<WasmContractModule['get_recommended_settings_legacy_json']>;
  export const solve: WasmContractModule['solve'];
  export const solve_legacy_json: NonNullable<WasmContractModule['solve_legacy_json']>;
  export const solve_with_progress: WasmContractModule['solve_with_progress'];
  export const solve_with_progress_legacy_json: NonNullable<WasmContractModule['solve_with_progress_legacy_json']>;
  export const validate_scenario: WasmContractModule['validate_scenario'];
  export const validate_scenario_legacy_json: NonNullable<WasmContractModule['validate_scenario_legacy_json']>;
  export const evaluate_input: WasmContractModule['evaluate_input'];
  export const evaluate_input_legacy_json: NonNullable<WasmContractModule['evaluate_input_legacy_json']>;
  export const inspect_result: WasmContractModule['inspect_result'];
  export const test_callback_consistency: NonNullable<WasmContractModule['test_callback_consistency']>;

  export function initSync(module: { module: WasmSyncInitInput } | WasmSyncInitInput): WasmInitOutput;

  export default function init(
    module_or_path?: { module_or_path: WasmInitInput | Promise<WasmInitInput> } | WasmInitInput | Promise<WasmInitInput>,
  ): Promise<WasmInitOutput>;
}
