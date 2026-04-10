import type { AttributeDefinition, AttributeBalanceParams, Constraint, Person, SavedScenario, Scenario } from '../types';

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

export function findAttributeDefinitionById(
  definitions: AttributeDefinition[],
  attributeId: string | undefined | null,
): AttributeDefinition | null {
  if (!attributeId) {
    return null;
  }

  return definitions.find((definition) => definition.id === attributeId) ?? null;
}

export function findAttributeDefinitionByName(
  definitions: AttributeDefinition[],
  attributeName: string | undefined | null,
): AttributeDefinition | null {
  if (!attributeName) {
    return null;
  }

  const normalizedName = normalizeAttributeName(attributeName);
  return (
    definitions.find((definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) === normalizedName) ?? null
  );
}

export function findAttributeDefinition(
  definitions: AttributeDefinition[],
  selector: { id?: string | null; name?: string | null },
): AttributeDefinition | null {
  return (
    findAttributeDefinitionById(definitions, selector.id) ??
    findAttributeDefinitionByName(definitions, selector.name) ??
    null
  );
}

export function getPersonAttributeValue(
  person: Person,
  definitions: AttributeDefinition[],
  selector: { id?: string | null; name?: string | null },
): string | undefined {
  const definition = findAttributeDefinition(definitions, selector);
  if (definition) {
    const relationalValue = person.attributeValues?.[definition.id];
    if (relationalValue !== undefined) {
      return relationalValue;
    }
    const projectedValue = person.attributes?.[definition.name] ?? person.attributes?.[definition.key ?? definition.name];
    if (projectedValue !== undefined) {
      return projectedValue;
    }
  }

  if (selector.name) {
    return person.attributes?.[selector.name];
  }

  return undefined;
}

function readCanonicalPersonName(person: Person): string {
  for (const [key, value] of Object.entries(person.attributes ?? {})) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      const trimmed = String(value ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return String(person.id ?? '').trim();
}

function buildPersonProjectedAttributes(person: Person, definitions: AttributeDefinition[]): Record<string, string> {
  const projected: Record<string, string> = {};
  projected.name = readCanonicalPersonName(person);

  for (const definition of definitions) {
    const value = person.attributeValues?.[definition.id];
    if (value !== undefined && value !== '') {
      projected[definition.name] = value;
    }
  }

  for (const [key, value] of Object.entries(person.attributes ?? {})) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      continue;
    }

    const definition = findAttributeDefinitionByName(definitions, key);
    if (!definition) {
      projected[key] = value;
    }
  }

  return projected;
}

export function reconcilePersonAttributeState(person: Person, definitions: AttributeDefinition[]): Person {
  const attributeValues = { ...(person.attributeValues ?? {}) };

  for (const [key, value] of Object.entries(person.attributes ?? {})) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      continue;
    }

    const definition = findAttributeDefinitionByName(definitions, key);
    if (definition && attributeValues[definition.id] === undefined) {
      attributeValues[definition.id] = value;
    }
  }

  const nextPerson: Person = {
    ...person,
    attributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined,
  };

  return {
    ...nextPerson,
    attributes: buildPersonProjectedAttributes(nextPerson, definitions),
  };
}

function reconcileAttributeBalanceConstraint(
  constraint: Constraint,
  definitions: AttributeDefinition[],
): Constraint {
  if (constraint.type !== 'AttributeBalance') {
    return constraint;
  }

  const definition = findAttributeDefinition(definitions, {
    id: constraint.attribute_id,
    name: constraint.attribute_key,
  });

  if (!definition) {
    return constraint;
  }

  return {
    ...constraint,
    attribute_id: definition.id,
    attribute_key: definition.name,
  } satisfies Constraint;
}

export function reconcileScenarioAttributeState(scenario: Scenario, definitions: AttributeDefinition[]): Scenario {
  return {
    ...scenario,
    people: scenario.people.map((person) => reconcilePersonAttributeState(person, definitions)),
    constraints: scenario.constraints.map((constraint) => reconcileAttributeBalanceConstraint(constraint, definitions)),
  };
}

