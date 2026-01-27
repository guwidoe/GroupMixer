/**
 * Problem slice - manages the current problem state and CRUD operations.
 */

import type { Problem } from "../../types";
import type { ProblemState, ProblemActions, StoreSlice } from "../types";
import { problemStorage } from "../../services/problemStorage";

const DEFAULT_SETTINGS = {
  solver_type: "SimulatedAnnealing",
  stop_conditions: {
    max_iterations: 10000,
    time_limit_seconds: 30,
    no_improvement_iterations: 5000,
  },
  solver_params: {
    SimulatedAnnealing: {
      initial_temperature: 1.0,
      final_temperature: 0.01,
      cooling_schedule: "geometric",
      reheat_cycles: 0,
      reheat_after_no_improvement: 0,
    },
  },
};

function createEmptyProblem(): Problem {
  return {
    people: [],
    groups: [],
    num_sessions: 3,
    constraints: [],
    settings: DEFAULT_SETTINGS,
  };
}

export const createProblemSlice: StoreSlice<ProblemState & ProblemActions> = (
  set,
  get
) => ({
  problem: null,

  setProblem: (problem) => set({ problem }),

  updateProblem: (updates) => {
    const currentProblem = get().problem;
    if (currentProblem) {
      set({ problem: { ...currentProblem, ...updates } });
    }
  },

  updateCurrentProblem: (problemId, problem) => {
    try {
      problemStorage.updateProblem(problemId, problem);
      set({ problem });
    } catch (error) {
      console.error("Failed to update problem:", error);
    }
  },

  GetProblem: () => {
    const currentProblem = get().problem;
    if (currentProblem) {
      return currentProblem;
    }

    // Check if we have a current problem ID that should be loaded
    const { currentProblemId, savedProblems } = get();
    if (currentProblemId && savedProblems[currentProblemId]) {
      const savedProblem = savedProblems[currentProblemId];
      set({ problem: savedProblem.problem });
      return savedProblem.problem;
    }

    // Check if there are any saved problems we can load
    const allProblems = Object.values(savedProblems);
    if (allProblems.length > 0) {
      const firstProblem = allProblems[0];
      problemStorage.setCurrentProblemId(firstProblem.id);
      set({
        problem: firstProblem.problem,
        currentProblemId: firstProblem.id,
      });
      return firstProblem.problem;
    }

    // Only create a new problem if there are truly no problems available
    // and we're not in a loading state
    const { ui } = get();
    if (ui.isLoading) {
      // Still loading, return a minimal problem temporarily
      const tempProblem: Problem = {
        people: [],
        groups: [],
        num_sessions: 3,
        constraints: [],
        settings: DEFAULT_SETTINGS,
      };
      return tempProblem;
    }

    const emptyProblem = createEmptyProblem();
    set({ problem: emptyProblem });
    return emptyProblem;
  },

  ensureProblemExists: () => {
    const currentProblem = get().problem;
    if (currentProblem) {
      return currentProblem;
    }

    // Check if we have a current problem ID that should be loaded
    const { currentProblemId, savedProblems } = get();
    if (currentProblemId && savedProblems[currentProblemId]) {
      const savedProblem = savedProblems[currentProblemId];
      set({ problem: savedProblem.problem });
      return savedProblem.problem;
    }

    // Check if there are any saved problems we can load
    const allProblems = Object.values(savedProblems);
    if (allProblems.length > 0) {
      const firstProblem = allProblems[0];
      problemStorage.setCurrentProblemId(firstProblem.id);
      set({
        problem: firstProblem.problem,
        currentProblemId: firstProblem.id,
      });
      return firstProblem.problem;
    }

    // Create a new problem if none exists
    const emptyProblem = createEmptyProblem();

    // Create and save the new problem
    const savedProblem = problemStorage.createProblem(
      "Untitled Problem",
      emptyProblem
    );

    // Update the store state
    set({
      problem: emptyProblem,
      currentProblemId: savedProblem.id,
      savedProblems: {
        ...get().savedProblems,
        [savedProblem.id]: savedProblem,
      },
    });

    // Notify user that a new problem was created
    get().addNotification({
      type: "info",
      title: "New Problem Created",
      message: "A new problem has been created and saved.",
    });

    return emptyProblem;
  },
});
