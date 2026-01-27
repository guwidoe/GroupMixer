/**
 * Solver slice - manages solver execution state and progress.
 */

import type { SolverState } from "../../types";
import type { SolverSliceState, SolverActions, StoreSlice } from "../types";

export const initialSolverState: SolverState = {
  isRunning: false,
  isComplete: false,
  currentIteration: 0,
  bestScore: 0,
  elapsedTime: 0,
  noImprovementCount: 0,
};

export const createSolverSlice: StoreSlice<SolverSliceState & SolverActions> = (
  set,
  get
) => ({
  solverState: initialSolverState,

  setSolverState: (state) => {
    const currentState = get().solverState;
    set({ solverState: { ...currentState, ...state } });
  },

  startSolver: () =>
    set((state) => ({
      solverState: {
        ...state.solverState,
        isRunning: true,
        isComplete: false,
        currentIteration: 0,
        elapsedTime: 0,
        noImprovementCount: 0,
        error: undefined,
      },
    })),

  stopSolver: () =>
    set((state) => ({
      solverState: {
        ...state.solverState,
        isRunning: false,
      },
    })),

  resetSolver: () =>
    set((state) => ({
      solverState: {
        ...state.solverState,
        isRunning: false,
        isComplete: false,
        currentIteration: 0,
        bestScore: 0,
        elapsedTime: 0,
        noImprovementCount: 0,
        error: undefined,
      },
    })),

  setWarmStartFromResult: (resultId) =>
    set((state) => ({
      ui: { ...state.ui, warmStartResultId: resultId as unknown as never },
    })),
});
