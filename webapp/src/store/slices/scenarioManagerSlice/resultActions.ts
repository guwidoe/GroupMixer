import { scenarioStorage } from '../../../services/scenarioStorage';
import type { Scenario, ScenarioResult, Solution, SolverSettings } from '../../../types';
import type { ScenarioManagerActions, ScenarioManagerState, StoreSlice } from '../../types';
import { initialSolverState } from '../solverSlice';

type SliceTools = Parameters<StoreSlice<ScenarioManagerState & ScenarioManagerActions>>;

type SetState = SliceTools[0];
type GetState = SliceTools[1];

type ResultActionKeys = 'addResult' | 'updateResultName' | 'deleteResult' | 'selectCurrentResult' | 'selectResultsForComparison';

function solverStateFromResult(result: ScenarioResult) {
  return {
    ...initialSolverState,
    isRunning: false,
    isComplete: true,
    currentIteration: result.solution.iteration_count,
    bestScore: result.solution.final_score,
    currentScore: result.solution.final_score,
    elapsedTime: result.solution.elapsed_time_ms,
    noImprovementCount: result.solution.benchmark_telemetry?.no_improvement_count ?? 0,
  };
}

export function createResultActions(set: SetState, get: GetState): Pick<ScenarioManagerActions, ResultActionKeys> {
  return {
    addResult: (
      solution: Solution,
      solverSettings: SolverSettings,
      customName?: string,
      snapshotScenarioOverride?: Scenario,
    ): ScenarioResult | null => {
      const { currentScenarioId, savedScenarios, scenario } = get();

      if (!currentScenarioId) {
        get().addNotification({
          type: 'error',
          title: 'No Current Scenario',
          message: 'Please save the current scenario first before adding results.',
        });
        return null;
      }

      let currentSavedScenario = savedScenarios[currentScenarioId];
      if (currentScenarioId && !savedScenarios[currentScenarioId]) {
        get().loadSavedScenarios();
        const { savedScenarios: reloadedScenarios } = get();
        currentSavedScenario = reloadedScenarios[currentScenarioId];
        if (currentScenarioId && !reloadedScenarios[currentScenarioId]) {
          get().addNotification({
            type: 'error',
            title: 'Save Result Failed',
            message: 'Scenario not found in saved scenarios.',
          });
          return null;
        }
      }

      try {
        const scenarioForSnapshot = snapshotScenarioOverride || scenario || undefined;

        const result = scenarioStorage.addResult(
          currentScenarioId,
          solution,
          solverSettings,
          customName,
          scenarioForSnapshot,
        );

        const persistedScenario = scenarioStorage.getScenario(currentScenarioId);

        set((state) => {
          const currentScenario = state.savedScenarios[currentScenarioId] ?? currentSavedScenario;
          if (!currentScenario) {
            return {};
          }

          return {
            scenario: scenario || currentScenario.scenario,
            solution,
            currentResultId: result.id,
            savedScenarios: {
              ...state.savedScenarios,
              [currentScenarioId]: persistedScenario
                ? {
                    ...persistedScenario,
                    scenario: scenario || persistedScenario.scenario,
                  }
                : {
                    ...currentScenario,
                    scenario: scenario || currentScenario.scenario,
                    results: [...(currentScenario.results || []), result],
                },
            },
            solverState: solverStateFromResult(result),
          };
        });

        get().addNotification({
          type: 'success',
          title: 'Result Saved',
          message: `Result "${result.name}" has been saved to the current scenario.`,
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
      const { currentScenarioId } = get();
      if (!currentScenarioId) return;

      try {
        scenarioStorage.updateResultName(currentScenarioId, resultId, newName);
        get().loadSavedScenarios();

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
      const { currentScenarioId, currentResultId } = get();
      if (!currentScenarioId) return;

      try {
        scenarioStorage.deleteResult(currentScenarioId, resultId);
        get().loadSavedScenarios();

        if (currentResultId === resultId) {
          set({ currentResultId: null, solution: null, solverState: initialSolverState });
        }

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

    selectCurrentResult: (resultId) => {
      const { currentScenarioId, savedScenarios } = get();

      if (!currentScenarioId || !resultId) {
        set({ currentResultId: null, solution: null, solverState: initialSolverState });
        return;
      }

      const savedScenario = savedScenarios[currentScenarioId] ?? scenarioStorage.getScenario(currentScenarioId);
      const result = savedScenario?.results.find((entry) => entry.id === resultId);

      if (!savedScenario || !result) {
        get().addNotification({
          type: 'error',
          title: 'Result Not Found',
          message: 'The requested result could not be found in the current scenario.',
        });
        set({ currentResultId: null, solution: null, solverState: initialSolverState });
        return;
      }

      set((state) => ({
        scenario: savedScenario.scenario,
        solution: result.solution,
        currentResultId: result.id,
        solverState: solverStateFromResult(result),
        savedScenarios: state.savedScenarios[savedScenario.id]
          ? state.savedScenarios
          : {
              ...state.savedScenarios,
              [savedScenario.id]: savedScenario,
            },
      }));
    },

    selectResultsForComparison: (resultIds) => {
      set({ selectedResultIds: resultIds });
    },
  };
}
