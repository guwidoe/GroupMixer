import type { AttributeDefinition, SavedScenario, Scenario, ScenarioDocument } from '../types';
import { resolveScenarioWorkspaceState } from '../services/scenarioAttributes';

export function createScenarioDocument(
  scenario: Scenario,
  attributeDefinitions?: AttributeDefinition[] | null,
): ScenarioDocument {
  const resolved = resolveScenarioWorkspaceState(scenario, attributeDefinitions);
  return {
    scenario: resolved.scenario,
    attributeDefinitions: resolved.attributeDefinitions,
  };
}

export function normalizeScenarioDocument(document: ScenarioDocument): ScenarioDocument {
  return createScenarioDocument(document.scenario, document.attributeDefinitions);
}

export function getScenarioDocumentState(
  document: ScenarioDocument | null,
  fallbackAttributeDefinitions: AttributeDefinition[],
) {
  return {
    scenarioDocument: document,
    scenario: document?.scenario ?? null,
    attributeDefinitions: document?.attributeDefinitions ?? fallbackAttributeDefinitions,
  };
}

export function getScenarioDocumentFromState(state: {
  scenarioDocument: ScenarioDocument | null;
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
}): ScenarioDocument | null {
  if (state.scenarioDocument) {
    return state.scenarioDocument;
  }

  if (!state.scenario) {
    return null;
  }

  return createScenarioDocument(state.scenario, state.attributeDefinitions);
}

export function getSavedScenarioDocument(savedScenario: Pick<SavedScenario, 'scenario' | 'attributeDefinitions'>): ScenarioDocument {
  return createScenarioDocument(savedScenario.scenario, savedScenario.attributeDefinitions);
}

export function replaceSavedScenarioDocument(savedScenario: SavedScenario, document: ScenarioDocument): SavedScenario {
  return {
    ...savedScenario,
    scenario: document.scenario,
    attributeDefinitions: document.attributeDefinitions,
    updatedAt: Date.now(),
  };
}