export function resolveScenarioWorkspaceState(
  scenario: Scenario,
  definitions?: AttributeDefinition[] | null,
): { scenario: Scenario; attributeDefinitions: AttributeDefinition[] } {
  const baseDefinitions = coerceAttributeDefinitions(definitions);
  const normalizedScenario = reconcileScenarioAttributeState(scenario, baseDefinitions);
  const attributeDefinitions = reconcileScenarioAttributeDefinitions(normalizedScenario, baseDefinitions);

  return {
    scenario: reconcileScenarioAttributeState(normalizedScenario, attributeDefinitions),
    attributeDefinitions,
  };
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

export function applyNamedAttributeValuesToPerson(
  person: Person,
  updates: Record<string, string>,
  definitions: AttributeDefinition[],
): Person {
  const nextAttributes = { ...(person.attributes ?? {}) };
  const nextAttributeValues = { ...(person.attributeValues ?? {}) };

  for (const [key, rawValue] of Object.entries(updates)) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      if (rawValue) {
        nextAttributes.name = rawValue;
      } else {
        delete nextAttributes.name;
      }
      continue;
    }

    const definition = findAttributeDefinitionByName(definitions, key);
    if (definition) {
      if (rawValue === '') {
        delete nextAttributeValues[definition.id];
      } else {
        nextAttributeValues[definition.id] = rawValue;
      }
    } else if (rawValue === '') {
      delete nextAttributes[key];
    } else {
      nextAttributes[key] = rawValue;
    }
  }

  return reconcilePersonAttributeState(
    {
      ...person,
      attributes: nextAttributes,
      attributeValues: nextAttributeValues,
    },
    definitions,
  );
}

export function buildPersonFormAttributes(person: Person, definitions: AttributeDefinition[]): Record<string, string> {
  return { ...reconcilePersonAttributeState(person, definitions).attributes };
}

export function removeAttributeDefinitionFromScenario(
  scenario: Scenario,
  definition: AttributeDefinition,
  remainingDefinitions: AttributeDefinition[],
): Scenario {
  const nextScenario = reconcileScenarioAttributeState(scenario, remainingDefinitions);
  return {
    ...nextScenario,
    people: nextScenario.people.map((person) => {
      const nextAttributeValues = { ...(person.attributeValues ?? {}) };
      delete nextAttributeValues[definition.id];
      const nextAttributes = { ...(person.attributes ?? {}) };
      delete nextAttributes[definition.name];
      if (definition.key) {
        delete nextAttributes[definition.key];
      }
      return reconcilePersonAttributeState(
        {
          ...person,
          attributes: nextAttributes,
          attributeValues: nextAttributeValues,
        },
        remainingDefinitions,
      );
    }),
    constraints: nextScenario.constraints.filter(
      (constraint) =>
        constraint.type !== 'AttributeBalance' ||
        (constraint.attribute_id !== definition.id && normalizeAttributeName(constraint.attribute_key) !== normalizeAttributeName(definition.name)),
    ),
  };
}

export function updateAttributeBalanceConstraintReference(
  params: Pick<AttributeBalanceParams, 'attribute_id' | 'attribute_key'>,
  definitions: AttributeDefinition[],
): Pick<AttributeBalanceParams, 'attribute_id' | 'attribute_key'> {
  const definition = findAttributeDefinition(definitions, {
    id: params.attribute_id,
    name: params.attribute_key,
  });

  return definition
    ? {
        attribute_id: definition.id,
        attribute_key: definition.name,
      }
    : params;
}

export function migrateSavedScenario(savedScenario: SavedScenario): SavedScenario {
  const resolvedWorkspace = resolveScenarioWorkspaceState(savedScenario.scenario, savedScenario.attributeDefinitions);

  return {
    ...savedScenario,
    scenario: resolvedWorkspace.scenario,
    attributeDefinitions: resolvedWorkspace.attributeDefinitions,
  };
}

export function getPersonDisplayName(person: Person): string {
  return readCanonicalPersonName(person);
}
