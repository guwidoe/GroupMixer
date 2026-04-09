import type { AttributeDefinition, Scenario, Group, Person } from '../../../types';
import {
  createAttributeDefinition,
  findAttributeDefinitionByName,
  getAttributeDefinitionName,
  getPersonAttributeValue,
} from '../../../services/scenarioAttributes';
import { getDefaultSolverSettings } from '../helpers';

export type CsvGridRow = Record<string, string>;

interface ApplyAttributeDefinitionUpdatesArgs {
  attributeDefinitions: AttributeDefinition[];
  setAttributeDefinitions: (definitions: AttributeDefinition[]) => void;
  valueSets: Record<string, Set<string>>;
}

export function applyAttributeDefinitionUpdates({
  attributeDefinitions,
  setAttributeDefinitions,
  valueSets,
}: ApplyAttributeDefinitionUpdatesArgs): AttributeDefinition[] {
  const merged = [...attributeDefinitions];

  Object.entries(valueSets).forEach(([key, valueSet]) => {
    const nextValues = Array.from(valueSet).filter((value) => value.trim().length > 0);
    const existing = findAttributeDefinitionByName(merged, key);

    if (!existing) {
      merged.push(createAttributeDefinition(key, nextValues));
      return;
    }

    const mergedValues = Array.from(new Set([...(existing.values || []), ...nextValues])).sort((left, right) =>
      left.localeCompare(right),
    );
    const index = merged.findIndex((definition) => definition.id === existing.id);
    merged[index] = createAttributeDefinition(getAttributeDefinitionName(existing), mergedValues, existing.id);
  });

  setAttributeDefinitions(merged);
  return merged;
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
    const name = getAttributeDefinitionName(definition);
    if (name !== 'name') {
      headerSet.add(name);
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
        row[header] = getPersonAttributeValue(person, attributeDefinitions, { name: header }) ?? '';
      }
    });
    return row;
  });

  return { headers, rows };
}
