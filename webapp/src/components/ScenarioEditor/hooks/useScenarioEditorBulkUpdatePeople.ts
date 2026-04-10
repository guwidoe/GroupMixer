import type { AttributeDefinition, Person, Scenario } from '../../../types';
import {
  reconcileScenarioAttributeDefinitions,
  reconcileScenarioAttributeState,
} from '../../../services/scenarioAttributes';
import { generateUniquePersonId } from '../helpers';
import type { ScenarioEditorBulkNotification } from './scenarioEditorBulkNotifications';
import { buildScenarioWithPeople } from './scenarioEditorBulkUtils';

interface UseScenarioEditorBulkUpdatePeopleArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addNotification: (notification: ScenarioEditorBulkNotification) => void;
  setAttributeDefinitions: (definitions: AttributeDefinition[]) => void;
  setScenario: (scenario: Scenario) => void;
}

function sanitizeGridPeopleRows(people: Person[]): Person[] {
  return people.map((person) => {
    const cleanedAttributes = Object.fromEntries(
      Object.entries(person.attributes ?? {}).filter(([key, value]) => {
        if (key === 'name') {
          return true;
        }
        return String(value ?? '').trim().length > 0;
      }),
    );

    cleanedAttributes.name = String(cleanedAttributes.name ?? '').trim() || person.id;

    const normalizedSessions = Array.isArray(person.sessions)
      ? Array.from(new Set(person.sessions.filter((session) => Number.isFinite(session)).sort((left, right) => left - right)))
      : undefined;

    return {
      ...person,
      attributes: cleanedAttributes,
      sessions: normalizedSessions && normalizedSessions.length > 0 ? normalizedSessions : undefined,
    } satisfies Person;
  });
}

export function useScenarioEditorBulkUpdatePeople({
  scenario,
  attributeDefinitions,
  addNotification,
  setAttributeDefinitions,
  setScenario,
}: UseScenarioEditorBulkUpdatePeopleArgs) {
  const createRow = () => ({
    id: generateUniquePersonId(scenario?.people),
    attributes: { name: '' },
    sessions: undefined,
  } satisfies Person);

  const applyRows = (people: Person[]) => {
    const normalizedPeople = sanitizeGridPeopleRows(people);
    const nextScenario = buildScenarioWithPeople(scenario, normalizedPeople);
    const nextDefinitions = reconcileScenarioAttributeDefinitions(nextScenario, attributeDefinitions);

    setAttributeDefinitions(nextDefinitions);
    setScenario(reconcileScenarioAttributeState(nextScenario, nextDefinitions));
    addNotification({
      type: 'success',
      title: 'People Updated',
      message: `Applied ${normalizedPeople.length} grid row${normalizedPeople.length === 1 ? '' : 's'}.`,
    });
  };

  return {
    createRow,
    applyRows,
  };
}
