import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  AppState,
  Problem,
  Solution,
  SolverState,
  Notification,
  Person,
  Group,
  AttributeDefinition,
  SolverSettings,
} from "../types";
import { problemStorage } from "../services/problemStorage";

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

// === Attribute Definition Persistence ===
const ATTRIBUTE_DEFS_KEY = "people-distributor-attribute-definitions";

const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  { key: "gender", values: ["male", "female"] },
  {
    key: "department",
    values: ["engineering", "marketing", "sales", "hr", "finance"],
  },
  { key: "seniority", values: ["junior", "mid", "senior", "lead"] },
  { key: "location", values: ["office", "remote", "hybrid"] },
];

function loadAttributeDefinitions(): AttributeDefinition[] {
  try {
    const stored = localStorage.getItem(ATTRIBUTE_DEFS_KEY);
    if (stored) {
      return JSON.parse(stored) as AttributeDefinition[];
    }
  } catch (error) {
    console.error("Failed to load attribute definitions from storage:", error);
  }
  return DEFAULT_ATTRIBUTE_DEFINITIONS;
}

interface AppStore extends AppState {
  // Problem management
  setProblem: (problem: Problem) => void;
  updateProblem: (updates: Partial<Problem>) => void;
  updateCurrentProblem: (problemId: string, problem: Problem) => void;
  GetProblem: () => Problem;
  ensureProblemExists: () => Problem;

  // Solution management
  setSolution: (solution: Solution | null) => void;
  clearSolution: () => void;

  // Solver state management
  setSolverState: (state: Partial<SolverState>) => void;
  startSolver: () => void;
  stopSolver: () => void;
  resetSolver: () => void;

  // UI management
  setActiveTab: (tab: "problem" | "solver" | "results" | "manage") => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Problem Management actions
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
  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string
  ) => void;
  updateResultName: (resultId: string, newName: string) => void;
  deleteResult: (resultId: string) => void;
  selectResultsForComparison: (resultIds: string[]) => void;
  exportProblem: (id: string) => void;
  importProblem: (file: File) => void;

  // UI state for problem management
  setShowProblemManager: (show: boolean) => void;
  setShowResultComparison: (show: boolean) => void;

  // Utility actions
  reset: () => void;
  generateDemoData: () => Promise<void>;
  loadDemoCase: (demoCaseId: string) => Promise<void>;
  loadDemoCaseOverwrite: (demoCaseId: string) => Promise<void>;
  loadDemoCaseNewProblem: (demoCaseId: string) => Promise<void>;
  initializeApp: () => void;

  // Demo data dropdown state
  demoDropdownOpen: boolean;
  setDemoDropdownOpen: (open: boolean) => void;

  // New actions for attribute management
  attributeDefinitions: AttributeDefinition[];
  setAttributeDefinitions: (definitions: AttributeDefinition[]) => void;
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;

  // Manual Editor unsaved/leave handling
  manualEditorUnsaved: boolean;
  setManualEditorUnsaved: (unsaved: boolean) => void;
  manualEditorLeaveHook: ((nextPath: string) => void) | null;
  setManualEditorLeaveHook: (hook: ((nextPath: string) => void) | null) => void;
}

