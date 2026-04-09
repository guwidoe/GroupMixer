/**
 * Attribute slice - manages attribute definitions for the active scenario workspace.
 */

import type { AttributeDefinition } from '../../types';
import type { AttributeState, AttributeActions, StoreSlice } from '../types';
import {
  coerceAttributeDefinitions,
  createAttributeDefinition,
  getAttributeDefinitionName,
  normalizeAttributeName,
  reconcileScenarioAttributeDefinitions,
  reconcileScenarioAttributeState,
  removeAttributeDefinitionFromScenario,
} from '../../services/scenarioAttributes';

export const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  createAttributeDefinition('gender', ['male', 'female'], 'default-gender'),
  createAttributeDefinition('department', ['engineering', 'marketing', 'sales', 'hr', 'finance'], 'default-department'),
  createAttributeDefinition('seniority', ['junior', 'mid', 'senior', 'lead'], 'default-seniority'),
  createAttributeDefinition('location', ['office', 'remote', 'hybrid'], 'default-location'),
];

export const createAttributeSlice: StoreSlice<AttributeState & AttributeActions> = (set, get) => ({
  attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,

  setAttributeDefinitions: (definitions) => {
    const { currentScenarioId } = get();
    set((state) => {
      const nextScenario = state.scenario
        ? reconcileScenarioAttributeState(state.scenario, coerceAttributeDefinitions(definitions))
        : state.scenario;
      const nextDefinitions = nextScenario
        ? reconcileScenarioAttributeDefinitions(nextScenario, definitions)
        : coerceAttributeDefinitions(definitions);

      return {
        attributeDefinitions: nextDefinitions,
        scenario: nextScenario,
        savedScenarios:
          currentScenarioId && state.savedScenarios[currentScenarioId]
            ? {
                ...state.savedScenarios,
                [currentScenarioId]: {
                  ...state.savedScenarios[currentScenarioId],
                  scenario: nextScenario ?? state.savedScenarios[currentScenarioId].scenario,
                  attributeDefinitions: nextDefinitions,
                  updatedAt: Date.now(),
                },
              }
            : state.savedScenarios,
      };
    });
  },

  addAttributeDefinition: (definition) =>
    set((prev) => {
      const normalizedName = normalizeAttributeName(getAttributeDefinitionName(definition));
      const existing = prev.attributeDefinitions.find(
        (candidate) => normalizeAttributeName(getAttributeDefinitionName(candidate)) === normalizedName,
      );
      const nextDefinitions = existing
        ? prev.attributeDefinitions.map((candidate) =>
            candidate.id === existing.id
              ? createAttributeDefinition(
                  getAttributeDefinitionName(candidate),
                  [...candidate.values, ...definition.values],
                  candidate.id,
                )
              : candidate,
          )
        : [...prev.attributeDefinitions, definition];
      const nextScenario = prev.scenario
        ? reconcileScenarioAttributeState(prev.scenario, nextDefinitions)
        : prev.scenario;
      const { currentScenarioId } = prev;

      return {
        attributeDefinitions: nextDefinitions,
        scenario: nextScenario,
        savedScenarios:
          currentScenarioId && prev.savedScenarios[currentScenarioId]
            ? {
                ...prev.savedScenarios,
                [currentScenarioId]: {
                  ...prev.savedScenarios[currentScenarioId],
                  scenario: nextScenario ?? prev.savedScenarios[currentScenarioId].scenario,
                  attributeDefinitions: nextDefinitions,
                  updatedAt: Date.now(),
                },
              }
            : prev.savedScenarios,
      };
    }),

  removeAttributeDefinition: (keyOrId) =>
    set((prev) => {
      const definitionToRemove =
        prev.attributeDefinitions.find((definition) => definition.id === keyOrId) ??
        prev.attributeDefinitions.find(
          (definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) === normalizeAttributeName(keyOrId),
        );
      if (!definitionToRemove) {
        return {};
      }

      const updatedAttrDefs = prev.attributeDefinitions.filter((definition) => definition.id !== definitionToRemove.id);
      const updatedScenario = prev.scenario
        ? removeAttributeDefinitionFromScenario(prev.scenario, definitionToRemove, updatedAttrDefs)
        : prev.scenario;
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
