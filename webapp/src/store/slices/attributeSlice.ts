/**
 * Attribute slice - manages attribute definitions for person attributes.
 */

import type { AttributeDefinition, Person, Problem } from "../../types";
import type { AttributeState, AttributeActions, StoreSlice } from "../types";

const ATTRIBUTE_DEFS_KEY = "people-distributor-attribute-definitions";

const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  { key: "gender", values: ["male", "female"] },
  {
    key: "department",
    values: ["engineering", "marketing", "sales", "hr", "finance"],
  },
  { key: "seniority", values: ["junior", "mid", "senior", "lead"] },
  { key: "location", values: ["office", "remote", "hybrid"] },
];

export function loadAttributeDefinitions(): AttributeDefinition[] {
  try {
    const stored = localStorage.getItem(ATTRIBUTE_DEFS_KEY);
    if (stored) {
      return JSON.parse(stored) as AttributeDefinition[];
    }
  } catch (error) {
    console.error("Failed to load attribute definitions from storage:", error);
  }
  return DEFAULT_ATTRIBUTE_DEFINITIONS;
}

function saveAttributeDefinitions(definitions: AttributeDefinition[]): void {
  try {
    localStorage.setItem(ATTRIBUTE_DEFS_KEY, JSON.stringify(definitions));
  } catch (error) {
    console.error("Failed to save attribute definitions:", error);
  }
}

export const createAttributeSlice: StoreSlice<AttributeState & AttributeActions> = (
  set
) => ({
  attributeDefinitions: loadAttributeDefinitions(),

  setAttributeDefinitions: (definitions) => {
    saveAttributeDefinitions(definitions);
    set({ attributeDefinitions: definitions });
  },

  addAttributeDefinition: (definition) =>
    set((prev) => {
      const newDefs = [...prev.attributeDefinitions, definition];
      saveAttributeDefinitions(newDefs);
      return { attributeDefinitions: newDefs };
    }),

  removeAttributeDefinition: (key) =>
    set((prev) => {
      const updatedAttrDefs = prev.attributeDefinitions.filter(
        (def) => def.key !== key
      );

      saveAttributeDefinitions(updatedAttrDefs);

      let updatedProblem = prev.problem;
      if (updatedProblem) {
        updatedProblem = {
          ...updatedProblem,
          people: updatedProblem.people.map((p) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [key]: _removed, ...restAttrs } = p.attributes || {};
            return { ...p, attributes: { ...restAttrs } } as Person;
          }),
        } as Problem;
      }

      return {
        attributeDefinitions: updatedAttrDefs,
        problem: updatedProblem,
      };
    }),
});

// Export for use in import/export
export { ATTRIBUTE_DEFS_KEY };
