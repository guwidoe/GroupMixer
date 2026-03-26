import type { AttributeDefinition, Scenario, Group, Person } from '../../../types';
import { getDefaultSolverSettings } from '../helpers';

export type CsvGridRow = Record<string, string>;

interface ApplyAttributeDefinitionUpdatesArgs {
  attributeDefinitions: AttributeDefinition[];
  addAttributeDefinition: (definition: AttributeDefinition) => void;
  removeAttributeDefinition: (key: string) => void;
  valueSets: Record<string, Set<string>>;
}

export function applyAttributeDefinitionUpdates({
  attributeDefinitions,
  addAttributeDefinition,
  removeAttributeDefinition,
  valueSets,
}: ApplyAttributeDefinitionUpdatesArgs) {
  Object.entries(valueSets).forEach(([key, valueSet]) => {
    const existing = attributeDefinitions.find((definition) => definition.key === key);
    const nextValues = Array.from(valueSet);

    if (!existing) {
      addAttributeDefinition({ key, values: nextValues });
      return;
    }

    const mergedValues = Array.from(new Set([...(existing.values || []), ...nextValues]));
    if (mergedValues.length !== existing.values.length) {
      removeAttributeDefinition(existing.key);
      addAttributeDefinition({ key: existing.key, values: mergedValues });
    }
  });
}

export function buildScenarioWithPeople(scenario: Scenario | null, people: Person[]): Scenario {
  return {
    people,
    groups: scenario?.groups || [],
    num_sessions: scenario?.num_sessions || 3,
    constraints: scenario?.constraints || [],
    settings: scenario?.settings || getDefaultSolverSettings(),
  };
}

export function buildScenarioWithGroups(scenario: Scenario | null, groups: Group[]): Scenario {
  return {
    people: scenario?.people || [],
    groups,
    num_sessions: scenario?.num_sessions || 3,
    constraints: scenario?.constraints || [],
    settings: scenario?.settings || getDefaultSolverSettings(),
  };
}

export function buildPeopleCsvFromCurrent(
  scenario: Scenario | null,
  attributeDefinitions: AttributeDefinition[],
): { headers: string[]; rows: CsvGridRow[] } {
  const people = scenario?.people || [];
  const headerSet = new Set<string>(['id', 'name']);

  people.forEach((person) => {
    Object.keys(person.attributes || {}).forEach((key) => {
      if (key !== 'name') {
        headerSet.add(key);
      }
    });
  });

  attributeDefinitions.forEach((definition) => {
    if (definition.key !== 'name') {
      headerSet.add(definition.key);
    }
  });

  const headers = Array.from(headerSet);
  const rows: CsvGridRow[] = people.map((person) => {
    const row: CsvGridRow = {};
    headers.forEach((header) => {
      if (header === 'id') {
        row[header] = person.id;
      } else if (header === 'name') {
        row[header] = person.attributes?.name || '';
      } else {
        row[header] = person.attributes?.[header] ?? '';
      }
    });
    return row;
  });

  return { headers, rows };
}
