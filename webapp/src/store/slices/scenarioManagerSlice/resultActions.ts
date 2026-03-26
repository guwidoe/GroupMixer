import { scenarioStorage } from '../../../services/scenarioStorage';
import type { Scenario, ScenarioResult, Solution, SolverSettings } from '../../../types';
import type { ScenarioManagerActions, ScenarioManagerState, StoreSlice } from '../../types';

type SliceTools = Parameters<StoreSlice<ScenarioManagerState & ScenarioManagerActions>>;

type SetState = SliceTools[0];
type GetState = SliceTools[1];

type ResultActionKeys = 'addResult' | 'updateResultName' | 'deleteResult' | 'selectResultsForComparison';

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
      const { currentScenarioId } = get();
      if (!currentScenarioId) return;

      try {
        scenarioStorage.deleteResult(currentScenarioId, resultId);
        get().loadSavedScenarios();

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
