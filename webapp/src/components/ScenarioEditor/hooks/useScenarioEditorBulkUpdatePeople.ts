import type { AttributeDefinition, Person, Scenario, ScenarioDocument } from '../../../types';
import { reconcileScenarioAttributeDefinitions } from '../../../services/scenarioAttributes';
import { generateUniquePersonId } from '../helpers';
import type { ScenarioEditorBulkNotification } from './scenarioEditorBulkNotifications';
import { buildScenarioWithPeople } from './scenarioEditorBulkUtils';

interface UseScenarioEditorBulkUpdatePeopleArgs {
  scenario: Scenario | null;
  attributeDefinitions: AttributeDefinition[];
  addNotification: (notification: ScenarioEditorBulkNotification) => void;
  setScenarioDocument: (document: ScenarioDocument) => void;
}

function sanitizeGridPeopleRows(people: Person[]): Person[] {
  const seenNames = new Map<string, number>();
  return people.map((person) => {
    const cleanedAttributes = Object.fromEntries(
      Object.entries(person.attributes ?? {}).filter(([key, value]) => {
        if (key.toLowerCase() === 'name') return false;
        return String(value ?? '').trim().length > 0;
      }),
    );

    const baseName = String(person.name ?? '').trim() || person.id;
    const normalizedName = baseName.toLowerCase();
    const seenCount = (seenNames.get(normalizedName) ?? 0) + 1;
    seenNames.set(normalizedName, seenCount);
    const name = seenCount === 1 ? baseName : `${baseName} (${seenCount})`;

    const normalizedSessions = Array.isArray(person.sessions)
      ? Array.from(new Set(person.sessions.filter((session) => Number.isFinite(session)).sort((left, right) => left - right)))
      : undefined;

    return {
      ...person,
      name,
      attributes: cleanedAttributes,
      sessions: normalizedSessions && normalizedSessions.length > 0 ? normalizedSessions : undefined,
    } satisfies Person;
  });
}

export function useScenarioEditorBulkUpdatePeople({
  scenario,
  attributeDefinitions,
  addNotification,
  setScenarioDocument,
}: UseScenarioEditorBulkUpdatePeopleArgs) {
  const createRow = (currentRows: Person[] = []) => ({
    id: generateUniquePersonId(currentRows.length > 0 ? currentRows : scenario?.people),
    name: '',
    attributes: {},
    sessions: undefined,
  } satisfies Person);

  const applyRows = (people: Person[]) => {
    const normalizedPeople = sanitizeGridPeopleRows(people);
    const nextScenario = buildScenarioWithPeople(scenario, normalizedPeople);
    const nextDefinitions = reconcileScenarioAttributeDefinitions(nextScenario, attributeDefinitions);

    setScenarioDocument({
      scenario: nextScenario,
      attributeDefinitions: nextDefinitions,
    });
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
