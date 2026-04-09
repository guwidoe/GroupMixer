import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleScenario, createSampleSolution } from "../../../test/fixtures";
import { setRuntimeForTests, type SolverRuntime } from "../../../services/runtime";
import { useManualEditorEvaluation } from "./useManualEditorEvaluation";

function createRuntimeMock(overrides: Partial<SolverRuntime> = {}): SolverRuntime {
  return {
    initialize: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async () => ({
      runtimeId: 'test',
      executionModel: 'local-browser',
      lifecycle: 'local-active-solve',
      supportsStreamingProgress: true,
      supportsWarmStart: true,
      supportsCancellation: true,
      supportsEvaluation: true,
      supportsRecommendedSettings: true,
      supportsActiveSolveInspection: true,
      progressTransport: 'shared-mailbox',
      progressMailbox: {
        transport: 'shared-mailbox',
        supported: true,
        requiresCrossOriginIsolation: true,
        crossOriginIsolated: true,
        sharedArrayBufferAvailable: true,
      },
    })),
    listSolvers: vi.fn(async () => ({ solvers: [] })),
    getSolverDescriptor: vi.fn(async () => ({
      kind: 'solver1',
      canonical_id: 'solver1',
      display_name: 'Solver 1',
      accepted_config_ids: ['solver1', 'SimulatedAnnealing'],
      capabilities: {
        supports_initial_schedule: true,
        supports_progress_callback: true,
        supports_benchmark_observer: true,
        supports_recommended_settings: true,
        supports_deterministic_seed: true,
      },
      notes: 'solver1 notes',
    })),
    getDefaultSolverSettings: vi.fn(async () => createSampleScenario().settings),
    validateScenario: vi.fn(async () => ({ valid: true, issues: [] })),
    recommendSettings: vi.fn(async () => createSampleScenario().settings),
    solveWithProgress: vi.fn(async () => ({
      selectedSettings: createSampleScenario().settings,
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    solveWarmStart: vi.fn(async () => ({
      selectedSettings: createSampleScenario().settings,
      runScenario: createSampleScenario(),
      solution: createSampleSolution(),
      lastProgress: null,
    })),
    evaluateSolution: vi.fn(async () => createSampleSolution()),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("useManualEditorEvaluation", () => {
  let runtime: SolverRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    runtime = createRuntimeMock();
    setRuntimeForTests(runtime);
  });

  afterEach(() => {
    vi.useRealTimers();
    setRuntimeForTests(null);
  });

  it("evaluates the current draft assignments after the debounce window", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    const evaluated = createSampleSolution({ final_score: 9, unique_contacts: 5 });
    runtime = createRuntimeMock({
      evaluateSolution: vi.fn(async () => evaluated),
    });
    setRuntimeForTests(runtime);

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

    expect(runtime.evaluateSolution).toHaveBeenCalledWith({
      scenario,
      assignments: solution.assignments,
    });
    expect(result.current.evalError).toBeNull();
    expect(result.current.evalLoading).toBe(false);
  });

  it("computes preview deltas from evaluated state and caches repeated requests", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution({ final_score: 12, unique_contacts: 4, constraint_penalty: 1 });
    runtime = createRuntimeMock({
      evaluateSolution: vi.fn()
        .mockResolvedValueOnce(createSampleSolution({ final_score: 10, unique_contacts: 5, constraint_penalty: 2 }))
        .mockResolvedValueOnce(createSampleSolution({ final_score: 8, unique_contacts: 6, constraint_penalty: 1 })),
    });
    setRuntimeForTests(runtime);

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
    expect(runtime.evaluateSolution).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.computePreview("p1", "g2", 0);
    });

    expect(runtime.evaluateSolution).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.clearPreview();
    });
    expect(result.current.previewDelta).toBeNull();
  });

  it("surfaces evaluation failures without crashing and clears preview on preview-eval failure", async () => {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    runtime = createRuntimeMock({
      evaluateSolution: vi.fn()
        .mockRejectedValueOnce(new Error("evaluation failed"))
        .mockResolvedValueOnce(createSampleSolution({ final_score: 11, unique_contacts: 5 }))
        .mockRejectedValueOnce(new Error("preview failed")),
    });
    setRuntimeForTests(runtime);

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
