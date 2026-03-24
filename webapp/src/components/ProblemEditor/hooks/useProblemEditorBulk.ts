import type { AttributeDefinition, Problem } from '../../../types';
import { useProblemEditorBulkAddGroups } from './useProblemEditorBulkAddGroups';
import { useProblemEditorBulkAddPeople, type NotificationPayload } from './useProblemEditorBulkAddPeople';
import { useProblemEditorBulkUpdatePeople } from './useProblemEditorBulkUpdatePeople';

interface UseProblemEditorBulkArgs {
  problem: Problem | null;
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  addNotification: (notification: NotificationPayload) => void;
  setProblem: (problem: Problem) => void;
}

export function useProblemEditorBulk(args: UseProblemEditorBulkArgs) {
  return {
    addPeople: useProblemEditorBulkAddPeople(args),
    updatePeople: useProblemEditorBulkUpdatePeople(args),
    addGroups: useProblemEditorBulkAddGroups(args),
  };
}
