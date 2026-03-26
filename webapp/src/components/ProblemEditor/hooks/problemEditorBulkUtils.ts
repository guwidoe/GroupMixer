import type { AttributeDefinition, Problem, Group, Person } from '../../../types';
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

export function buildProblemWithPeople(problem: Problem | null, people: Person[]): Problem {
  return {
    people,
    groups: problem?.groups || [],
    num_sessions: problem?.num_sessions || 3,
    constraints: problem?.constraints || [],
    settings: problem?.settings || getDefaultSolverSettings(),
  };
}

export function buildProblemWithGroups(problem: Problem | null, groups: Group[]): Problem {
  return {
    people: problem?.people || [],
    groups,
    num_sessions: problem?.num_sessions || 3,
    constraints: problem?.constraints || [],
    settings: problem?.settings || getDefaultSolverSettings(),
  };
}

export function buildPeopleCsvFromCurrent(
  problem: Problem | null,
  attributeDefinitions: AttributeDefinition[],
): { headers: string[]; rows: CsvGridRow[] } {
  const people = problem?.people || [];
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
