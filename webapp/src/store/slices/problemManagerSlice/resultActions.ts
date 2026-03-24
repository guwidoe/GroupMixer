import { problemStorage } from '../../../services/problemStorage';
import type { Problem, ProblemResult, Solution, SolverSettings } from '../../../types';
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
    ): ProblemResult | null => {
      const { currentProblemId, savedProblems, problem } = get();

      if (!currentProblemId) {
        get().addNotification({
          type: 'error',
          title: 'No Current Problem',
          message: 'Please save the current problem first before adding results.',
        });
        return null;
      }

      let currentSavedProblem = savedProblems[currentProblemId];
      if (currentProblemId && !savedProblems[currentProblemId]) {
        get().loadSavedProblems();
        const { savedProblems: reloadedProblems } = get();
        currentSavedProblem = reloadedProblems[currentProblemId];
        if (currentProblemId && !reloadedProblems[currentProblemId]) {
          get().addNotification({
            type: 'error',
            title: 'Save Result Failed',
            message: 'Problem not found in saved problems.',
          });
          return null;
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
          const currentProblem = state.savedProblems[currentProblemId] ?? currentSavedProblem;
          if (!currentProblem) {
            return {};
          }

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
        return result;
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Result Failed',
          message: error instanceof Error ? error.message : 'Failed to save result',
        });
        return null;
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
