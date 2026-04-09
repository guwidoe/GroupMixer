import type { AttributeDefinition, Person } from '../../types';
import { createAttributeDefinition } from '../../services/scenarioAttributes';

export function buildAttributeDefinitions(people: Person[]): AttributeDefinition[] {
  const valueMap = new Map<string, Set<string>>();

  for (const person of people) {
    for (const [key, value] of Object.entries(person.attributes)) {
      if (!valueMap.has(key)) {
        valueMap.set(key, new Set());
      }
      if (value) {
        valueMap.get(key)!.add(value);
      }
    }
  }

  return [...valueMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => createAttributeDefinition(key, [...values].sort((left, right) => left.localeCompare(right))));
}
