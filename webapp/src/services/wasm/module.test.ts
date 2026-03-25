import { describe, expect, it, vi } from "vitest";
import { isWasmSolverModule } from "./module";

describe("isWasmSolverModule", () => {
  it("accepts a module with the required runtime surface", () => {
    const module = {
      solve: vi.fn(),
      solve_with_progress: vi.fn(),
      validate_problem: vi.fn(),
      get_default_settings: vi.fn(),
      get_recommended_settings: vi.fn(),
      evaluate_input: vi.fn(),
      init_panic_hook: vi.fn(),
      default: vi.fn(),
    };

    expect(isWasmSolverModule(module)).toBe(true);
  });

  it("rejects modules missing required exports", () => {
    expect(
      isWasmSolverModule({
        solve: vi.fn(),
        solve_with_progress: vi.fn(),
        validate_problem: vi.fn(),
        get_default_settings: vi.fn(),
        default: vi.fn(),
      }),
    ).toBe(false);

    expect(isWasmSolverModule(null)).toBe(false);
    expect(isWasmSolverModule("not-an-object")).toBe(false);
  });
});
