/**
 * Main application store using Zustand slices pattern.
 *
 * The store is composed of multiple slices, each managing a specific domain:
 * - problemSlice: Current problem state and CRUD operations
 * - solutionSlice: Current solution state
 * - solverSlice: Solver execution state and progress
 * - uiSlice: UI state, notifications, modal visibility
 * - problemManagerSlice: Problem persistence, results management
 * - attributeSlice: Attribute definitions for person attributes
 * - demoDataSlice: Demo data loading functionality
 * - editorSlice: Manual editor state
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AppStore } from "./types";
import type { AttributeDefinition, Problem, Solution } from "../types";
import { mergeAttributeDefinitions } from "../services/demoDataService";
import { problemStorage } from "../services/problemStorage";

import {
  createProblemSlice,
  createSolutionSlice,
  createSolverSlice,
  createUISlice,
  createAttributeSlice,
  createProblemManagerSlice,
  createDemoDataSlice,
  createEditorSlice,
  initialSolverState,
  initialUIState,
  DEFAULT_ATTRIBUTE_DEFINITIONS,
  loadAttributeDefinitions,
} from "./slices";

// Re-export types for easier access
export type {
  AppState,
  Problem,
  Solution,
  SolverState,
  Notification,
  Person,
  Group,
  AttributeDefinition,
} from "../types";

// Re-export store types
export type { AppStore } from "./types";

// Initial state for reset functionality
const getInitialState = () => ({
  problem: null,
  solution: null,
  solverState: initialSolverState,
  currentProblemId: null,
  savedProblems: {},
  selectedResultIds: [],
  ui: initialUIState,
  attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,
  demoDropdownOpen: false,
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null,
});

function solverStateFromWorkspaceSolution(solution: Solution | null) {
  if (!solution) {
    return initialSolverState;
  }

  return {
    ...initialSolverState,
    isRunning: false,
    isComplete: true,
    currentIteration: solution.iteration_count,
    bestScore: solution.final_score,
    currentScore: solution.final_score,
    elapsedTime: solution.elapsed_time_ms,
    noImprovementCount: solution.benchmark_telemetry?.no_improvement_count ?? 0,
  };
}

function mergeWorkspaceAttributes(existing: AttributeDefinition[], incoming?: AttributeDefinition[]) {
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  return mergeAttributeDefinitions(existing, incoming);
}

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // Combine all slices
      ...createProblemSlice(set, get),
      ...createSolutionSlice(set, get),
      ...createSolverSlice(set, get),
      ...createUISlice(set, get),
      ...createAttributeSlice(set, get),
      ...createProblemManagerSlice(set, get),
      ...createDemoDataSlice(set, get),
      ...createEditorSlice(set, get),

      // Utility actions
      reset: () => set(getInitialState()),

      replaceWorkspace: ({
        problem,
        solution = null,
        attributeDefinitions,
        currentProblemId = null,
      }: {
        problem: Problem;
        solution?: Solution | null;
        attributeDefinitions?: AttributeDefinition[];
        currentProblemId?: string | null;
      }) =>
        set((state) => ({
          problem,
          solution,
          currentProblemId,
          selectedResultIds: [],
          solverState: solverStateFromWorkspaceSolution(solution),
          attributeDefinitions: mergeWorkspaceAttributes(state.attributeDefinitions, attributeDefinitions),
          ui: {
            ...state.ui,
            activeTab: solution ? "results" : "problem",
            warmStartResultId: null,
            showResultComparison: false,
            showProblemManager: false,
            isLoading: false,
          },
          manualEditorUnsaved: false,
          manualEditorLeaveHook: null,
        })),

      syncWorkspaceDraft: ({
        problem,
        solution = null,
        attributeDefinitions,
        currentProblemId = null,
        problemName,
      }) => {
        let savedProblem = currentProblemId ? problemStorage.getProblem(currentProblemId) : null;

        if (savedProblem) {
          savedProblem = {
            ...savedProblem,
            problem,
          };
          problemStorage.saveProblem(savedProblem);
        } else {
          savedProblem = problemStorage.createProblem(problemName, problem);
          currentProblemId = savedProblem.id;
        }

        problemStorage.setCurrentProblemId(savedProblem.id);

        set((state) => ({
          problem,
          solution,
          currentProblemId: savedProblem.id,
          savedProblems: {
            ...state.savedProblems,
            [savedProblem.id]: savedProblem,
          },
          selectedResultIds: [],
          solverState: solverStateFromWorkspaceSolution(solution),
          attributeDefinitions: mergeWorkspaceAttributes(state.attributeDefinitions, attributeDefinitions),
          ui: {
            ...state.ui,
            activeTab: solution ? "results" : "problem",
            warmStartResultId: null,
            showResultComparison: false,
            showProblemManager: false,
            isLoading: false,
          },
          manualEditorUnsaved: false,
          manualEditorLeaveHook: null,
        }));

        return savedProblem.id;
      },

      initializeApp: () => {
        set({ attributeDefinitions: loadAttributeDefinitions() });
        get().loadSavedProblems();
      },
    }),
    {
      name: "people-distributor-store",
    }
  )
);