const initialState: AppState = {
  problem: null,
  solution: null,
  solverState: {
    isRunning: false,
    isComplete: false,
    currentIteration: 0,
    bestScore: 0,
    elapsedTime: 0,
    noImprovementCount: 0,
  },
  currentProblemId: null,
  savedProblems: {},
  selectedResultIds: [],
  ui: {
    activeTab: "problem",
    isLoading: true, // Start with loading true
    notifications: [],
    showProblemManager: false,
    showResultComparison: false,
  },
  attributeDefinitions: loadAttributeDefinitions(),
  demoDropdownOpen: false,
};

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      manualEditorUnsaved: false,
      manualEditorLeaveHook: null,

      // Problem management
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
            settings: {
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
            },
          };
          return tempProblem;
        }

        const defaultSettings = {
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
        } as SolverSettings;

        const emptyProblem: Problem = {
          people: [],
          groups: [],
          num_sessions: 3,
          constraints: [],
          settings: defaultSettings,
        };

        // Create and save the new problem
        const newSaved = problemStorage.createProblem(
          "Untitled Problem",
          emptyProblem
        );
        problemStorage.setCurrentProblemId(newSaved.id);

        // Update the store state
        set((state) => ({
          problem: emptyProblem,
          currentProblemId: newSaved.id,
          savedProblems: {
            ...state.savedProblems,
            [newSaved.id]: newSaved,
          },
        }));

        return emptyProblem;
      },

      ensureProblemExists: () => {
        console.log("[Store] ensureProblemExists called");
        const currentProblem = get().problem;
        console.log("[Store] current problem:", currentProblem);
        if (currentProblem) {
          console.log("[Store] returning existing problem");
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

        console.log("[Store] No problem exists, creating new one");

        // Create a new problem if none exists
        const defaultSettings = {
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
        } as SolverSettings;

        const emptyProblem: Problem = {
          people: [],
          groups: [],
          num_sessions: 3,
          constraints: [],
          settings: defaultSettings,
        };

        console.log("[Store] Creating new problem:", emptyProblem);

        // Create and save the new problem
        const newSaved = problemStorage.createProblem(
          "Untitled Problem",
          emptyProblem
        );
        problemStorage.setCurrentProblemId(newSaved.id);

        console.log("[Store] New problem saved with ID:", newSaved.id);

        // Update the store state
        set((state) => ({
          problem: emptyProblem,
          currentProblemId: newSaved.id,
          savedProblems: {
            ...state.savedProblems,
            [newSaved.id]: newSaved,
          },
        }));

        console.log("[Store] Store state updated");

        // Notify user that a new problem was created
        get().addNotification({
          type: "info",
          title: "New Problem Created",
          message:
            "A new untitled problem has been created for you to work with.",
        });

        console.log("[Store] Notification sent, returning problem");
        return emptyProblem;
      },

      // Solution management
      setSolution: (solution) => set({ solution }),

      clearSolution: () => set({ solution: null }),

      // Solver state management
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

      // UI management
      setActiveTab: (activeTab) =>
        set((state) => ({
          ui: { ...state.ui, activeTab },
        })),

      setLoading: (isLoading) =>
        set((state) => ({
          ui: { ...state.ui, isLoading },
        })),

      addNotification: (notification) => {
        const id = Date.now().toString();
        const newNotification: Notification = {
          ...notification,
          id,
          duration: notification.duration ?? 5000, // Default 5 seconds
        };

        set((state) => ({
          ui: {
            ...state.ui,
            notifications: [...state.ui.notifications, newNotification],
          },
        }));

        // Auto-remove notification after duration
        const duration = newNotification.duration;
        if (duration && duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }
      },

      removeNotification: (id) =>
        set((state) => ({
          ui: {
            ...state.ui,
            notifications: state.ui.notifications.filter((n) => n.id !== id),
          },
        })),

      clearNotifications: () =>
        set((state) => ({
          ui: { ...state.ui, notifications: [] },
        })),

      // Problem Management actions
      loadSavedProblems: () => {
        // Migrate existing results to add problemSnapshot if needed
        try {
          problemStorage.migrateAllProblemsAddProblemSnapshot();
        } catch (error) {
          console.warn("Failed to migrate problem snapshots:", error);
        }

        // Load problems after migration
        const savedProblems = problemStorage.getAllProblems();

        const currentProblemId =
          problemStorage.getCurrentProblemId() || Object.keys(savedProblems)[0];
        if (currentProblemId) {
          problemStorage.setCurrentProblemId(currentProblemId);
        }
        set({ savedProblems, currentProblemId });

        if (currentProblemId && savedProblems[currentProblemId]) {
          set({ problem: savedProblems[currentProblemId].problem });
        }

        // Set loading to false after loading is complete
        set((state) => ({
          ui: { ...state.ui, isLoading: false },
        }));
      },

      createNewProblem: (name, isTemplate = false) => {
        const currentProblem = get().problem;
        if (!currentProblem) {
          get().addNotification({
            type: "error",
            title: "No Problem to Save",
            message: "Please create a problem definition first.",
          });
          return;
        }

        try {
          const savedProblem = problemStorage.createProblem(
            name,
            currentProblem,
            isTemplate
          );
          problemStorage.setCurrentProblemId(savedProblem.id);

          set((state) => ({
            savedProblems: {
              ...state.savedProblems,
              [savedProblem.id]: savedProblem,
            },
            currentProblemId: savedProblem.id,
          }));

          get().addNotification({
            type: "success",
            title: "Problem Saved",
            message: `Problem "${name}" has been saved successfully.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Save Failed",
            message:
              error instanceof Error ? error.message : "Failed to save problem",
          });
        }
      },

      loadProblem: (id) => {
        const savedProblem = problemStorage.getProblem(id);
        if (!savedProblem) {
          get().addNotification({
            type: "error",
            title: "Problem Not Found",
            message: "The requested problem could not be found.",
          });
          return;
        }

        problemStorage.setCurrentProblemId(id);
        set({
          problem: savedProblem.problem,
          currentProblemId: id,
          solution: null, // Clear current solution when loading new problem
        });

        get().addNotification({
          type: "success",
          title: "Problem Loaded",
          message: `Problem "${savedProblem.name}" has been loaded.`,
        });
      },

      saveProblem: (name) => {
        const { currentProblemId, problem } = get();
        if (!problem) {
          get().addNotification({
            type: "error",
            title: "No Problem to Save",
            message: "Please create a problem definition first.",
          });
          return;
        }

        try {
          if (currentProblemId) {
            // Update existing problem
            problemStorage.updateProblem(currentProblemId, problem);
            if (name) {
              problemStorage.renameProblem(currentProblemId, name);
            }
          } else {
            // Create new problem
            const savedProblem = problemStorage.createProblem(name, problem);
            problemStorage.setCurrentProblemId(savedProblem.id);
            set((state) => ({
              savedProblems: {
                ...state.savedProblems,
                [savedProblem.id]: savedProblem,
              },
              currentProblemId: savedProblem.id,
            }));
          }

          // Reload saved problems to get updated data
          get().loadSavedProblems();

          get().addNotification({
            type: "success",
            title: "Problem Saved",
            message: `Problem "${name}" has been saved successfully.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Save Failed",
            message:
              error instanceof Error ? error.message : "Failed to save problem",
          });
        }
      },

      deleteProblem: (id) => {
        try {
          const problemName = get().savedProblems[id]?.name || "Unknown";
          problemStorage.deleteProblem(id);

          set((state) => {
            const newSavedProblems = { ...state.savedProblems };
            delete newSavedProblems[id];

            return {
              savedProblems: newSavedProblems,
              currentProblemId:
                state.currentProblemId === id ? null : state.currentProblemId,
              problem: state.currentProblemId === id ? null : state.problem,
            };
          });

          get().addNotification({
            type: "success",
            title: "Problem Deleted",
            message: `Problem "${problemName}" has been deleted.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Delete Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to delete problem",
          });
        }
      },

      duplicateProblem: (id, newName, includeResults = false) => {
        try {
          const duplicatedProblem = problemStorage.duplicateProblem(
            id,
            newName,
            includeResults
          );

          set((state) => ({
            savedProblems: {
              ...state.savedProblems,
              [duplicatedProblem.id]: duplicatedProblem,
            },
          }));

          get().addNotification({
            type: "success",
            title: "Problem Duplicated",
            message: `Problem "${newName}" has been created as a copy.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Duplication Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to duplicate problem",
          });
        }
      },

      renameProblem: (id, newName) => {
        try {
          problemStorage.renameProblem(id, newName);

          set((state) => ({
            savedProblems: {
              ...state.savedProblems,
              [id]: { ...state.savedProblems[id], name: newName },
            },
          }));

          get().addNotification({
            type: "success",
            title: "Problem Renamed",
            message: `Problem has been renamed to "${newName}".`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Rename Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to rename problem",
          });
        }
      },

      toggleTemplate: (id) => {
        try {
          problemStorage.toggleTemplate(id);
          get().loadSavedProblems(); // Reload to get updated data

          const isTemplate = get().savedProblems[id]?.isTemplate;
          get().addNotification({
            type: "success",
            title: isTemplate ? "Marked as Template" : "Unmarked as Template",
            message: `Problem has been ${
              isTemplate ? "marked" : "unmarked"
            } as a template.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Update Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update template status",
          });
        }
      },

      addResult: (solution, solverSettings, customName) => {
        const { currentProblemId, savedProblems, problem } = get();
        console.log(
          "[Store] addResult called with currentProblemId:",
          currentProblemId
        );
        console.log("[Store] savedProblems keys:", Object.keys(savedProblems));
        console.log(
          "[Store] current problem in savedProblems:",
          currentProblemId ? savedProblems[currentProblemId] : null
        );

        if (!currentProblemId) {
          get().addNotification({
            type: "error",
            title: "No Current Problem",
            message:
              "Please save the current problem first before adding results.",
          });
          return;
        }

        if (currentProblemId && !savedProblems[currentProblemId]) {
          console.log(
            "[Store] Problem not found in savedProblems, reloading..."
          );
          get().loadSavedProblems();
          // Try again after reloading
          const { savedProblems: reloadedProblems } = get();
          if (currentProblemId && !reloadedProblems[currentProblemId]) {
            get().addNotification({
              type: "error",
              title: "Save Result Failed",
              message: "Problem not found in saved problems.",
            });
            return;
          }
        }

        try {
          // Pass the current problem state to ensure we capture the latest configuration
          const result = problemStorage.addResult(
            currentProblemId,
            solution,
            solverSettings,
            customName,
            problem || undefined // Pass current problem state to avoid stale data
          );

          // Update the store with the new result and ensure problem state is synced
          set((state) => {
            const currentProblem = state.savedProblems[currentProblemId];
            console.log("[Store] Current problem in state:", currentProblem);
            console.log(
              "[Store] Current problem results:",
              currentProblem?.results
            );

            return {
              savedProblems: {
                ...state.savedProblems,
                [currentProblemId]: {
                  ...currentProblem,
                  problem: problem || currentProblem.problem, // Ensure problem state is current
                  results: [...(currentProblem?.results || []), result],
                },
              },
            };
          });

          get().addNotification({
            type: "success",
            title: "Result Saved",
            message: `Result "${result.name}" has been saved to the current problem.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Save Result Failed",
            message:
              error instanceof Error ? error.message : "Failed to save result",
          });
        }
      },

      updateResultName: (resultId, newName) => {
        const { currentProblemId } = get();
        if (!currentProblemId) return;

        try {
          problemStorage.updateResultName(currentProblemId, resultId, newName);
          get().loadSavedProblems(); // Reload to get updated data

          get().addNotification({
            type: "success",
            title: "Result Renamed",
            message: `Result has been renamed to "${newName}".`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Rename Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to rename result",
          });
        }
      },

      deleteResult: (resultId) => {
        const { currentProblemId } = get();
        if (!currentProblemId) return;

        try {
          problemStorage.deleteResult(currentProblemId, resultId);
          get().loadSavedProblems(); // Reload to get updated data

          get().addNotification({
            type: "success",
            title: "Result Deleted",
            message: "Result has been deleted successfully.",
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Delete Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to delete result",
          });
        }
      },

      selectResultsForComparison: (resultIds) => {
        set({ selectedResultIds: resultIds });
      },

      exportProblem: (id) => {
        try {
          const exportedData = {
            ...problemStorage.exportProblem(id),
            attributeDefinitions: get().attributeDefinitions,
          };
          const problemName = get().savedProblems[id]?.name || "problem";

          // Create and download file
          const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${problemName
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          get().addNotification({
            type: "success",
            title: "Problem Exported",
            message: `Problem "${problemName}" has been exported successfully.`,
          });
        } catch (error) {
          get().addNotification({
            type: "error",
            title: "Export Failed",
            message:
              error instanceof Error
                ? error.message
                : "Failed to export problem",
          });
        }
      },

      importProblem: (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            const exportedData = JSON.parse(content);

            // Restore attribute definitions if present
            if (exportedData.attributeDefinitions) {
              try {
                localStorage.setItem(
                  ATTRIBUTE_DEFS_KEY,
                  JSON.stringify(exportedData.attributeDefinitions)
                );
              } catch (error) {
                console.error("Failed to save attribute definitions:", error);
              }
              set({ attributeDefinitions: exportedData.attributeDefinitions });
            }

            const importedProblem = problemStorage.importProblem(exportedData);

            set((state) => ({
              savedProblems: {
                ...state.savedProblems,
                [importedProblem.id]: importedProblem,
              },
            }));

            get().addNotification({
              type: "success",
              title: "Problem Imported",
              message: `Problem "${importedProblem.name}" has been imported successfully.`,
            });
          } catch (error) {
            console.error("Import failed:", error);
            get().addNotification({
              type: "error",
              title: "Import Failed",
              message:
                "Failed to import problem. Please check the file format.",
            });
          }
        };
        reader.readAsText(file);
      },

      // UI state for problem management
      setShowProblemManager: (show) =>
        set((state) => ({
          ui: { ...state.ui, showProblemManager: show },
        })),

      setShowResultComparison: (show) =>
        set((state) => ({
          ui: { ...state.ui, showResultComparison: show },
        })),

      // Utility actions
      reset: () => set(initialState),

      // Initialize app on first load
      initializeApp: () => {
        get().loadSavedProblems();
      },

      // New actions for attribute management
      setAttributeDefinitions: (definitions) => {
        try {
          localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(definitions));
        } catch (error) {
          console.error("Failed to save attribute definitions:", error);
        }
        set({ attributeDefinitions: definitions });
      },

      addAttributeDefinition: (definition) =>
        set((prev) => {
          const newDefs = [...prev.attributeDefinitions, definition];
          try {
            localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(newDefs));
          } catch (error) {
            console.error("Failed to save attribute definitions:", error);
          }
          return { attributeDefinitions: newDefs };
        }),

      removeAttributeDefinition: (key) =>
        set((prev) => {
          const updatedAttrDefs = prev.attributeDefinitions.filter(
            (def) => def.key !== key
          );

          // Persist
          try {
            localStorage.setItem(
              ATTRIBUTE_DEFS_KEY,
              JSON.stringify(updatedAttrDefs)
            );
          } catch (error) {
            console.error("Failed to save attribute definitions:", error);
          }

          let updatedProblem = prev.problem;
          if (updatedProblem) {
            updatedProblem = {
              ...updatedProblem,
              people: updatedProblem.people.map((p) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { [key]: _removed, ...restAttrs } = p.attributes || {};
                return { ...p, attributes: { ...restAttrs } } as Person;
              }),
            } as Problem;
          }
          return {
            attributeDefinitions: updatedAttrDefs,
            problem: updatedProblem,
          };
        }),

      // Manual Editor unsaved/leave handling
      setManualEditorUnsaved: (unsaved) =>
        set({ manualEditorUnsaved: unsaved }),
      setManualEditorLeaveHook: (hook) => set({ manualEditorLeaveHook: hook }),

      generateDemoData: async () => {
        try {
          const { extractAttributesFromProblem, mergeAttributeDefinitions } =
            await import("../services/demoDataService");

          const demoGroups: Group[] = [
            { id: "team-alpha", size: 4 },
            { id: "team-beta", size: 4 },
            { id: "team-gamma", size: 4 },
          ];

          const demoPeople: Person[] = [
            {
              id: "alice",
              attributes: {
                name: "Alice Johnson",
                gender: "female",
                department: "engineering",
                seniority: "senior",
              },
            },
            {
              id: "bob",
              attributes: {
                name: "Bob Smith",
                gender: "male",
                department: "marketing",
                seniority: "mid",
              },
            },
            {
              id: "charlie",
              attributes: {
                name: "Charlie Brown",
                gender: "male",
                department: "engineering",
                seniority: "junior",
              },
            },
            {
              id: "diana",
              attributes: {
                name: "Diana Prince",
                gender: "female",
                department: "sales",
                seniority: "lead",
              },
            },
            {
              id: "eve",
              attributes: {
                name: "Eve Davis",
                gender: "female",
                department: "hr",
                seniority: "mid",
              },
            },
            {
              id: "frank",
              attributes: {
                name: "Frank Miller",
                gender: "male",
                department: "finance",
                seniority: "senior",
              },
            },
            {
              id: "grace",
              attributes: {
                name: "Grace Lee",
                gender: "female",
                department: "engineering",
                seniority: "junior",
              },
            },
            {
              id: "henry",
              attributes: {
                name: "Henry Wilson",
                gender: "male",
                department: "marketing",
                seniority: "senior",
              },
            },
            {
              id: "iris",
              attributes: {
                name: "Iris Chen",
                gender: "female",
                department: "sales",
                seniority: "mid",
              },
            },
            {
              id: "jack",
              attributes: {
                name: "Jack Taylor",
                gender: "male",
                department: "hr",
                seniority: "junior",
              },
            },
            {
              id: "kate",
              attributes: {
                name: "Kate Anderson",
                gender: "female",
                department: "finance",
                seniority: "lead",
              },
            },
            {
              id: "leo",
              attributes: {
                name: "Leo Rodriguez",
                gender: "male",
                department: "engineering",
                seniority: "mid",
                location: "remote",
              },
              sessions: [1, 2], // Late arrival - misses first session
            },
          ];

          const demoProblem: Problem = {
            people: demoPeople,
            groups: demoGroups,
            num_sessions: 3,
            constraints: [
              // Limit repeat encounters
              {
                type: "RepeatEncounter",
                max_allowed_encounters: 1,
                penalty_function: "squared",
                penalty_weight: 1.0,
              },
              // Keep Alice and Bob together (they're project partners)
              {
                type: "MustStayTogether",
                people: ["alice", "bob"],
                sessions: [0, 1], // Only for first two sessions
              },
              // Charlie and Diana can't be together (personality conflict)
              {
                type: "ShouldNotBeTogether",
                people: ["charlie", "diana"],
                penalty_weight: 500.0,
              },
              // Maintain gender balance in team-alpha
              {
                type: "AttributeBalance",
                group_id: "team-alpha",
                attribute_key: "gender",
                desired_values: { male: 2, female: 2 },
                penalty_weight: 50.0,
                mode: "exact",
              },
            ],
            settings: {
              solver_type: "SimulatedAnnealing",
              stop_conditions: {
                max_iterations: 10000,
                time_limit_seconds: 30,
                no_improvement_iterations: 1000,
              },
              solver_params: {
                SimulatedAnnealing: {
                  initial_temperature: 1.0,
                  final_temperature: 0.01,
                  cooling_schedule: "geometric",
                  reheat_after_no_improvement: 0,
                },
              },
              logging: {
                log_frequency: 1000,
                log_initial_state: true,
                log_duration_and_score: true,
                display_final_schedule: true,
                log_initial_score_breakdown: true,
                log_final_score_breakdown: true,
                log_stop_condition: true,
              },
            },
          };

          // Extract attributes from the demo problem
          const extractedAttributes = extractAttributesFromProblem(demoProblem);

          // Merge with existing attribute definitions
          const currentAttributes = get().attributeDefinitions;
          const mergedAttributes = mergeAttributeDefinitions(
            currentAttributes,
            extractedAttributes
          );

          // Update the store with both the problem and the merged attributes
          // Clear solution since it's no longer valid for the new problem
          set({
            problem: demoProblem,
            attributeDefinitions: mergedAttributes,
            solution: null,
          });

          get().addNotification({
            type: "success",
            title: "Demo Data Loaded",
            message:
              "Generated sample problem with 12 people, 3 groups, and various constraints",
          });
        } catch (error) {
          console.error("Failed to generate demo data:", error);
          get().addNotification({
            type: "error",
            title: "Demo Data Generation Failed",
            message: "Failed to generate demo data. Please try again.",
          });
        }
      },

      loadDemoCase: async (demoCaseId) => {
        try {
          const {
            loadDemoCase,
            extractAttributesFromProblem,
            mergeAttributeDefinitions,
          } = await import("../services/demoDataService");

          set({ demoDropdownOpen: false });

          const problem = await loadDemoCase(demoCaseId);

          // Extract attributes from the loaded problem
          const extractedAttributes = extractAttributesFromProblem(problem);

          // Merge with existing attribute definitions
          const currentAttributes = get().attributeDefinitions;
          const mergedAttributes = mergeAttributeDefinitions(
            currentAttributes,
            extractedAttributes
          );

          // Update the store with both the problem and the merged attributes
          // Clear solution since it's no longer valid for the new problem
          set({
            problem,
            attributeDefinitions: mergedAttributes,
            solution: null,
          });

          // Check if any new attributes were added
          const newAttributeKeys = extractedAttributes
            .filter(
              (extracted) =>
                !currentAttributes.find(
                  (current) => current.key === extracted.key
                )
            )
            .map((attr) => attr.key);

          let message = `Loaded demo case with ${problem.people.length} people and ${problem.groups.length} groups`;
          if (newAttributeKeys.length > 0) {
            message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
          }

          get().addNotification({
            type: "success",
            title: "Demo Case Loaded",
            message,
          });
        } catch (error) {
          console.error("Failed to load demo case:", error);
          set({ demoDropdownOpen: false });

          get().addNotification({
            type: "error",
            title: "Demo Case Load Failed",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      },

      loadDemoCaseOverwrite: async (demoCaseId) => {
        try {
          const {
            loadDemoCase,
            extractAttributesFromProblem,
            mergeAttributeDefinitions,
          } = await import("../services/demoDataService");

          const problem = await loadDemoCase(demoCaseId);

          // Extract attributes from the loaded problem
          const extractedAttributes = extractAttributesFromProblem(problem);

          // Merge with existing attribute definitions
          const currentAttributes = get().attributeDefinitions;
          const mergedAttributes = mergeAttributeDefinitions(
            currentAttributes,
            extractedAttributes
          );

          // Update the store with both the problem and the merged attributes
          // Clear solution since it's no longer valid for the new problem
          set({
            problem,
            attributeDefinitions: mergedAttributes,
            solution: null,
          });

          // Check if any new attributes were added
          const newAttributeKeys = extractedAttributes
            .filter(
              (extracted) =>
                !currentAttributes.find(
                  (current) => current.key === extracted.key
                )
            )
            .map((attr) => attr.key);

          let message = `Overwrote current problem with demo case: ${problem.people.length} people and ${problem.groups.length} groups`;
          if (newAttributeKeys.length > 0) {
            message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
          }

          get().addNotification({
            type: "success",
            title: "Demo Case Loaded",
            message,
          });
        } catch (error) {
          console.error("Failed to load demo case:", error);
          get().addNotification({
            type: "error",
            title: "Demo Case Load Failed",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      },

      loadDemoCaseNewProblem: async (demoCaseId) => {
        try {
          const {
            loadDemoCase,
            extractAttributesFromProblem,
            mergeAttributeDefinitions,
          } = await import("../services/demoDataService");

          const demoProblem = await loadDemoCase(demoCaseId);

          // Extract attributes from the loaded problem
          const extractedAttributes = extractAttributesFromProblem(demoProblem);

          // Merge with existing attribute definitions
          const currentAttributes = get().attributeDefinitions;
          const mergedAttributes = mergeAttributeDefinitions(
            currentAttributes,
            extractedAttributes
          );

          // Save current problem if it has content (keep its existing name)
          const currentProblem = get().problem;
          const currentProblemId = get().currentProblemId;
          if (
            currentProblem &&
            (currentProblem.people.length > 0 ||
              currentProblem.groups.length > 0)
          ) {
            try {
              // If current problem is already saved, just update it
              if (currentProblemId) {
                get().updateCurrentProblem(currentProblemId, currentProblem);
              } else {
                // If not saved, create a new saved problem with a generic name
                const savedProblem = problemStorage.createProblem(
                  "Untitled Problem",
                  currentProblem
                );
                set((state) => ({
                  savedProblems: {
                    ...state.savedProblems,
                    [savedProblem.id]: savedProblem,
                  },
                }));
              }
            } catch (error) {
              console.error("Failed to save current problem:", error);
            }
          }

          // Create a new problem with the demo data
          const newSavedProblem = problemStorage.createProblem(
            "Unnamed Problem",
            demoProblem
          );

          // Update the store with the new problem and merged attributes
          const updatedSavedProblems = {
            ...get().savedProblems,
            [newSavedProblem.id]: newSavedProblem,
          };

          set({
            problem: demoProblem,
            currentProblemId: newSavedProblem.id,
            attributeDefinitions: mergedAttributes,
            savedProblems: updatedSavedProblems,
            solution: null,
          });

          // Check if any new attributes were added
          const newAttributeKeys = extractedAttributes
            .filter(
              (extracted) =>
                !currentAttributes.find(
                  (current) => current.key === extracted.key
                )
            )
            .map((attr) => attr.key);

          let message = `Loaded demo case in new problem: ${demoProblem.people.length} people and ${demoProblem.groups.length} groups`;
          if (newAttributeKeys.length > 0) {
            message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
          }
          if (
            currentProblem &&
            (currentProblem.people.length > 0 ||
              currentProblem.groups.length > 0)
          ) {
            if (currentProblemId) {
              message += `. Current problem "${currentProblemId}" has been saved`;
            } else {
              message += `. Current problem saved as "Untitled Problem"`;
            }
          }

          get().addNotification({
            type: "success",
            title: "Demo Case Loaded",
            message,
          });
        } catch (error) {
          console.error("Failed to load demo case:", error);
          get().addNotification({
            type: "error",
            title: "Demo Case Load Failed",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      },

      setDemoDropdownOpen: (open) => set({ demoDropdownOpen: open }),
    }),
    {
      name: "people-distributor-store",
    }
  )
);
