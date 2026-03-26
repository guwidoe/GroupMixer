import { describe, expect, it, vi } from "vitest";
import { isWasmContractModule, isWasmSolverModule } from "./module";

describe("wasm module guards", () => {
  it("accepts a module with the full contract-native runtime and discovery surface", () => {
    const module = {
      capabilities: vi.fn(),
      get_operation_help: vi.fn(),
      list_schemas: vi.fn(),
      get_schema: vi.fn(),
      list_public_errors: vi.fn(),
      get_public_error: vi.fn(),
      solve: vi.fn(),
      solve_with_progress: vi.fn(),
      validate_scenario: vi.fn(),
      get_default_solver_configuration: vi.fn(),
      recommend_settings: vi.fn(),
      evaluate_input: vi.fn(),
      inspect_result: vi.fn(),
      solve_legacy_json: vi.fn(),
      solve_with_progress_legacy_json: vi.fn(),
      validate_scenario_legacy_json: vi.fn(),
      get_default_settings_legacy_json: vi.fn(),
      get_recommended_settings_legacy_json: vi.fn(),
      init_panic_hook: vi.fn(),
      default: vi.fn(),
    };

    expect(isWasmSolverModule(module)).toBe(true);
    expect(isWasmContractModule(module)).toBe(true);
  });

  it("rejects modules missing required exports", () => {
    expect(
      isWasmSolverModule({
        solve: vi.fn(),
        solve_with_progress: vi.fn(),
        validate_scenario: vi.fn(),
        get_default_settings: vi.fn(),
        default: vi.fn(),
      }),
    ).toBe(false);

    expect(isWasmSolverModule(null)).toBe(false);
    expect(isWasmSolverModule("not-an-object")).toBe(false);
    expect(isWasmContractModule(null)).toBe(false);
    expect(isWasmContractModule("not-an-object")).toBe(false);
  });

  it("rejects modules missing the discovery exports needed for external agents", () => {
    expect(
      isWasmContractModule({
        solve: vi.fn(),
        solve_with_progress: vi.fn(),
        validate_scenario: vi.fn(),
        get_default_solver_configuration: vi.fn(),
        recommend_settings: vi.fn(),
        evaluate_input: vi.fn(),
        inspect_result: vi.fn(),
        default: vi.fn(),
      }),
    ).toBe(false);
  });
});
