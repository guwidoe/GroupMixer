/**
 * Store-specific types for Zustand slices.
 * Core domain types (Person, Group, Problem, etc.) are in ../types/index.ts
 */

import type {
  Problem,
  Solution,
  SolverState,
  Notification,
  AttributeDefinition,
  SavedProblem,
  SolverSettings,
} from "../types";

// === Slice State Types ===

export interface ProblemState {
  problem: Problem | null;
}

export interface SolutionState {
  solution: Solution | null;
}

export interface SolverSliceState {
  solverState: SolverState;
}

export interface UIState {
  ui: {
    activeTab: "problem" | "solver" | "results" | "manage";
    isLoading: boolean;
    notifications: Notification[];
    showProblemManager: boolean;
    showResultComparison: boolean;
    warmStartResultId?: string | null;
  };
}

export interface ProblemManagerState {
  currentProblemId: string | null;
  savedProblems: Record<string, SavedProblem>;
  selectedResultIds: string[];
}

export interface AttributeState {
  attributeDefinitions: AttributeDefinition[];
}

export interface DemoDataState {
  demoDropdownOpen: boolean;
}

export interface EditorState {
  manualEditorUnsaved: boolean;
  manualEditorLeaveHook: ((nextPath: string) => void) | null;
}

// === Slice Action Types ===

export interface ProblemActions {
  setProblem: (problem: Problem) => void;
  updateProblem: (updates: Partial<Problem>) => void;
  updateCurrentProblem: (problemId: string, problem: Problem) => void;
  GetProblem: () => Problem;
  ensureProblemExists: () => Problem;
}

export interface SolutionActions {
  setSolution: (solution: Solution | null) => void;
  clearSolution: () => void;
}

export interface SolverActions {
  setSolverState: (state: Partial<SolverState>) => void;
  startSolver: () => void;
  stopSolver: () => void;
  resetSolver: () => void;
  setWarmStartFromResult: (resultId: string | null) => void;
}

export interface UIActions {
  setActiveTab: (tab: "problem" | "solver" | "results" | "manage") => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setShowProblemManager: (show: boolean) => void;
  setShowResultComparison: (show: boolean) => void;
}

export interface ProblemManagerActions {
  loadSavedProblems: () => void;
  createNewProblem: (name: string, isTemplate?: boolean) => void;
  loadProblem: (id: string) => void;
  saveProblem: (name: string) => void;
  deleteProblem: (id: string) => void;
  duplicateProblem: (
    id: string,
    newName: string,
    includeResults?: boolean
  ) => void;
  renameProblem: (id: string, newName: string) => void;
  toggleTemplate: (id: string) => void;
  restoreResultAsNewProblem: (resultId: string, newName?: string) => void;
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotProblemOverride?: Problem
  ) => void;
  updateResultName: (resultId: string, newName: string) => void;
  deleteResult: (resultId: string) => void;
  selectResultsForComparison: (resultIds: string[]) => void;
  exportProblem: (id: string) => void;
  importProblem: (file: File) => void;
}

export interface AttributeActions {
  setAttributeDefinitions: (definitions: AttributeDefinition[]) => void;
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
}

export interface DemoDataActions {
  generateDemoData: () => Promise<void>;
  loadDemoCase: (demoCaseId: string) => Promise<void>;
  loadDemoCaseOverwrite: (demoCaseId: string) => Promise<void>;
  loadDemoCaseNewProblem: (demoCaseId: string) => Promise<void>;
  setDemoDropdownOpen: (open: boolean) => void;
}

export interface EditorActions {
  setManualEditorUnsaved: (unsaved: boolean) => void;
  setManualEditorLeaveHook: (hook: ((nextPath: string) => void) | null) => void;
}

export interface UtilityActions {
  reset: () => void;
  initializeApp: () => void;
}

// === Combined Store Type ===

export interface AppStore
  extends ProblemState,
    SolutionState,
    SolverSliceState,
    UIState,
    ProblemManagerState,
    AttributeState,
    DemoDataState,
    EditorState,
    ProblemActions,
    SolutionActions,
    SolverActions,
    UIActions,
    ProblemManagerActions,
    AttributeActions,
    DemoDataActions,
    EditorActions,
    UtilityActions {}

// Type for slice creators
export type StoreSlice<T> = (
  set: (
    partial:
      | Partial<AppStore>
      | ((state: AppStore) => Partial<AppStore>),
    replace?: boolean
  ) => void,
  get: () => AppStore
) => T;
