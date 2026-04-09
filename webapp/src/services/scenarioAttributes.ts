import type { AttributeDefinition, Person, SavedScenario, Scenario } from '../types';

export const ATTRIBUTE_DEFINITION_NAME_KEY = 'name';

function uniqueSortedValues(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values, (value) => String(value).trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function normalizeAttributeName(name: string): string {
  return name.trim().toLowerCase();
}

export function createAttributeDefinitionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `attr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAttributeDefinitionName(definition: Pick<AttributeDefinition, 'name' | 'key'>): string {
  return (definition.name || definition.key || '').trim();
}

export function createAttributeDefinition(name: string, values: string[] = [], id = createAttributeDefinitionId()): AttributeDefinition {
  const normalizedName = name.trim();
  return {
    id,
    name: normalizedName,
    key: normalizedName,
    values: uniqueSortedValues(values),
  };
}

export function coerceAttributeDefinitions(definitions: AttributeDefinition[] | undefined | null): AttributeDefinition[] {
  const merged = new Map<string, AttributeDefinition>();

  for (const definition of definitions ?? []) {
    const name = getAttributeDefinitionName(definition);
    if (!name || normalizeAttributeName(name) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      continue;
    }

    const normalizedName = normalizeAttributeName(name);
    const existing = merged.get(normalizedName);
    const nextValues = uniqueSortedValues([...(existing?.values ?? []), ...(definition.values ?? [])]);

    merged.set(
      normalizedName,
      createAttributeDefinition(name, nextValues, existing?.id ?? definition.id ?? createAttributeDefinitionId()),
    );
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function extractAttributeDefinitionsFromScenario(scenario: Scenario): AttributeDefinition[] {
  const collected = new Map<string, { name: string; values: Set<string> }>();

  for (const person of scenario.people) {
    for (const [key, value] of Object.entries(person.attributes ?? {})) {
      if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
        continue;
      }

      const normalizedName = normalizeAttributeName(key);
      const existing = collected.get(normalizedName) ?? { name: key, values: new Set<string>() };
      existing.values.add(String(value));
      collected.set(normalizedName, existing);
    }
  }

  return Array.from(collected.values())
    .map(({ name, values }) => createAttributeDefinition(name, Array.from(values)))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function reconcileScenarioAttributeDefinitions(
  scenario: Scenario,
  definitions?: AttributeDefinition[] | null,
): AttributeDefinition[] {
  const merged = new Map<string, AttributeDefinition>();

  for (const definition of coerceAttributeDefinitions(definitions)) {
    merged.set(normalizeAttributeName(definition.name), definition);
  }

  for (const extracted of extractAttributeDefinitionsFromScenario(scenario)) {
    const normalizedName = normalizeAttributeName(extracted.name);
    const existing = merged.get(normalizedName);
    merged.set(
      normalizedName,
      createAttributeDefinition(
        extracted.name,
        [...(existing?.values ?? []), ...extracted.values],
        existing?.id ?? extracted.id,
      ),
    );
  }

  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function migrateSavedScenario(savedScenario: SavedScenario): SavedScenario {
  const attributeDefinitions = reconcileScenarioAttributeDefinitions(savedScenario.scenario, savedScenario.attributeDefinitions);

  return {
    ...savedScenario,
    attributeDefinitions,
  };
}

export function getPersonDisplayName(person: Person): string {
  return person.attributes?.name || person.id;
}
