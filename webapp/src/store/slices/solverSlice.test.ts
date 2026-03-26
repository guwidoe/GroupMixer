import { describe, expect, it } from "vitest";
import { createSolverSlice, initialSolverState } from "./solverSlice";
import type { AppStore } from "../types";

function createHarness(overrides: Partial<AppStore> = {}) {
  let state = {
    solverState: {
      ...initialSolverState,
      bestScore: 5,
      currentIteration: 10,
      error: "oops",
    },
    ui: {
      activeTab: "problem",
      isLoading: false,
      notifications: [],
      showProblemManager: false,
      showResultComparison: false,
      warmStartResultId: null,
    },
    ...overrides,
  } as unknown as AppStore;

  const set = (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get = () => state;

  return {
    slice: createSolverSlice(set, get),
    getState: () => state,
  };
}

describe("createSolverSlice", () => {
  it("merges partial solver state updates", () => {
    const harness = createHarness();
    harness.slice.setSolverState({ bestScore: 99, isComplete: true });

    expect(harness.getState().solverState.bestScore).toBe(99);
    expect(harness.getState().solverState.isComplete).toBe(true);
    expect(harness.getState().solverState.currentIteration).toBe(10);
  });

  it("starts, stops, and resets solver execution state", () => {
    const harness = createHarness();

    harness.slice.startSolver();
    expect(harness.getState().solverState).toMatchObject({
      isRunning: true,
      isComplete: false,
      currentIteration: 0,
      elapsedTime: 0,
      noImprovementCount: 0,
      error: undefined,
    });

    harness.slice.stopSolver();
    expect(harness.getState().solverState.isRunning).toBe(false);

    harness.slice.resetSolver();
    expect(harness.getState().solverState).toEqual({
      ...initialSolverState,
      error: undefined,
    });
  });

  it("stores warm-start selections on the ui slice", () => {
    const harness = createHarness();
    harness.slice.setWarmStartFromResult("result-123");

    expect(harness.getState().ui.warmStartResultId).toBe("result-123");

    harness.slice.setWarmStartFromResult(null);

    expect(harness.getState().ui.warmStartResultId).toBeNull();
  });
});
