/**
 * Main application store using Zustand slices pattern.
 *
 * The store is composed of multiple slices, each managing a specific domain:
 * - scenarioSlice: Current scenario state and CRUD operations
 * - solutionSlice: Current solution state
 * - solverSlice: Solver execution state and progress
 * - uiSlice: UI state, notifications, modal visibility
 * - scenarioManagerSlice: Scenario persistence, results management
 * - attributeSlice: Attribute definitions for person attributes
 * - demoDataSlice: Demo data loading functionality
 * - editorSlice: Manual editor state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AppStore } from './types';
import type { AttributeDefinition, Scenario, Solution } from '../types';
import { resolveScenarioWorkspaceState } from '../services/scenarioAttributes';
import { scenarioStorage } from '../services/scenarioStorage';

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

export type {
  AppState,
  Scenario,
  Solution,
  SolverState,
  Notification,
  Person,
  Group,
  AttributeDefinition,
} from '../types';

export type { AppStore } from './types';

const getInitialState = () => ({
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

export const useAppStore = create<AppStore>()(
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

      reset: () => set(getInitialState()),

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
      }) =>
        set((state) => {
          const nextWorkspace = resolveScenarioWorkspaceState(scenario, attributeDefinitions ?? state.attributeDefinitions);
          return {
            scenario: nextWorkspace.scenario,
            solution,
            currentScenarioId,
            currentResultId: null,
            selectedResultIds: [],
            solverState: solverStateFromWorkspaceSolution(solution),
            attributeDefinitions: nextWorkspace.attributeDefinitions,
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
          };
        }),

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
          const nextWorkspace = resolveScenarioWorkspaceState(
            scenario,
            attributeDefinitions ?? savedScenario.attributeDefinitions,
          );
          savedScenario = {
            ...savedScenario,
            name: scenarioName,
            scenario: nextWorkspace.scenario,
            attributeDefinitions: nextWorkspace.attributeDefinitions,
          };
          scenarioStorage.saveScenario(savedScenario);
        } else {
          const nextWorkspace = resolveScenarioWorkspaceState(
            scenario,
            attributeDefinitions ?? DEFAULT_ATTRIBUTE_DEFINITIONS,
          );
          savedScenario = scenarioStorage.createScenario(
            scenarioName,
            nextWorkspace.scenario,
            nextWorkspace.attributeDefinitions,
          );
          currentScenarioId = savedScenario.id;
        }

        scenarioStorage.setCurrentScenarioId(savedScenario.id);

        set((state) => ({
          scenario: savedScenario.scenario,
          solution,
          currentScenarioId: savedScenario.id,
          currentResultId: null,
          savedScenarios: {
            ...state.savedScenarios,
            [savedScenario.id]: savedScenario,
          },
          selectedResultIds: [],
          solverState: solverStateFromWorkspaceSolution(solution),
          attributeDefinitions: savedScenario.attributeDefinitions,
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
        }));

        return savedScenario.id;
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
);
