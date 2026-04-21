import { scenarioStorage } from '../../../services/scenarioStorage';
import type { ScenarioManagerActions, ScenarioManagerState, StoreSlice } from '../../types';
import { getSavedScenarioDocument, getScenarioDocumentFromState, getScenarioDocumentState } from '../../scenarioDocument';
import { initialSolverState } from '../solverSlice';

type SliceTools = Parameters<StoreSlice<ScenarioManagerState & ScenarioManagerActions>>;

type SetState = SliceTools[0];
type GetState = SliceTools[1];

type ScenarioActionKeys =
  | 'loadSavedScenarios'
  | 'createNewScenario'
  | 'loadScenario'
  | 'saveScenario'
  | 'deleteScenario'
  | 'duplicateScenario'
  | 'renameScenario'
  | 'toggleTemplate'
  | 'restoreResultAsNewScenario'
  | 'exportScenario'
  | 'importScenario';

export function createScenarioActions(set: SetState, get: GetState): Pick<ScenarioManagerActions, ScenarioActionKeys> {
  return {
    loadSavedScenarios: () => {
      try {
        scenarioStorage.migrateAllScenariosAddScenarioSnapshot();
      } catch (error) {
        console.warn('Failed to migrate scenario snapshots:', error);
      }

      const savedScenarios = scenarioStorage.getAllScenarios();
      const currentScenarioId = scenarioStorage.getCurrentScenarioId() || Object.keys(savedScenarios)[0];
      const previousCurrentResultId = get().currentResultId;
      const validCurrentResultId =
        currentScenarioId && previousCurrentResultId && savedScenarios[currentScenarioId]?.results.some((result) => result.id === previousCurrentResultId)
          ? previousCurrentResultId
          : null;
      const currentResult =
        currentScenarioId && validCurrentResultId
          ? savedScenarios[currentScenarioId]?.results.find((result) => result.id === validCurrentResultId) ?? null
          : null;
      if (currentScenarioId) {
        scenarioStorage.setCurrentScenarioId(currentScenarioId);
      }
      set((state) => ({
        ...(currentScenarioId && savedScenarios[currentScenarioId]
          ? getScenarioDocumentState(getSavedScenarioDocument(savedScenarios[currentScenarioId]), state.attributeDefinitions)
          : {}),
        savedScenarios,
        currentScenarioId,
        currentResultId: validCurrentResultId,
        solution: currentResult?.solution ?? null,
        solverState: currentResult
          ? {
              ...initialSolverState,
              isComplete: true,
              currentIteration: currentResult.solution.iteration_count,
              bestScore: currentResult.solution.final_score,
              currentScore: currentResult.solution.final_score,
              elapsedTime: currentResult.solution.elapsed_time_ms,
              noImprovementCount: currentResult.solution.benchmark_telemetry?.no_improvement_count ?? 0,
            }
          : initialSolverState,
      }));

      set((state) => ({
        ui: { ...state.ui, isLoading: false },
      }));
    },

    createNewScenario: (name, isTemplate = false) => {
      const currentDocument = getScenarioDocumentFromState(get());
      if (!currentDocument) {
        get().addNotification({
          type: 'error',
          title: 'No Scenario to Save',
          message: 'Please create a scenario definition first.',
        });
        return;
      }

      try {
        const savedScenario = scenarioStorage.createScenario(
          name,
          currentDocument.scenario,
          currentDocument.attributeDefinitions,
          isTemplate,
        );
        scenarioStorage.setCurrentScenarioId(savedScenario.id);

        set((state) => ({
          savedScenarios: {
            ...state.savedScenarios,
            [savedScenario.id]: savedScenario,
          },
          currentScenarioId: savedScenario.id,
          currentResultId: null,
          selectedResultIds: [],
        }));

        get().addNotification({
          type: 'success',
          title: 'Scenario Saved',
          message: `Scenario "${name}" has been saved successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to save scenario',
        });
      }
    },

    loadScenario: (id) => {
      const savedScenario = scenarioStorage.getScenario(id);
      if (!savedScenario) {
        get().addNotification({
          type: 'error',
          title: 'Scenario Not Found',
          message: 'The requested scenario could not be found.',
        });
        return;
      }

      scenarioStorage.setCurrentScenarioId(id);
      set((state) => ({
        ...getScenarioDocumentState(getSavedScenarioDocument(savedScenario), state.attributeDefinitions),
        currentScenarioId: id,
        currentResultId: null,
        solution: null,
        selectedResultIds: [],
        solverState: initialSolverState,
      }));

      get().addNotification({
        type: 'success',
        title: 'Scenario Loaded',
        message: `Scenario "${savedScenario.name}" has been loaded.`,
      });
    },

    saveScenario: (name) => {
      const { currentScenarioId } = get();
      const currentDocument = getScenarioDocumentFromState(get());
      if (!currentDocument) {
        get().addNotification({
          type: 'error',
          title: 'No Scenario to Save',
          message: 'Please create a scenario definition first.',
        });
        return;
      }

      try {
        if (currentScenarioId) {
          scenarioStorage.updateScenario(currentScenarioId, currentDocument.scenario, currentDocument.attributeDefinitions);
          if (name) {
            scenarioStorage.renameScenario(currentScenarioId, name);
          }
        } else {
          const savedScenario = scenarioStorage.createScenario(name, currentDocument.scenario, currentDocument.attributeDefinitions);
          scenarioStorage.setCurrentScenarioId(savedScenario.id);
          set((state) => ({
            savedScenarios: {
              ...state.savedScenarios,
              [savedScenario.id]: savedScenario,
            },
            currentScenarioId: savedScenario.id,
          }));
        }

        get().loadSavedScenarios();

        get().addNotification({
          type: 'success',
          title: 'Scenario Saved',
          message: `Scenario "${name}" has been saved successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Save Failed',
          message: error instanceof Error ? error.message : 'Failed to save scenario',
        });
      }
    },

    deleteScenario: (id) => {
      try {
        const scenarioName = get().savedScenarios[id]?.name || 'Unknown';
        scenarioStorage.deleteScenario(id);

        set((state) => {
          const newSavedScenarios = { ...state.savedScenarios };
          delete newSavedScenarios[id];

          return {
            savedScenarios: newSavedScenarios,
            currentScenarioId: state.currentScenarioId === id ? null : state.currentScenarioId,
            currentResultId: state.currentScenarioId === id ? null : state.currentResultId,
            scenarioDocument: state.currentScenarioId === id ? null : state.scenarioDocument,
            scenario: state.currentScenarioId === id ? null : state.scenario,
            solution: state.currentScenarioId === id ? null : state.solution,
            selectedResultIds: state.currentScenarioId === id ? [] : state.selectedResultIds,
            solverState: state.currentScenarioId === id ? initialSolverState : state.solverState,
          };
        });

        get().addNotification({
          type: 'success',
          title: 'Scenario Deleted',
          message: `Scenario "${scenarioName}" has been deleted.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: error instanceof Error ? error.message : 'Failed to delete scenario',
        });
      }
    },

    duplicateScenario: (id, newName, includeResults = false) => {
      try {
        const duplicatedScenario = scenarioStorage.duplicateScenario(id, newName, includeResults);

        set((state) => ({
          savedScenarios: {
            ...state.savedScenarios,
            [duplicatedScenario.id]: duplicatedScenario,
          },
        }));

        get().addNotification({
          type: 'success',
          title: 'Scenario Duplicated',
          message: `Scenario "${newName}" has been created as a copy.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Duplication Failed',
          message: error instanceof Error ? error.message : 'Failed to duplicate scenario',
        });
      }
    },

    renameScenario: (id, newName) => {
      try {
        scenarioStorage.renameScenario(id, newName);

        set((state) => ({
          savedScenarios: {
            ...state.savedScenarios,
            [id]: { ...state.savedScenarios[id], name: newName },
          },
        }));

        get().addNotification({
          type: 'success',
          title: 'Scenario Renamed',
          message: `Scenario has been renamed to "${newName}".`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Rename Failed',
          message: error instanceof Error ? error.message : 'Failed to rename scenario',
        });
      }
    },

    toggleTemplate: (id) => {
      try {
        scenarioStorage.toggleTemplate(id);
        get().loadSavedScenarios();

        const isTemplate = get().savedScenarios[id]?.isTemplate;
        get().addNotification({
          type: 'success',
          title: isTemplate ? 'Marked as Template' : 'Unmarked as Template',
          message: `Scenario has been ${isTemplate ? 'marked' : 'unmarked'} as a template.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Update Failed',
          message: error instanceof Error ? error.message : 'Failed to update template status',
        });
      }
    },

    restoreResultAsNewScenario: (resultId, newName) => {
      const { currentScenarioId } = get();
      if (!currentScenarioId) {
        get().addNotification({
          type: 'error',
          title: 'No Current Scenario',
          message: "Select a scenario first to restore a result's configuration.",
        });
        return;
      }

      try {
        const created = scenarioStorage.restoreResultAsNewScenario(currentScenarioId, resultId, newName);

        set((state) => ({
          savedScenarios: {
            ...state.savedScenarios,
            [created.id]: created,
          },
        }));

        get().addNotification({
          type: 'success',
          title: 'Restored as New Scenario',
          message: `Created scenario "${created.name}" from the result's configuration.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Restore Failed',
          message: error instanceof Error ? error.message : 'Could not restore result as new scenario',
        });
      }
    },

    exportScenario: (id) => {
      try {
        const exportedData = scenarioStorage.exportScenario(id);
        const scenarioName = get().savedScenarios[id]?.name || 'scenario';

        const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${scenarioName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        get().addNotification({
          type: 'success',
          title: 'Scenario Exported',
          message: `Scenario "${scenarioName}" has been exported successfully.`,
        });
      } catch (error) {
        get().addNotification({
          type: 'error',
          title: 'Export Failed',
          message: error instanceof Error ? error.message : 'Failed to export scenario',
        });
      }
    },

    importScenario: (file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const exportedData = JSON.parse(content);

          const importedScenario = scenarioStorage.importScenario(exportedData);

          set((state) => ({
            savedScenarios: {
              ...state.savedScenarios,
              [importedScenario.id]: importedScenario,
            },
            ...getScenarioDocumentState(getSavedScenarioDocument(importedScenario), state.attributeDefinitions),
          }));

          get().addNotification({
            type: 'success',
            title: 'Scenario Imported',
            message: `Scenario "${importedScenario.name}" has been imported successfully.`,
          });
        } catch (error) {
          console.error('Import failed:', error);
          get().addNotification({
            type: 'error',
            title: 'Import Failed',
            message: 'Failed to import scenario. Please check the file format.',
          });
        }
      };
      reader.readAsText(file);
    },
  };
}
