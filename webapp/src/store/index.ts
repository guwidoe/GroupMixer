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
  attributeDefinitions: loadAttributeDefinitions(),
  demoDropdownOpen: false,
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null,
});

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

      initializeApp: () => {
        get().loadSavedProblems();
      },
    }),
    {
      name: "people-distributor-store",
    }
  )
);
