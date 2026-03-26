import type { AttributeDefinition, Scenario } from '../../../types';
import type { ScenarioEditorBulkNotification } from './scenarioEditorBulkNotifications';
import { useScenarioEditorBulkAddGroups } from './useScenarioEditorBulkAddGroups';
import { useScenarioEditorBulkAddPeople } from './useScenarioEditorBulkAddPeople';
import { useScenarioEditorBulkUpdatePeople } from './useScenarioEditorBulkUpdatePeople';

interface UseScenarioEditorBulkArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: ScenarioEditorBulkNotification) => void;
  setScenario: (scenario: Scenario) => void;
}

export function useScenarioEditorBulk(args: UseScenarioEditorBulkArgs) {
  return {
    addPeople: useScenarioEditorBulkAddPeople(args),
    updatePeople: useScenarioEditorBulkUpdatePeople(args),
    addGroups: useScenarioEditorBulkAddGroups(args),
  };
}
