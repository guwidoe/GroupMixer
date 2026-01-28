import { problemStorage } from '../../../services/problemStorage';
import { ATTRIBUTE_DEFS_KEY } from '../attributeSlice';
import type { ProblemManagerActions, ProblemManagerState, StoreSlice } from '../../types';

type SliceTools = Parameters<StoreSlice<ProblemManagerState & ProblemManagerActions>>;

type SetState = SliceTools[0];
type GetState = SliceTools[1];

type ProblemActionKeys =
  | 'loadSavedProblems'
  | 'createNewProblem'
  | 'loadProblem'
  | 'saveProblem'
  | 'deleteProblem'
  | 'duplicateProblem'
  | 'renameProblem'
  | 'toggleTemplate'
  | 'restoreResultAsNewProblem'
  | 'exportProblem'
  | 'importProblem';

export function createProblemActions(set: SetState, get: GetState): Pick<ProblemManagerActions, ProblemActionKeys> {
  return {
    loadSavedProblems: () => {
      try {
        problemStorage.migrateAllProblemsAddProblemSnapshot();
      } catch (error) {
        console.warn('Failed to migrate problem snapshots:', error);
      }

      const savedProblems = problemStorage.getAllProblems();
      const currentProblemId = problemStorage.getCurrentProblemId() || Object.keys(savedProblems)[0];
      if (currentProblemId) {
        problemStorage.setCurrentProblemId(currentProblemId);
      }
      set({ savedProblems, currentProblemId });

      if (currentProblemId && savedProblems[currentProblemId]) {
        set({ problem: savedProblems[currentProblemId].problem });
      }

      set((state) => ({
        ui: { ...state.ui, isLoading: false },
      }));
    },

    createNewProblem: (name, isTemplate = false) => {
      const currentProblem = get().problem;
      if (!currentProblem) {
        get().addNotification({
          type: 'error',
          title: 'No Problem to Save',
          message: 'Please create a problem definition first.',
        });
        return;
      }

      try {
        const savedProblem = problemStorage.createProblem(name, currentProblem, isTemplate);
        problemStorage.setCurrentProblemId(savedProblem.id);

        set((state) => ({
          savedProblems: {
            ...state.savedProblems,
            [savedProblem.id]: savedProblem,
          },
          currentProblemId: savedProblem.id,
        }));

        get().addNotification({
          type: 'success',
          title: 'Problem Saved',
          message: `Problem "${name}" has been saved successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to save problem',
        });
      }
    },

    loadProblem: (id) => {
      const savedProblem = problemStorage.getProblem(id);
      if (!savedProblem) {
        get().addNotification({
          type: 'error',
          title: 'Problem Not Found',
          message: 'The requested problem could not be found.',
        });
        return;
      }

      problemStorage.setCurrentProblemId(id);
      set({
        problem: savedProblem.problem,
        currentProblemId: id,
        solution: null,
      });

      get().addNotification({
        type: 'success',
        title: 'Problem Loaded',
        message: `Problem "${savedProblem.name}" has been loaded.`,
      });
    },

    saveProblem: (name) => {
      const { currentProblemId, problem } = get();
      if (!problem) {
        get().addNotification({
          type: 'error',
          title: 'No Problem to Save',
          message: 'Please create a problem definition first.',
        });
        return;
      }

      try {
        if (currentProblemId) {
          problemStorage.updateProblem(currentProblemId, problem);
          if (name) {
            problemStorage.renameProblem(currentProblemId, name);
          }
        } else {
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

        get().loadSavedProblems();

        get().addNotification({
          type: 'success',
          title: 'Problem Saved',
          message: `Problem "${name}" has been saved successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to save problem',
        });
      }
    },

    deleteProblem: (id) => {
      try {
        const problemName = get().savedProblems[id]?.name || 'Unknown';
        problemStorage.deleteProblem(id);

        set((state) => {
          const newSavedProblems = { ...state.savedProblems };
          delete newSavedProblems[id];

          return {
            savedProblems: newSavedProblems,
            currentProblemId: state.currentProblemId === id ? null : state.currentProblemId,
            problem: state.currentProblemId === id ? null : state.problem,
          };
        });

        get().addNotification({
          type: 'success',
          title: 'Problem Deleted',
          message: `Problem "${problemName}" has been deleted.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: error instanceof Error ? error.message : 'Failed to delete problem',
        });
      }
    },

    duplicateProblem: (id, newName, includeResults = false) => {
      try {
        const duplicatedProblem = problemStorage.duplicateProblem(id, newName, includeResults);

        set((state) => ({
          savedProblems: {
            ...state.savedProblems,
            [duplicatedProblem.id]: duplicatedProblem,
          },
        }));

        get().addNotification({
          type: 'success',
          title: 'Problem Duplicated',
          message: `Problem "${newName}" has been created as a copy.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Duplication Failed',
          message: error instanceof Error ? error.message : 'Failed to duplicate problem',
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
          type: 'success',
          title: 'Problem Renamed',
          message: `Problem has been renamed to "${newName}".`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Rename Failed',
          message: error instanceof Error ? error.message : 'Failed to rename problem',
        });
      }
    },

    toggleTemplate: (id) => {
      try {
        problemStorage.toggleTemplate(id);
        get().loadSavedProblems();

        const isTemplate = get().savedProblems[id]?.isTemplate;
        get().addNotification({
          type: 'success',
          title: isTemplate ? 'Marked as Template' : 'Unmarked as Template',
          message: `Problem has been ${isTemplate ? 'marked' : 'unmarked'} as a template.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Update Failed',
          message: error instanceof Error ? error.message : 'Failed to update template status',
        });
      }
    },

    restoreResultAsNewProblem: (resultId, newName) => {
      const { currentProblemId } = get();
      if (!currentProblemId) {
        get().addNotification({
          type: 'error',
          title: 'No Current Problem',
          message: "Select a problem first to restore a result's configuration.",
        });
        return;
      }

      try {
        const created = problemStorage.restoreResultAsNewProblem(currentProblemId, resultId, newName);

        set((state) => ({
          savedProblems: {
            ...state.savedProblems,
            [created.id]: created,
          },
        }));

        get().addNotification({
          type: 'success',
          title: 'Restored as New Problem',
          message: `Created problem "${created.name}" from the result's configuration.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Restore Failed',
          message: error instanceof Error ? error.message : 'Could not restore result as new problem',
        });
      }
    },

    exportProblem: (id) => {
      try {
        const exportedData = {
          ...problemStorage.exportProblem(id),
          attributeDefinitions: get().attributeDefinitions,
        };
        const problemName = get().savedProblems[id]?.name || 'problem';

        const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${problemName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        get().addNotification({
          type: 'success',
          title: 'Problem Exported',
          message: `Problem "${problemName}" has been exported successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Export Failed',
          message: error instanceof Error ? error.message : 'Failed to export problem',
        });
      }
    },

    importProblem: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const exportedData = JSON.parse(content);

          if (exportedData.attributeDefinitions) {
            try {
              localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(exportedData.attributeDefinitions));
            } catch (error) {
              console.error('Failed to save attribute definitions:', error);
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
            type: 'success',
            title: 'Problem Imported',
            message: `Problem "${importedProblem.name}" has been imported successfully.`,
          });
        } catch (error) {
          console.error('Import failed:', error);
          get().addNotification({
            type: 'error',
            title: 'Import Failed',
            message: 'Failed to import problem. Please check the file format.',
          });
        }
      };
      reader.readAsText(file);
    },
  };
}
