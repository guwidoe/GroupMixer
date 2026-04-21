/**
 * Main application store using Zustand slices pattern.
 *
 * The store is composed of multiple slices, each managing a specific domain:
 * - scenarioSlice: Current scenario-document state and CRUD operations
 * - solutionSlice: Current solution state
 * - solverSlice: Solver execution state and progress
 * - uiSlice: UI state, notifications, modal visibility
 * - scenarioManagerSlice: Scenario persistence, results management
 * - attributeSlice: Attribute definitions for person attributes
 * - demoDataSlice: Demo data loading functionality
 * - editorSlice: Manual editor state
 */

import { create, useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import { devtools } from 'zustand/middleware';
import { temporal, type TemporalState } from 'zundo';
import type { AppStore } from './types';
import type { AttributeDefinition, Scenario, Solution } from '../types';
import { buildScenarioContentHash, scenarioStorage } from '../services/scenarioStorage';
import { createDefaultSolverSettings } from '../services/solverUi';

import {
  createScenarioSlice,
  createSolutionSlice,
  createSolverSlice,
  createUISlice,
  createRuntimeCatalogSlice,
  createAttributeSlice,
  createScenarioManagerSlice,
  createDemoDataSlice,
  createEditorSlice,
  initialSolverState,
  initialUIState,
  initialRuntimeCatalogState,
  DEFAULT_ATTRIBUTE_DEFINITIONS,
} from './slices';
import { createScenarioDocument, getSavedScenarioDocument, getScenarioDocumentState } from './scenarioDocument';

export type {
  AppState,
  Scenario,
  ScenarioDocument,
  Solution,
  SolverState,
  Notification,
  Person,
  Group,
  AttributeDefinition,
} from '../types';

export type { AppStore } from './types';

type ScenarioDocumentHistorySnapshot = Pick<AppStore, 'scenarioDocument' | 'scenario' | 'attributeDefinitions'>;

let scenarioDocumentTemporalStore: StoreApi<TemporalState<ScenarioDocumentHistorySnapshot>> | null = null;

function getScenarioDocumentHistorySnapshot(state: AppStore): ScenarioDocumentHistorySnapshot {
  return {
    scenarioDocument: state.scenarioDocument,
    scenario: state.scenario,
    attributeDefinitions: state.attributeDefinitions,
  };
}

function serializeScenarioDocumentHistorySnapshot(snapshot: ScenarioDocumentHistorySnapshot): string {
  return JSON.stringify(snapshot.scenarioDocument);
}

const getInitialState = () => ({
  scenarioDocument: null,
  scenario: null,
  solution: null,
  solverState: initialSolverState,
  ...initialRuntimeCatalogState,
  currentScenarioId: null,
  currentResultId: null,
  savedScenarios: {},
  selectedResultIds: [],
  ui: initialUIState,
  attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,
  demoDropdownOpen: false,
  manualEditorUnsaved: false,
  manualEditorLeaveHook: null,
  setupGridUnsaved: false,
  setupGridLeaveHook: null,
});

function solverStateFromWorkspaceSolution(solution: Solution | null) {
  if (!solution) {
    return initialSolverState;
  }

  return {
    ...initialSolverState,
    isRunning: false,
    isComplete: true,
    currentIteration: solution.iteration_count,
    bestScore: solution.final_score,
    currentScore: solution.final_score,
    elapsedTime: solution.elapsed_time_ms,
    noImprovementCount: solution.benchmark_telemetry?.no_improvement_count ?? 0,
  };
}

function hasScenarioSetupContent(scenario: Scenario | null) {
  if (!scenario) {
    return false;
  }

  const emptyScenario: Scenario = {
    people: [],
    groups: [],
    num_sessions: 3,
    constraints: [],
    settings: createDefaultSolverSettings(),
  };

  return JSON.stringify({
    people: scenario.people,
    groups: scenario.groups,
    num_sessions: scenario.num_sessions,
    objectives: scenario.objectives ?? [],
    constraints: scenario.constraints,
    settings: scenario.settings,
  }) !== JSON.stringify({
    people: emptyScenario.people,
    groups: emptyScenario.groups,
    num_sessions: emptyScenario.num_sessions,
    objectives: emptyScenario.objectives ?? [],
    constraints: emptyScenario.constraints,
    settings: emptyScenario.settings,
  });
}

function createRecoveredWorkspaceName() {
  return `Recovered workspace ${new Date().toLocaleString()}`;
}

export const useAppStore = create<AppStore>()(
  temporal(
    devtools(
      (set, get) => ({
      ...createScenarioSlice(set, get),
      ...createSolutionSlice(set, get),
      ...createSolverSlice(set, get),
      ...createUISlice(set, get),
      ...createRuntimeCatalogSlice(set, get),
      ...createAttributeSlice(set, get),
      ...createScenarioManagerSlice(set, get),
      ...createDemoDataSlice(set, get),
      ...createEditorSlice(set, get),

      undoScenarioDocument: () => {
        scenarioDocumentTemporalStore?.getState().undo();
      },
      redoScenarioDocument: () => {
        scenarioDocumentTemporalStore?.getState().redo();
      },
      clearScenarioDocumentHistory: () => {
        scenarioDocumentTemporalStore?.getState().clear();
      },
      canUndoScenarioDocument: () => Boolean(scenarioDocumentTemporalStore?.getState().pastStates.length),
      canRedoScenarioDocument: () => Boolean(scenarioDocumentTemporalStore?.getState().futureStates.length),

      reset: () => {
        set(getInitialState());
        get().clearScenarioDocumentHistory();
      },

      replaceWorkspace: ({
        scenario,
        solution = null,
        attributeDefinitions,
        currentScenarioId = null,
      }: {
        scenario: Scenario;
        solution?: Solution | null;
        attributeDefinitions?: AttributeDefinition[];
        currentScenarioId?: string | null;
      }) => {
        set((state) => {
          const nextDocument = createScenarioDocument(scenario, attributeDefinitions ?? state.attributeDefinitions);
          return {
            ...getScenarioDocumentState(nextDocument, state.attributeDefinitions),
            solution,
            currentScenarioId,
            currentResultId: null,
            selectedResultIds: [],
            solverState: solverStateFromWorkspaceSolution(solution),
            ui: {
              ...state.ui,
              activeTab: solution ? 'results' : 'scenario',
              warmStartResultId: null,
              showResultComparison: false,
              showScenarioManager: false,
              isLoading: false,
            },
            manualEditorUnsaved: false,
            manualEditorLeaveHook: null,
            setupGridUnsaved: false,
            setupGridLeaveHook: null,
          };
        });
        get().clearScenarioDocumentHistory();
      },

      syncWorkspaceDraft: ({
        scenario,
        solution = null,
        attributeDefinitions,
        currentScenarioId = null,
        scenarioName,
      }) => {
        const matchingScenario = scenarioStorage.findScenarioByDraftIdentity(scenarioName, scenario);
        let savedScenario = currentScenarioId ? scenarioStorage.getScenario(currentScenarioId) : null;

        if (matchingScenario) {
          savedScenario = matchingScenario;
        } else if (savedScenario) {
          const nextDocument = createScenarioDocument(
            scenario,
            attributeDefinitions ?? savedScenario.attributeDefinitions,
          );
          savedScenario = {
            ...savedScenario,
            name: scenarioName,
            scenario: nextDocument.scenario,
            attributeDefinitions: nextDocument.attributeDefinitions,
          };
          scenarioStorage.saveScenario(savedScenario);
        } else {
          const nextDocument = createScenarioDocument(
            scenario,
            attributeDefinitions ?? DEFAULT_ATTRIBUTE_DEFINITIONS,
          );
          savedScenario = scenarioStorage.createScenario(
            scenarioName,
            nextDocument.scenario,
            nextDocument.attributeDefinitions,
          );
          currentScenarioId = savedScenario.id;
        }

        scenarioStorage.setCurrentScenarioId(savedScenario.id);

        set((state) => ({
          ...getScenarioDocumentState(getSavedScenarioDocument(savedScenario), state.attributeDefinitions),
          solution,
          currentScenarioId: savedScenario.id,
          currentResultId: null,
          savedScenarios: {
            ...state.savedScenarios,
            [savedScenario.id]: savedScenario,
          },
          selectedResultIds: [],
          solverState: solverStateFromWorkspaceSolution(solution),
          ui: {
            ...state.ui,
            activeTab: solution ? 'results' : 'scenario',
            warmStartResultId: null,
            showResultComparison: false,
            showScenarioManager: false,
            isLoading: false,
          },
          manualEditorUnsaved: false,
          manualEditorLeaveHook: null,
          setupGridUnsaved: false,
          setupGridLeaveHook: null,
        }));
        get().clearScenarioDocumentHistory();

        return savedScenario.id;
      },

      loadWorkspaceAsNewScenario: ({
        scenario,
        solution = null,
        attributeDefinitions,
        scenarioName,
      }) => {
        const state = get();
        const hadPreviousWorkspace = hasScenarioSetupContent(state.scenario);
        const previousWorkspaceWasPreserved = Boolean(state.currentScenarioId) || hadPreviousWorkspace;
        const nextDocument = createScenarioDocument(scenario, attributeDefinitions ?? state.attributeDefinitions);

        if (state.scenario && buildScenarioContentHash(state.scenario) === buildScenarioContentHash(nextDocument.scenario)) {
          set((current) => ({
            ...getScenarioDocumentState(nextDocument, current.attributeDefinitions),
            solution,
            currentResultId: null,
            selectedResultIds: [],
            solverState: solverStateFromWorkspaceSolution(solution),
            ui: {
              ...current.ui,
              activeTab: solution ? 'results' : 'scenario',
              warmStartResultId: null,
              showResultComparison: false,
              showScenarioManager: false,
              isLoading: false,
            },
            manualEditorUnsaved: false,
            manualEditorLeaveHook: null,
            setupGridUnsaved: false,
            setupGridLeaveHook: null,
          }));
          get().clearScenarioDocumentHistory();

          return state.currentScenarioId ?? null;
        }

        if (!state.currentScenarioId && hadPreviousWorkspace) {
          const recoveredDocument = createScenarioDocument(
            state.scenario!,
            state.attributeDefinitions,
          );
          const recoveredScenario = scenarioStorage.createScenario(
            createRecoveredWorkspaceName(),
            recoveredDocument.scenario,
            recoveredDocument.attributeDefinitions,
          );

          set((current) => ({
            savedScenarios: {
              ...current.savedScenarios,
              [recoveredScenario.id]: recoveredScenario,
            },
          }));
        }

        const savedScenario = scenarioStorage.createScenario(
          scenarioName,
          nextDocument.scenario,
          nextDocument.attributeDefinitions,
        );

        scenarioStorage.setCurrentScenarioId(savedScenario.id);

        set((current) => ({
          ...getScenarioDocumentState(getSavedScenarioDocument(savedScenario), current.attributeDefinitions),
          solution,
          currentScenarioId: savedScenario.id,
          currentResultId: null,
          savedScenarios: {
            ...current.savedScenarios,
            [savedScenario.id]: savedScenario,
          },
          selectedResultIds: [],
          solverState: solverStateFromWorkspaceSolution(solution),
          ui: {
            ...current.ui,
            activeTab: solution ? 'results' : 'scenario',
            warmStartResultId: null,
            showResultComparison: false,
            showScenarioManager: false,
            isLoading: false,
          },
          manualEditorUnsaved: false,
          manualEditorLeaveHook: null,
          setupGridUnsaved: false,
          setupGridLeaveHook: null,
        }));
        get().clearScenarioDocumentHistory();

        get().addNotification({
          type: 'success',
          title: 'Landing Setup Loaded',
          message: previousWorkspaceWasPreserved
            ? 'Loaded the landing-page setup into a new scenario. Your previous settings were preserved and can be restored from Scenario Manager.'
            : 'Loaded the landing-page setup into a new scenario.',
        });

        return savedScenario.id;
      },

      applySessionReductionScenario: (scenario) => {
        const state = get();
        const nextDocument = createScenarioDocument(scenario, state.attributeDefinitions);

        if (state.currentScenarioId) {
          scenarioStorage.updateScenario(
            state.currentScenarioId,
            nextDocument.scenario,
            nextDocument.attributeDefinitions,
          );
        }

        set((current) => ({
          ...getScenarioDocumentState(nextDocument, current.attributeDefinitions),
          solution: null,
          currentResultId: null,
          selectedResultIds: [],
          solverState: initialSolverState,
          savedScenarios:
            current.currentScenarioId && current.savedScenarios[current.currentScenarioId]
              ? {
                  ...current.savedScenarios,
                  [current.currentScenarioId]: {
                    ...current.savedScenarios[current.currentScenarioId],
                    scenario: nextDocument.scenario,
                    attributeDefinitions: nextDocument.attributeDefinitions,
                    updatedAt: Date.now(),
                  },
                }
              : current.savedScenarios,
          ui: {
            ...current.ui,
            activeTab: 'scenario',
            warmStartResultId: null,
            showResultComparison: false,
          },
          manualEditorUnsaved: false,
          manualEditorLeaveHook: null,
        }));
        get().clearScenarioDocumentHistory();
      },

      initializeApp: () => {
        window.setTimeout(() => {
          get().loadSavedScenarios();
        }, 0);
      },
      }),
      {
        name: 'people-distributor-store',
      },
    ),
    {
      partialize: getScenarioDocumentHistorySnapshot,
      equality: (left, right) => (
        serializeScenarioDocumentHistorySnapshot(left) === serializeScenarioDocumentHistorySnapshot(right)
      ),
    },
  ),
);

scenarioDocumentTemporalStore = useAppStore.temporal;

export function useScenarioDocumentHistory<T>(
  selector: (state: TemporalState<ScenarioDocumentHistorySnapshot>) => T,
) {
  return useStore(useAppStore.temporal, selector);
}
