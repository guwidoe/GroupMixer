/**
 * Demo Data slice - handles loading and generating demo/sample data.
 */

import type { Scenario, Person, Group } from '../../types';
import { reconcileScenarioAttributeDefinitions } from '../../services/scenarioAttributes';
import { createDefaultSolverSettings } from '../../services/solverUi';
import type { DemoDataState, DemoDataActions, StoreSlice } from '../types';
import { scenarioStorage } from '../../services/scenarioStorage';

export const createDemoDataSlice: StoreSlice<DemoDataState & DemoDataActions> = (
  set,
  get,
) => ({
  demoDropdownOpen: false,

  setDemoDropdownOpen: (open) => set({ demoDropdownOpen: open }),

  generateDemoData: async () => {
    try {
      const demoGroups: Group[] = [
        { id: 'team-alpha', size: 4 },
        { id: 'team-beta', size: 4 },
        { id: 'team-gamma', size: 4 },
      ];

      const demoPeople: Person[] = [
        {
          id: 'alice',
          attributes: {
            name: 'Alice Johnson',
            gender: 'female',
            department: 'engineering',
            seniority: 'senior',
          },
        },
        {
          id: 'bob',
          attributes: {
            name: 'Bob Smith',
            gender: 'male',
            department: 'marketing',
            seniority: 'mid',
          },
        },
        {
          id: 'charlie',
          attributes: {
            name: 'Charlie Brown',
            gender: 'male',
            department: 'engineering',
            seniority: 'junior',
          },
        },
        {
          id: 'diana',
          attributes: {
            name: 'Diana Prince',
            gender: 'female',
            department: 'sales',
            seniority: 'lead',
          },
        },
        {
          id: 'eve',
          attributes: {
            name: 'Eve Davis',
            gender: 'female',
            department: 'hr',
            seniority: 'mid',
          },
        },
        {
          id: 'frank',
          attributes: {
            name: 'Frank Miller',
            gender: 'male',
            department: 'finance',
            seniority: 'senior',
          },
        },
        {
          id: 'grace',
          attributes: {
            name: 'Grace Lee',
            gender: 'female',
            department: 'engineering',
            seniority: 'junior',
          },
        },
        {
          id: 'henry',
          attributes: {
            name: 'Henry Wilson',
            gender: 'male',
            department: 'marketing',
            seniority: 'senior',
          },
        },
        {
          id: 'iris',
          attributes: {
            name: 'Iris Chen',
            gender: 'female',
            department: 'sales',
            seniority: 'mid',
          },
        },
        {
          id: 'jack',
          attributes: {
            name: 'Jack Taylor',
            gender: 'male',
            department: 'hr',
            seniority: 'junior',
          },
        },
        {
          id: 'kate',
          attributes: {
            name: 'Kate Anderson',
            gender: 'female',
            department: 'finance',
            seniority: 'lead',
          },
        },
        {
          id: 'leo',
          attributes: {
            name: 'Leo Rodriguez',
            gender: 'male',
            department: 'engineering',
            seniority: 'mid',
            location: 'remote',
          },
          sessions: [1, 2],
        },
      ];

      const demoScenario: Scenario = {
        people: demoPeople,
        groups: demoGroups,
        num_sessions: 3,
        constraints: [
          {
            type: 'RepeatEncounter',
            max_allowed_encounters: 1,
            penalty_function: 'squared',
            penalty_weight: 1.0,
          },
          {
            type: 'MustStayTogether',
            people: ['alice', 'bob'],
            sessions: [0, 1],
          },
          {
            type: 'ShouldNotBeTogether',
            people: ['charlie', 'diana'],
            penalty_weight: 500.0,
          },
          {
            type: 'AttributeBalance',
            group_id: 'team-alpha',
            attribute_key: 'gender',
            desired_values: { male: 2, female: 2 },
            penalty_weight: 50.0,
            mode: 'exact',
          },
        ],
        settings: {
          ...createDefaultSolverSettings(),
          stop_conditions: {
            ...createDefaultSolverSettings().stop_conditions,
            no_improvement_iterations: 1000,
          },
        },
      };

      set({
        scenario: demoScenario,
        attributeDefinitions: reconcileScenarioAttributeDefinitions(demoScenario),
        solution: null,
      });

      get().addNotification({
        type: 'success',
        title: 'Demo Data Loaded',
        message: 'Generated sample scenario with 12 people, 3 groups, and various constraints',
      });
    } catch (error) {
      console.error('Failed to generate demo data:', error);
      get().addNotification({
        type: 'error',
        title: 'Demo Data Generation Failed',
        message: 'Failed to generate demo data. Please try again.',
      });
    }
  },

  loadDemoCase: async (demoCaseId) => {
    try {
      const { loadDemoCase } = await import('../../services/demoDataService');

      set({ demoDropdownOpen: false });

      const scenario = await loadDemoCase(demoCaseId);
      const attributeDefinitions = reconcileScenarioAttributeDefinitions(scenario);

      set({
        scenario,
        attributeDefinitions,
        solution: null,
      });

      get().addNotification({
        type: 'success',
        title: 'Demo Case Loaded',
        message: `Loaded demo case with ${scenario.people.length} people, ${scenario.groups.length} groups, and ${attributeDefinitions.length} attributes`,
      });
    } catch (error) {
      console.error('Failed to load demo case:', error);
      set({ demoDropdownOpen: false });

      get().addNotification({
        type: 'error',
        title: 'Demo Case Load Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },

  loadDemoCaseOverwrite: async (demoCaseId) => {
    try {
      const { loadDemoCase } = await import('../../services/demoDataService');

      const scenario = await loadDemoCase(demoCaseId);
      const attributeDefinitions = reconcileScenarioAttributeDefinitions(scenario);

      set({
        scenario,
        attributeDefinitions,
        solution: null,
      });

      get().addNotification({
        type: 'success',
        title: 'Demo Case Loaded',
        message: `Overwrote the current scenario with ${scenario.people.length} people, ${scenario.groups.length} groups, and ${attributeDefinitions.length} attributes`,
      });
    } catch (error) {
      console.error('Failed to load demo case:', error);
      get().addNotification({
        type: 'error',
        title: 'Demo Case Load Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },

  loadDemoCaseNewScenario: async (demoCaseId) => {
    try {
      const { loadDemoCase } = await import('../../services/demoDataService');

      const demoScenario = await loadDemoCase(demoCaseId);
      const attributeDefinitions = reconcileScenarioAttributeDefinitions(demoScenario);

      const currentScenario = get().scenario;
      const currentScenarioId = get().currentScenarioId;
      if (
        currentScenario &&
        (currentScenario.people.length > 0 || currentScenario.groups.length > 0)
      ) {
        try {
          if (currentScenarioId) {
            get().updateCurrentScenario(currentScenarioId, currentScenario);
          } else {
            const savedScenario = scenarioStorage.createScenario(
              'Untitled Scenario',
              currentScenario,
              get().attributeDefinitions,
            );
            set((state) => ({
              savedScenarios: {
                ...state.savedScenarios,
                [savedScenario.id]: savedScenario,
              },
            }));
          }
        } catch (error) {
          console.error('Failed to save current scenario:', error);
        }
      }

      const newSavedScenario = scenarioStorage.createScenario(
        'Unnamed Scenario',
        demoScenario,
        attributeDefinitions,
      );

      const updatedSavedScenarios = {
        ...get().savedScenarios,
        [newSavedScenario.id]: newSavedScenario,
      };

      set({
        scenario: demoScenario,
        currentScenarioId: newSavedScenario.id,
        attributeDefinitions,
        savedScenarios: updatedSavedScenarios,
        solution: null,
      });

      let message = `Loaded demo case in a new scenario with ${demoScenario.people.length} people, ${demoScenario.groups.length} groups, and ${attributeDefinitions.length} attributes`;
      if (
        currentScenario &&
        (currentScenario.people.length > 0 || currentScenario.groups.length > 0)
      ) {
        if (currentScenarioId) {
          message += `. Current scenario "${currentScenarioId}" has been saved`;
        } else {
          message += '. Current scenario saved as "Untitled Scenario"';
        }
      }

      get().addNotification({
        type: 'success',
        title: 'Demo Case Loaded',
        message,
      });
    } catch (error) {
      console.error('Failed to load demo case:', error);
      get().addNotification({
        type: 'error',
        title: 'Demo Case Load Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },
});
