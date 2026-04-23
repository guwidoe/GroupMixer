/**
 * Attribute slice - manages attribute definitions for the active scenario document.
 */

import type { AttributeDefinition } from '../../types';
import type { AttributeState, AttributeActions, StoreSlice } from '../types';
import {
  coerceAttributeDefinitions,
  createAttributeDefinition,
  getAttributeDefinitionName,
  normalizeAttributeName,
} from '../../services/scenarioAttributes';

export const DEFAULT_ATTRIBUTE_DEFINITIONS: AttributeDefinition[] = [
  createAttributeDefinition('gender', ['male', 'female'], 'default-gender'),
  createAttributeDefinition('department', ['engineering', 'marketing', 'sales', 'hr', 'finance'], 'default-department'),
  createAttributeDefinition('seniority', ['junior', 'mid', 'senior', 'lead'], 'default-seniority'),
  createAttributeDefinition('location', ['office', 'remote', 'hybrid'], 'default-location'),
];

export const createAttributeSlice: StoreSlice<AttributeState & AttributeActions> = (_set, get) => ({
  attributeDefinitions: DEFAULT_ATTRIBUTE_DEFINITIONS,

  setAttributeDefinitions: (definitions) => {
    const currentScenario = get().scenario;
    if (!currentScenario) {
      const nextDefinitions = coerceAttributeDefinitions(definitions);
      _set((state) => ({
        scenarioDocument: state.scenarioDocument
          ? {
              ...state.scenarioDocument,
              attributeDefinitions: nextDefinitions,
            }
          : state.scenarioDocument,
        attributeDefinitions: nextDefinitions,
      }));
      return;
    }

    get().setScenarioDocument({
      scenario: currentScenario,
      attributeDefinitions: coerceAttributeDefinitions(definitions),
    });
  },

  addAttributeDefinition: (definition) => {
    const prevDefinitions = get().attributeDefinitions;
    const normalizedName = normalizeAttributeName(getAttributeDefinitionName(definition));
    const existing = prevDefinitions.find(
      (candidate) => normalizeAttributeName(getAttributeDefinitionName(candidate)) === normalizedName,
    );
    const nextDefinitions = existing
      ? prevDefinitions.map((candidate) =>
          candidate.id === existing.id
            ? createAttributeDefinition(
                getAttributeDefinitionName(candidate),
                [...candidate.values, ...definition.values],
                candidate.id,
              )
            : candidate,
        )
      : [...prevDefinitions, definition];

    get().setAttributeDefinitions(nextDefinitions);
  },

  removeAttributeDefinition: (keyOrId) => {
    const prevDefinitions = get().attributeDefinitions;
    const definitionToRemove =
      prevDefinitions.find((definition) => definition.id === keyOrId) ??
      prevDefinitions.find(
        (definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) === normalizeAttributeName(keyOrId),
      );
    if (!definitionToRemove) {
      return;
    }

    const nextDefinitions = prevDefinitions.filter((definition) => definition.id !== definitionToRemove.id);
    get().setAttributeDefinitions(nextDefinitions);
  },
});
