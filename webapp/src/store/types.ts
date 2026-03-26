/**
 * Store-specific types for Zustand slices.
 * Core domain types (Person, Group, Scenario, etc.) are in ../types/index.ts
 */

import type {
  Scenario,
  ScenarioResult,
  Solution,
  SolverState,
  Notification,
  AttributeDefinition,
  SavedScenario,
  SolverSettings,
} from "../types";

// === Slice State Types ===

export interface ScenarioState {
  scenario: Scenario | null;
}

export interface SolutionState {
  solution: Solution | null;
}

export interface SolverSliceState {
  solverState: SolverState;
}

export interface UIState {
  ui: {
    activeTab: "scenario" | "solver" | "results" | "manage";
    isLoading: boolean;
    notifications: Notification[];
    showScenarioManager: boolean;
    showResultComparison: boolean;
    warmStartResultId: string | null;
  };
}

export interface ScenarioManagerState {
  currentScenarioId: string | null;
  savedScenarios: Record<string, SavedScenario>;
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

export interface ScenarioActions {
  setScenario: (scenario: Scenario) => void;
  updateScenario: (updates: Partial<Scenario>) => void;
  updateCurrentScenario: (scenarioId: string, scenario: Scenario) => void;
  resolveScenario: () => Scenario;
  ensureScenarioExists: () => Scenario;
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
  setActiveTab: (tab: "scenario" | "solver" | "results" | "manage") => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  setShowScenarioManager: (show: boolean) => void;
  setShowResultComparison: (show: boolean) => void;
}

export interface ScenarioManagerActions {
  loadSavedScenarios: () => void;
  createNewScenario: (name: string, isTemplate?: boolean) => void;
  loadScenario: (id: string) => void;
  saveScenario: (name: string) => void;
  deleteScenario: (id: string) => void;
  duplicateScenario: (
    id: string,
    newName: string,
    includeResults?: boolean
  ) => void;
  renameScenario: (id: string, newName: string) => void;
  toggleTemplate: (id: string) => void;
  restoreResultAsNewScenario: (resultId: string, newName?: string) => void;
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotScenarioOverride?: Scenario
  ) => ScenarioResult | null;
  updateResultName: (resultId: string, newName: string) => void;
  deleteResult: (resultId: string) => void;
  selectResultsForComparison: (resultIds: string[]) => void;
  exportScenario: (id: string) => void;
  importScenario: (file: File) => void;
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
  loadDemoCaseNewScenario: (demoCaseId: string) => Promise<void>;
  setDemoDropdownOpen: (open: boolean) => void;
}

export interface EditorActions {
  setManualEditorUnsaved: (unsaved: boolean) => void;
  setManualEditorLeaveHook: (hook: ((nextPath: string) => void) | null) => void;
}

export interface WorkspaceBridgeInput {
  scenario: Scenario;
  solution?: Solution | null;
  attributeDefinitions?: AttributeDefinition[];
  currentScenarioId?: string | null;
}

export interface WorkspaceDraftSyncInput extends WorkspaceBridgeInput {
  scenarioName: string;
}

export interface WorkspaceActions {
  replaceWorkspace: (input: WorkspaceBridgeInput) => void;
  syncWorkspaceDraft: (input: WorkspaceDraftSyncInput) => string;
}

export interface UtilityActions {
  reset: () => void;
  initializeApp: () => void;
}

// === Combined Store Type ===

export interface AppStore
  extends ScenarioState,
    SolutionState,
    SolverSliceState,
    UIState,
    ScenarioManagerState,
    AttributeState,
    DemoDataState,
    EditorState,
    ScenarioActions,
    SolutionActions,
    SolverActions,
    UIActions,
    ScenarioManagerActions,
    AttributeActions,
    DemoDataActions,
    EditorActions,
    WorkspaceActions,
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
