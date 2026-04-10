/**
 * Scenario slice - manages the current scenario state and CRUD operations.
 */

import type { Scenario } from "../../types";
import { resolveScenarioWorkspaceState } from "../../services/scenarioAttributes";
import { createDefaultSolverSettings } from "../../services/solverUi";
import type { ScenarioState, ScenarioActions, StoreSlice } from "../types";
import { scenarioStorage } from "../../services/scenarioStorage";
import { initialSolverState } from "./solverSlice";

const DEFAULT_SETTINGS = createDefaultSolverSettings();

function createEmptyScenario(): Scenario {
  return {
    people: [],
    groups: [],
    num_sessions: 3,
    constraints: [],
    settings: DEFAULT_SETTINGS,
  };
}

export const createScenarioSlice: StoreSlice<ScenarioState & ScenarioActions> = (
  set,
  get
) => ({
  scenario: null,

  setScenario: (scenario) => set((state) => {
    const nextWorkspace = resolveScenarioWorkspaceState(scenario, state.attributeDefinitions);
    return {
      scenario: nextWorkspace.scenario,
      attributeDefinitions: nextWorkspace.attributeDefinitions,
    };
  }),

  updateScenario: (updates) => {
    const currentScenario = get().scenario;
    if (currentScenario) {
      const nextWorkspace = resolveScenarioWorkspaceState(
        { ...currentScenario, ...updates },
        get().attributeDefinitions,
      );
      const nextScenario = nextWorkspace.scenario;
      const { currentScenarioId } = get();

      if (currentScenarioId) {
        scenarioStorage.updateScenario(currentScenarioId, nextScenario, nextWorkspace.attributeDefinitions);
      }

      set((state) => ({
        scenario: nextScenario,
        attributeDefinitions: nextWorkspace.attributeDefinitions,
        savedScenarios:
          currentScenarioId && state.savedScenarios[currentScenarioId]
            ? {
                ...state.savedScenarios,
                [currentScenarioId]: {
                  ...state.savedScenarios[currentScenarioId],
                  scenario: nextScenario,
                  attributeDefinitions: nextWorkspace.attributeDefinitions,
                  updatedAt: Date.now(),
                },
              }
            : state.savedScenarios,
      }));
    }
  },

  updateCurrentScenario: (scenarioId, scenario) => {
    const nextWorkspace = resolveScenarioWorkspaceState(scenario, get().attributeDefinitions);
    scenarioStorage.updateScenario(scenarioId, nextWorkspace.scenario, nextWorkspace.attributeDefinitions);
    set((state) => ({
      savedScenarios: state.savedScenarios[scenarioId]
        ? {
            ...state.savedScenarios,
            [scenarioId]: {
              ...state.savedScenarios[scenarioId],
              scenario: nextWorkspace.scenario,
              attributeDefinitions: nextWorkspace.attributeDefinitions,
              updatedAt: Date.now(),
            },
          }
        : state.savedScenarios,
    }));
  },

  resolveScenario: () => {
    const currentScenario = get().scenario;
    if (currentScenario) {
      return currentScenario;
    }

    // Check if we have a current scenario ID that should be loaded
    const { currentScenarioId, savedScenarios } = get();
    if (currentScenarioId && savedScenarios[currentScenarioId]) {
      const savedScenario = savedScenarios[currentScenarioId];
      set({
        scenario: savedScenario.scenario,
        attributeDefinitions: savedScenario.attributeDefinitions,
        currentResultId: null,
        solution: null,
        solverState: initialSolverState,
      });
      return savedScenario.scenario;
    }

    // Check if there are any saved scenarios we can load
    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        scenario: firstScenario.scenario,
        attributeDefinitions: firstScenario.attributeDefinitions,
        currentScenarioId: firstScenario.id,
        currentResultId: null,
        solution: null,
        selectedResultIds: [],
        solverState: initialSolverState,
      });
      return firstScenario.scenario;
    }

    // Only create a new scenario if there are truly no scenarios available
    // and we're not in a loading state
    const { ui } = get();
    if (ui.isLoading) {
      // Still loading, return a minimal scenario temporarily
      const tempScenario: Scenario = {
        people: [],
        groups: [],
        num_sessions: 3,
        constraints: [],
        settings: DEFAULT_SETTINGS,
      };
      return tempScenario;
    }

    const emptyScenario = createEmptyScenario();
    set({ scenario: emptyScenario });
    return emptyScenario;
  },

  ensureScenarioExists: () => {
    const currentScenario = get().scenario;
    if (currentScenario) {
      return currentScenario;
    }

    // Check if we have a current scenario ID that should be loaded
    const { currentScenarioId, savedScenarios } = get();
    if (currentScenarioId && savedScenarios[currentScenarioId]) {
      const savedScenario = savedScenarios[currentScenarioId];
      set({
        scenario: savedScenario.scenario,
        attributeDefinitions: savedScenario.attributeDefinitions,
        currentResultId: null,
        solution: null,
        solverState: initialSolverState,
      });
      return savedScenario.scenario;
    }

    // Check if there are any saved scenarios we can load
    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        scenario: firstScenario.scenario,
        attributeDefinitions: firstScenario.attributeDefinitions,
        currentScenarioId: firstScenario.id,
        currentResultId: null,
        solution: null,
        selectedResultIds: [],
        solverState: initialSolverState,
      });
      return firstScenario.scenario;
    }

    // Create a new scenario if none exists
    const emptyScenario = createEmptyScenario();

    // Create and save the new scenario
    const savedScenario = scenarioStorage.createScenario(
      'Untitled Scenario',
      emptyScenario,
      get().attributeDefinitions,
    );

    // Update the store state
    set({
      scenario: emptyScenario,
      attributeDefinitions: savedScenario.attributeDefinitions,
      currentScenarioId: savedScenario.id,
      currentResultId: null,
      savedScenarios: {
        ...get().savedScenarios,
        [savedScenario.id]: savedScenario,
      },
    });

    // Notify user that a new scenario was created
    get().addNotification({
      type: "info",
      title: "New Scenario Created",
      message: "A new scenario has been created and saved.",
    });

    return emptyScenario;
  },
});
