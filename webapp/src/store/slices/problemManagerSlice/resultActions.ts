import { problemStorage } from '../../../services/problemStorage';
import type { Problem, Solution, SolverSettings } from '../../../types';
import type { ProblemManagerActions, ProblemManagerState, StoreSlice } from '../../types';

type SliceTools = Parameters<StoreSlice<ProblemManagerState & ProblemManagerActions>>;

type SetState = SliceTools[0];
type GetState = SliceTools[1];

type ResultActionKeys = 'addResult' | 'updateResultName' | 'deleteResult' | 'selectResultsForComparison';

export function createResultActions(set: SetState, get: GetState): Pick<ProblemManagerActions, ResultActionKeys> {
  return {
    addResult: (
      solution: Solution,
      solverSettings: SolverSettings,
      customName?: string,
      snapshotProblemOverride?: Problem,
    ) => {
      const { currentProblemId, savedProblems, problem } = get();
      console.log('[Store] addResult called with currentProblemId:', currentProblemId);
      console.log('[Store] savedProblems keys:', Object.keys(savedProblems));
      console.log('[Store] current problem in savedProblems:', currentProblemId ? savedProblems[currentProblemId] : null);

      if (!currentProblemId) {
        get().addNotification({
          type: 'error',
          title: 'No Current Problem',
          message: 'Please save the current problem first before adding results.',
        });
        return;
      }

      if (currentProblemId && !savedProblems[currentProblemId]) {
        console.log('[Store] Problem not found in savedProblems, reloading...');
        get().loadSavedProblems();
        const { savedProblems: reloadedProblems } = get();
        if (currentProblemId && !reloadedProblems[currentProblemId]) {
          get().addNotification({
            type: 'error',
            title: 'Save Result Failed',
            message: 'Problem not found in saved problems.',
          });
          return;
        }
      }

      try {
        const problemForSnapshot = snapshotProblemOverride || problem || undefined;

        const result = problemStorage.addResult(
          currentProblemId,
          solution,
          solverSettings,
          customName,
          problemForSnapshot,
        );

        set((state) => {
          const currentProblem = state.savedProblems[currentProblemId];
          console.log('[Store] Current problem in state:', currentProblem);
          console.log('[Store] Current problem results:', currentProblem?.results);

          return {
            savedProblems: {
              ...state.savedProblems,
              [currentProblemId]: {
                ...currentProblem,
                problem: problem || currentProblem.problem,
                results: [...(currentProblem?.results || []), result],
              },
            },
          };
        });

        get().addNotification({
          type: 'success',
          title: 'Result Saved',
          message: `Result "${result.name}" has been saved to the current problem.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Result Failed',
          message: error instanceof Error ? error.message : 'Failed to save result',
        });
      }
    },

    updateResultName: (resultId, newName) => {
      const { currentProblemId } = get();
      if (!currentProblemId) return;

      try {
        problemStorage.updateResultName(currentProblemId, resultId, newName);
        get().loadSavedProblems();

        get().addNotification({
          type: 'success',
          title: 'Result Renamed',
          message: `Result has been renamed to "${newName}".`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Rename Failed',
          message: error instanceof Error ? error.message : 'Failed to rename result',
        });
      }
    },

    deleteResult: (resultId) => {
      const { currentProblemId } = get();
      if (!currentProblemId) return;

      try {
        problemStorage.deleteResult(currentProblemId, resultId);
        get().loadSavedProblems();

        get().addNotification({
          type: 'success',
          title: 'Result Deleted',
          message: 'Result has been deleted successfully.',
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: error instanceof Error ? error.message : 'Failed to delete result',
        });
      }
    },

    selectResultsForComparison: (resultIds) => {
      set({ selectedResultIds: resultIds });
    },
  };
}
