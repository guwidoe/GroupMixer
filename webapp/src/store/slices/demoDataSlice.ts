/**
 * Demo Data slice - handles loading and generating demo/sample data.
 */

import type { Scenario, Person, Group } from "../../types";
import type { DemoDataState, DemoDataActions, StoreSlice } from "../types";
import { scenarioStorage } from "../../services/scenarioStorage";

export const createDemoDataSlice: StoreSlice<DemoDataState & DemoDataActions> = (
  set,
  get
) => ({
  demoDropdownOpen: false,

  setDemoDropdownOpen: (open) => set({ demoDropdownOpen: open }),

  generateDemoData: async () => {
    try {
      const { extractAttributesFromScenario, mergeAttributeDefinitions } =
        await import("../../services/demoDataService");

      const demoGroups: Group[] = [
        { id: "team-alpha", size: 4 },
        { id: "team-beta", size: 4 },
        { id: "team-gamma", size: 4 },
      ];

      const demoPeople: Person[] = [
        {
          id: "alice",
          attributes: {
            name: "Alice Johnson",
            gender: "female",
            department: "engineering",
            seniority: "senior",
          },
        },
        {
          id: "bob",
          attributes: {
            name: "Bob Smith",
            gender: "male",
            department: "marketing",
            seniority: "mid",
          },
        },
        {
          id: "charlie",
          attributes: {
            name: "Charlie Brown",
            gender: "male",
            department: "engineering",
            seniority: "junior",
          },
        },
        {
          id: "diana",
          attributes: {
            name: "Diana Prince",
            gender: "female",
            department: "sales",
            seniority: "lead",
          },
        },
        {
          id: "eve",
          attributes: {
            name: "Eve Davis",
            gender: "female",
            department: "hr",
            seniority: "mid",
          },
        },
        {
          id: "frank",
          attributes: {
            name: "Frank Miller",
            gender: "male",
            department: "finance",
            seniority: "senior",
          },
        },
        {
          id: "grace",
          attributes: {
            name: "Grace Lee",
            gender: "female",
            department: "engineering",
            seniority: "junior",
          },
        },
        {
          id: "henry",
          attributes: {
            name: "Henry Wilson",
            gender: "male",
            department: "marketing",
            seniority: "senior",
          },
        },
        {
          id: "iris",
          attributes: {
            name: "Iris Chen",
            gender: "female",
            department: "sales",
            seniority: "mid",
          },
        },
        {
          id: "jack",
          attributes: {
            name: "Jack Taylor",
            gender: "male",
            department: "hr",
            seniority: "junior",
          },
        },
        {
          id: "kate",
          attributes: {
            name: "Kate Anderson",
            gender: "female",
            department: "finance",
            seniority: "lead",
          },
        },
        {
          id: "leo",
          attributes: {
            name: "Leo Rodriguez",
            gender: "male",
            department: "engineering",
            seniority: "mid",
            location: "remote",
          },
          sessions: [1, 2], // Late arrival - misses first session
        },
      ];

      const demoScenario: Scenario = {
        people: demoPeople,
        groups: demoGroups,
        num_sessions: 3,
        constraints: [
          // Limit repeat encounters
          {
            type: "RepeatEncounter",
            max_allowed_encounters: 1,
            penalty_function: "squared",
            penalty_weight: 1.0,
          },
          // Keep Alice and Bob together (they're project partners)
          {
            type: "MustStayTogether",
            people: ["alice", "bob"],
            sessions: [0, 1], // Only for first two sessions
          },
          // Charlie and Diana can't be together (personality conflict)
          {
            type: "ShouldNotBeTogether",
            people: ["charlie", "diana"],
            penalty_weight: 500.0,
          },
          // Maintain gender balance in team-alpha
          {
            type: "AttributeBalance",
            group_id: "team-alpha",
            attribute_key: "gender",
            desired_values: { male: 2, female: 2 },
            penalty_weight: 50.0,
            mode: "exact",
          },
        ],
        settings: {
          solver_type: "SimulatedAnnealing",
          stop_conditions: {
            max_iterations: 10000,
            time_limit_seconds: 30,
            no_improvement_iterations: 1000,
          },
          solver_params: {
            SimulatedAnnealing: {
              initial_temperature: 1.0,
              final_temperature: 0.01,
              cooling_schedule: "geometric",
              reheat_after_no_improvement: 0,
            },
          },
          logging: {
            log_frequency: 1000,
            log_initial_state: true,
            log_duration_and_score: true,
            display_final_schedule: true,
            log_initial_score_breakdown: true,
            log_final_score_breakdown: true,
            log_stop_condition: true,
          },
        },
      };

      // Extract attributes from the demo scenario
      const extractedAttributes = extractAttributesFromScenario(demoScenario);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the scenario and the merged attributes
      // Clear solution since it's no longer valid for the new scenario
      set({
        scenario: demoScenario,
        attributeDefinitions: mergedAttributes,
        solution: null,
      });

      get().addNotification({
        type: "success",
        title: "Demo Data Loaded",
        message:
          "Generated sample scenario with 12 people, 3 groups, and various constraints",
      });
    } catch (error) {
      console.error("Failed to generate demo data:", error);
      get().addNotification({
        type: "error",
        title: "Demo Data Generation Failed",
        message: "Failed to generate demo data. Please try again.",
      });
    }
  },

  loadDemoCase: async (demoCaseId) => {
    try {
      const {
        loadDemoCase,
        extractAttributesFromScenario,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      set({ demoDropdownOpen: false });

      const scenario = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded scenario
      const extractedAttributes = extractAttributesFromScenario(scenario);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the scenario and the merged attributes
      // Clear solution since it's no longer valid for the new scenario
      set({
        scenario,
        attributeDefinitions: mergedAttributes,
        solution: null,
      });

      // Check if any new attributes were added
      const newAttributeKeys = extractedAttributes
        .filter(
          (extracted) =>
            !currentAttributes.find(
              (current) => current.key === extracted.key
            )
        )
        .map((attr) => attr.key);

      let message = `Loaded demo case with ${scenario.people.length} people and ${scenario.groups.length} groups`;
      if (newAttributeKeys.length > 0) {
        message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
      }

      get().addNotification({
        type: "success",
        title: "Demo Case Loaded",
        message,
      });
    } catch (error) {
      console.error("Failed to load demo case:", error);
      set({ demoDropdownOpen: false });

      get().addNotification({
        type: "error",
        title: "Demo Case Load Failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },

  loadDemoCaseOverwrite: async (demoCaseId) => {
    try {
      const {
        loadDemoCase,
        extractAttributesFromScenario,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      const scenario = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded scenario
      const extractedAttributes = extractAttributesFromScenario(scenario);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the scenario and the merged attributes
      // Clear solution since it's no longer valid for the new scenario
      set({
        scenario,
        attributeDefinitions: mergedAttributes,
        solution: null,
      });

      // Check if any new attributes were added
      const newAttributeKeys = extractedAttributes
        .filter(
          (extracted) =>
            !currentAttributes.find(
              (current) => current.key === extracted.key
            )
        )
        .map((attr) => attr.key);

      let message = `Overwrote current scenario with demo case: ${scenario.people.length} people and ${scenario.groups.length} groups`;
      if (newAttributeKeys.length > 0) {
        message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
      }

      get().addNotification({
        type: "success",
        title: "Demo Case Loaded",
        message,
      });
    } catch (error) {
      console.error("Failed to load demo case:", error);
      get().addNotification({
        type: "error",
        title: "Demo Case Load Failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },

  loadDemoCaseNewScenario: async (demoCaseId) => {
    try {
      const {
        loadDemoCase,
        extractAttributesFromScenario,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      const demoScenario = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded scenario
      const extractedAttributes = extractAttributesFromScenario(demoScenario);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Save current scenario if it has content (keep its existing name)
      const currentScenario = get().scenario;
      const currentScenarioId = get().currentScenarioId;
      if (
        currentScenario &&
        (currentScenario.people.length > 0 ||
          currentScenario.groups.length > 0)
      ) {
        try {
          // If current scenario is already saved, just update it
          if (currentScenarioId) {
            get().updateCurrentScenario(currentScenarioId, currentScenario);
          } else {
            // If not saved, create a new saved scenario with a generic name
            const savedScenario = scenarioStorage.createScenario(
              "Untitled Scenario",
              currentScenario
            );
            set((state) => ({
              savedScenarios: {
                ...state.savedScenarios,
                [savedScenario.id]: savedScenario,
              },
            }));
          }
        } catch (error) {
          console.error("Failed to save current scenario:", error);
        }
      }

      // Create a new scenario with the demo data
      const newSavedScenario = scenarioStorage.createScenario(
        "Unnamed Scenario",
        demoScenario
      );

      // Update the store with the new scenario and merged attributes
      const updatedSavedScenarios = {
        ...get().savedScenarios,
        [newSavedScenario.id]: newSavedScenario,
      };

      set({
        scenario: demoScenario,
        currentScenarioId: newSavedScenario.id,
        attributeDefinitions: mergedAttributes,
        savedScenarios: updatedSavedScenarios,
        solution: null,
      });

      // Check if any new attributes were added
      const newAttributeKeys = extractedAttributes
        .filter(
          (extracted) =>
            !currentAttributes.find(
              (current) => current.key === extracted.key
            )
        )
        .map((attr) => attr.key);

      let message = `Loaded demo case in new scenario: ${demoScenario.people.length} people and ${demoScenario.groups.length} groups`;
      if (newAttributeKeys.length > 0) {
        message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
      }
      if (
        currentScenario &&
        (currentScenario.people.length > 0 ||
          currentScenario.groups.length > 0)
      ) {
        if (currentScenarioId) {
          message += `. Current scenario "${currentScenarioId}" has been saved`;
        } else {
          message += `. Current scenario saved as "Untitled Scenario"`;
        }
      }

      get().addNotification({
        type: "success",
        title: "Demo Case Loaded",
        message,
      });
    } catch (error) {
      console.error("Failed to load demo case:", error);
      get().addNotification({
        type: "error",
        title: "Demo Case Load Failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
});
