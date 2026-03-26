import type { AttributeDefinition, Person } from '../../types';

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
    .map(([key, values]) => ({
      key,
      values: [...values].sort((left, right) => left.localeCompare(right)),
    }));
}
