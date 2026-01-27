/**
 * Problem Manager slice - handles saving, loading, and result management.
 */

import type { Solution, Problem, SolverSettings } from "../../types";
import type { ProblemManagerState, ProblemManagerActions, StoreSlice } from "../types";
import { problemStorage } from "../../services/problemStorage";
import { ATTRIBUTE_DEFS_KEY } from "./attributeSlice";

export const createProblemManagerSlice: StoreSlice<
  ProblemManagerState & ProblemManagerActions
> = (set, get) => ({
  currentProblemId: null,
  savedProblems: {},
  selectedResultIds: [],

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

  restoreResultAsNewProblem: (resultId, newName) => {
    const { currentProblemId } = get();
    if (!currentProblemId) {
      get().addNotification({
        type: "error",
        title: "No Current Problem",
        message:
          "Select a problem first to restore a result's configuration.",
      });
      return;
    }

    try {
      const created = problemStorage.restoreResultAsNewProblem(
        currentProblemId,
        resultId,
        newName
      );

      // Update store cache
      set((state) => ({
        savedProblems: {
          ...state.savedProblems,
          [created.id]: created,
        },
      }));

      get().addNotification({
        type: "success",
        title: "Restored as New Problem",
        message: `Created problem "${created.name}" from the result's configuration.`,
      });
    } catch (error) {
      get().addNotification({
        type: "error",
        title: "Restore Failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not restore result as new problem",
      });
    }
  },

  addResult: (
    solution: Solution,
    solverSettings: SolverSettings,
    customName?: string,
    snapshotProblemOverride?: Problem
  ) => {
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
      // Capture the intended problem configuration for this result snapshot
      // Prefer the explicit override (e.g., solver-run snapshot),
      // otherwise fall back to the current problem in the store.
      const problemForSnapshot =
        snapshotProblemOverride || problem || undefined;

      const result = problemStorage.addResult(
        currentProblemId,
        solution,
        solverSettings,
        customName,
        problemForSnapshot // Use provided snapshot problem (decouples from live UI changes)
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
              problem: problem || currentProblem.problem, // Keep problem state synced in store
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
});
