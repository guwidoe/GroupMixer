/**
 * Demo Data slice - handles loading and generating demo/sample data.
 */

import type { Problem, Person, Group } from "../../types";
import type { DemoDataState, DemoDataActions, StoreSlice } from "../types";
import { problemStorage } from "../../services/problemStorage";

export const createDemoDataSlice: StoreSlice<DemoDataState & DemoDataActions> = (
  set,
  get
) => ({
  demoDropdownOpen: false,

  setDemoDropdownOpen: (open) => set({ demoDropdownOpen: open }),

  generateDemoData: async () => {
    try {
      const { extractAttributesFromProblem, mergeAttributeDefinitions } =
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

      const demoProblem: Problem = {
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

      // Extract attributes from the demo problem
      const extractedAttributes = extractAttributesFromProblem(demoProblem);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the problem and the merged attributes
      // Clear solution since it's no longer valid for the new problem
      set({
        problem: demoProblem,
        attributeDefinitions: mergedAttributes,
        solution: null,
      });

      get().addNotification({
        type: "success",
        title: "Demo Data Loaded",
        message:
          "Generated sample problem with 12 people, 3 groups, and various constraints",
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
        extractAttributesFromProblem,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      set({ demoDropdownOpen: false });

      const problem = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded problem
      const extractedAttributes = extractAttributesFromProblem(problem);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the problem and the merged attributes
      // Clear solution since it's no longer valid for the new problem
      set({
        problem,
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

      let message = `Loaded demo case with ${problem.people.length} people and ${problem.groups.length} groups`;
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
        extractAttributesFromProblem,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      const problem = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded problem
      const extractedAttributes = extractAttributesFromProblem(problem);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Update the store with both the problem and the merged attributes
      // Clear solution since it's no longer valid for the new problem
      set({
        problem,
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

      let message = `Overwrote current problem with demo case: ${problem.people.length} people and ${problem.groups.length} groups`;
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

  loadDemoCaseNewProblem: async (demoCaseId) => {
    try {
      const {
        loadDemoCase,
        extractAttributesFromProblem,
        mergeAttributeDefinitions,
      } = await import("../../services/demoDataService");

      const demoProblem = await loadDemoCase(demoCaseId);

      // Extract attributes from the loaded problem
      const extractedAttributes = extractAttributesFromProblem(demoProblem);

      // Merge with existing attribute definitions
      const currentAttributes = get().attributeDefinitions;
      const mergedAttributes = mergeAttributeDefinitions(
        currentAttributes,
        extractedAttributes
      );

      // Save current problem if it has content (keep its existing name)
      const currentProblem = get().problem;
      const currentProblemId = get().currentProblemId;
      if (
        currentProblem &&
        (currentProblem.people.length > 0 ||
          currentProblem.groups.length > 0)
      ) {
        try {
          // If current problem is already saved, just update it
          if (currentProblemId) {
            get().updateCurrentProblem(currentProblemId, currentProblem);
          } else {
            // If not saved, create a new saved problem with a generic name
            const savedProblem = problemStorage.createProblem(
              "Untitled Problem",
              currentProblem
            );
            set((state) => ({
              savedProblems: {
                ...state.savedProblems,
                [savedProblem.id]: savedProblem,
              },
            }));
          }
        } catch (error) {
          console.error("Failed to save current problem:", error);
        }
      }

      // Create a new problem with the demo data
      const newSavedProblem = problemStorage.createProblem(
        "Unnamed Problem",
        demoProblem
      );

      // Update the store with the new problem and merged attributes
      const updatedSavedProblems = {
        ...get().savedProblems,
        [newSavedProblem.id]: newSavedProblem,
      };

      set({
        problem: demoProblem,
        currentProblemId: newSavedProblem.id,
        attributeDefinitions: mergedAttributes,
        savedProblems: updatedSavedProblems,
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

      let message = `Loaded demo case in new problem: ${demoProblem.people.length} people and ${demoProblem.groups.length} groups`;
      if (newAttributeKeys.length > 0) {
        message += `. Added new attributes: ${newAttributeKeys.join(", ")}`;
      }
      if (
        currentProblem &&
        (currentProblem.people.length > 0 ||
          currentProblem.groups.length > 0)
      ) {
        if (currentProblemId) {
          message += `. Current problem "${currentProblemId}" has been saved`;
        } else {
          message += `. Current problem saved as "Untitled Problem"`;
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
