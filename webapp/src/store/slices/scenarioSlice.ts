/**
 * Scenario slice - manages the current scenario state and CRUD operations.
 */

import type { Scenario } from "../../types";
import type { ScenarioState, ScenarioActions, StoreSlice } from "../types";
import { scenarioStorage } from "../../services/scenarioStorage";

const DEFAULT_SETTINGS = {
  solver_type: "SimulatedAnnealing",
  stop_conditions: {
    max_iterations: 10000,
    time_limit_seconds: 30,
    no_improvement_iterations: 5000,
  },
  solver_params: {
    SimulatedAnnealing: {
      initial_temperature: 1.0,
      final_temperature: 0.01,
      cooling_schedule: "geometric",
      reheat_cycles: 0,
      reheat_after_no_improvement: 0,
    },
  },
};

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

  setScenario: (scenario) => set({ scenario }),

  updateScenario: (updates) => {
    const currentScenario = get().scenario;
    if (currentScenario) {
      set({ scenario: { ...currentScenario, ...updates } });
    }
  },

  updateCurrentScenario: (scenarioId, scenario) => {
    scenarioStorage.updateScenario(scenarioId, scenario);
    set({ scenario });
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
      set({ scenario: savedScenario.scenario });
      return savedScenario.scenario;
    }

    // Check if there are any saved scenarios we can load
    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        scenario: firstScenario.scenario,
        currentScenarioId: firstScenario.id,
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
      set({ scenario: savedScenario.scenario });
      return savedScenario.scenario;
    }

    // Check if there are any saved scenarios we can load
    const allScenarios = Object.values(savedScenarios);
    if (allScenarios.length > 0) {
      const firstScenario = allScenarios[0];
      scenarioStorage.setCurrentScenarioId(firstScenario.id);
      set({
        scenario: firstScenario.scenario,
        currentScenarioId: firstScenario.id,
      });
      return firstScenario.scenario;
    }

    // Create a new scenario if none exists
    const emptyScenario = createEmptyScenario();

    // Create and save the new scenario
    const savedScenario = scenarioStorage.createScenario(
      "Untitled Scenario",
      emptyScenario
    );

    // Update the store state
    set({
      scenario: emptyScenario,
      currentScenarioId: savedScenario.id,
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
