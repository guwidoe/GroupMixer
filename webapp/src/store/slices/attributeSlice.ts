/**
 * Attribute slice - manages attribute definitions for the active scenario workspace.
 */

import type { AttributeDefinition, Person, Scenario } from '../../types';
import type { AttributeState, AttributeActions, StoreSlice } from '../types';
import { createAttributeDefinition, getAttributeDefinitionName, normalizeAttributeName } from '../../services/scenarioAttributes';

export const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  createAttributeDefinition('gender', ['male', 'female'], 'default-gender'),
  createAttributeDefinition('department', ['engineering', 'marketing', 'sales', 'hr', 'finance'], 'default-department'),
  createAttributeDefinition('seniority', ['junior', 'mid', 'senior', 'lead'], 'default-seniority'),
  createAttributeDefinition('location', ['office', 'remote', 'hybrid'], 'default-location'),
];

function removeAttributeFromScenarioPeople(scenario: Scenario | null, attributeName: string): Scenario | null {
  if (!scenario) {
    return scenario;
  }

  return {
    ...scenario,
    people: scenario.people.map((person) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [attributeName]: _removed, ...restAttrs } = person.attributes || {};
      return { ...person, attributes: { ...restAttrs } } as Person;
    }),
  };
}

export const createAttributeSlice: StoreSlice<AttributeState & AttributeActions> = (set, get) => ({
  attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,

  setAttributeDefinitions: (definitions) => {
    const { currentScenarioId } = get();
    set((state) => ({
      attributeDefinitions: definitions,
      savedScenarios:
        currentScenarioId && state.savedScenarios[currentScenarioId]
          ? {
              ...state.savedScenarios,
              [currentScenarioId]: {
                ...state.savedScenarios[currentScenarioId],
                attributeDefinitions: definitions,
                updatedAt: Date.now(),
              },
            }
          : state.savedScenarios,
    }));
  },

  addAttributeDefinition: (definition) =>
    set((prev) => {
      const normalizedName = normalizeAttributeName(getAttributeDefinitionName(definition));
      const existing = prev.attributeDefinitions.find(
        (candidate) => normalizeAttributeName(getAttributeDefinitionName(candidate)) === normalizedName,
      );
      const newDefinitions = existing
        ? prev.attributeDefinitions.map((candidate) =>
            candidate.id === existing.id
              ? {
                  ...candidate,
                  name: getAttributeDefinitionName(candidate),
                  key: getAttributeDefinitionName(candidate),
                  values: Array.from(new Set([...candidate.values, ...definition.values])).sort((left, right) =>
                    left.localeCompare(right),
                  ),
                }
              : candidate,
          )
        : [...prev.attributeDefinitions, definition];
      const { currentScenarioId } = prev;
      return {
        attributeDefinitions: newDefinitions,
        savedScenarios:
          currentScenarioId && prev.savedScenarios[currentScenarioId]
            ? {
                ...prev.savedScenarios,
                [currentScenarioId]: {
                  ...prev.savedScenarios[currentScenarioId],
                  attributeDefinitions: newDefinitions,
                  updatedAt: Date.now(),
                },
              }
            : prev.savedScenarios,
      };
    }),

  removeAttributeDefinition: (key) =>
    set((prev) => {
      const normalizedKey = normalizeAttributeName(key);
      const definitionToRemove = prev.attributeDefinitions.find(
        (definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) === normalizedKey,
      );
      const updatedAttrDefs = prev.attributeDefinitions.filter(
        (definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) !== normalizedKey,
      );
      const updatedScenario = removeAttributeFromScenarioPeople(
        prev.scenario,
        definitionToRemove ? getAttributeDefinitionName(definitionToRemove) : key,
      );
      const { currentScenarioId } = prev;

      return {
        attributeDefinitions: updatedAttrDefs,
        scenario: updatedScenario,
        savedScenarios:
          currentScenarioId && prev.savedScenarios[currentScenarioId]
            ? {
                ...prev.savedScenarios,
                [currentScenarioId]: {
                  ...prev.savedScenarios[currentScenarioId],
                  scenario: updatedScenario ?? prev.savedScenarios[currentScenarioId].scenario,
                  attributeDefinitions: updatedAttrDefs,
                  updatedAt: Date.now(),
                },
              }
            : prev.savedScenarios,
      };
    }),
});
