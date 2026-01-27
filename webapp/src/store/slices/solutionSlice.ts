/**
 * Solution slice - manages the current solution state.
 */

import type { Solution } from "../../types";
import type { SolutionState, SolutionActions, StoreSlice } from "../types";

export const createSolutionSlice: StoreSlice<SolutionState & SolutionActions> = (
  set
) => ({
  solution: null,

  setSolution: (solution: Solution | null) => set({ solution }),

  clearSolution: () => set({ solution: null }),
});
