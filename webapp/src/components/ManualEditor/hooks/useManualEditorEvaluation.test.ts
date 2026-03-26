import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleScenario, createSampleSolution } from "../../../test/fixtures";
import { wasmService } from "../../../services/wasm";
import { useManualEditorEvaluation } from "./useManualEditorEvaluation";

vi.mock("../../../services/wasm", () => ({
  wasmService: {
    evaluateSolution: vi.fn(),
  },
}));

describe("useManualEditorEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evaluates the current draft assignments after the debounce window", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    const evaluated = createSampleSolution({ final_score: 9, unique_contacts: 5 });
    vi.mocked(wasmService.evaluateSolution).mockResolvedValue(evaluated);

    const { result } = renderHook(() =>
      useManualEditorEvaluation({
        effectiveScenario: scenario,
        draftAssignments: solution.assignments,
        solution,
        complianceViolationCount: solution.constraint_penalty,
      }),
    );

    expect(result.current.evalLoading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(result.current.evaluated?.final_score).toBe(9);

    expect(wasmService.evaluateSolution).toHaveBeenCalledWith(scenario, solution.assignments);
    expect(result.current.evalError).toBeNull();
    expect(result.current.evalLoading).toBe(false);
  });

  it("computes preview deltas from evaluated state and caches repeated requests", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution({ final_score: 12, unique_contacts: 4, constraint_penalty: 1 });
    vi.mocked(wasmService.evaluateSolution)
      .mockResolvedValueOnce(createSampleSolution({ final_score: 10, unique_contacts: 5, constraint_penalty: 2 }))
      .mockResolvedValueOnce(createSampleSolution({ final_score: 8, unique_contacts: 6, constraint_penalty: 1 }));

    const { result } = renderHook(() =>
      useManualEditorEvaluation({
        effectiveScenario: scenario,
        draftAssignments: solution.assignments,
        solution,
        complianceViolationCount: solution.constraint_penalty,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(result.current.evaluated?.final_score).toBe(10);

    await act(async () => {
      await result.current.computePreview("p1", "g2", 0);
    });

    expect(result.current.previewDelta).toEqual({
      groupId: "g2",
      sessionId: 0,
      scoreDelta: -2,
      uniqueDelta: 1,
      constraintDelta: -1,
    });
    expect(wasmService.evaluateSolution).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.computePreview("p1", "g2", 0);
    });

    expect(wasmService.evaluateSolution).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.clearPreview();
    });
    expect(result.current.previewDelta).toBeNull();
  });

  it("surfaces evaluation failures without crashing and clears preview on preview-eval failure", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    vi.mocked(wasmService.evaluateSolution)
      .mockRejectedValueOnce(new Error("evaluation failed"))
      .mockResolvedValueOnce(createSampleSolution({ final_score: 11, unique_contacts: 5 }))
      .mockRejectedValueOnce(new Error("preview failed"));

    const { result, rerender } = renderHook(
      ({ assignments }) =>
        useManualEditorEvaluation({
          effectiveScenario: scenario,
          draftAssignments: assignments,
          solution,
          complianceViolationCount: solution.constraint_penalty,
        }),
      {
        initialProps: { assignments: solution.assignments },
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(result.current.evalError).toBe("evaluation failed");

    rerender({ assignments: [...solution.assignments] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(130);
    });

    expect(result.current.evaluated?.final_score).toBe(11);

    await act(async () => {
      await result.current.computePreview("p1", "g2", 0);
    });

    expect(result.current.previewDelta).toBeNull();
  });
});
