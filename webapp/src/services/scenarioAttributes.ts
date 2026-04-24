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

function buildAttributeDefinitionNameMap(definitions: AttributeDefinition[]): Map<string, AttributeDefinition> {
  const byName = new Map<string, AttributeDefinition>();

  for (const definition of definitions) {
    const name = getAttributeDefinitionName(definition);
    if (name) {
      byName.set(normalizeAttributeName(name), definition);
    }
    if (definition.key) {
      byName.set(normalizeAttributeName(definition.key), definition);
    }
  }

  return byName;
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

function readLegacyPersonNameAttribute(person: Person): string {
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

function readCanonicalPersonName(person: Person): string {
  const directName = String((person as Person & { name?: unknown }).name ?? '').trim();
  if (directName) {
    return directName;
  }

  return readLegacyPersonNameAttribute(person);
}

function makeUniquePersonName(baseName: string, seenNames: Map<string, number>): string {
  const fallback = baseName.trim() || 'Person';
  const normalized = normalizeAttributeName(fallback);
  const count = (seenNames.get(normalized) ?? 0) + 1;
  seenNames.set(normalized, count);
  return count === 1 ? fallback : `${fallback} (${count})`;
}

export function normalizePersonName(value: string, fallback = 'Person'): string {
  return value.trim() || fallback;
}

function buildPersonProjectedAttributes(
  person: Person,
  definitions: AttributeDefinition[],
  definitionsByName: Map<string, AttributeDefinition>,
): Record<string, string> {
  const projected: Record<string, string> = {};

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

    const definition = definitionsByName.get(normalizeAttributeName(key));
    if (!definition) {
      projected[key] = value;
    }
  }

  return projected;
}

function reconcilePersonAttributeStateWithMap(
  person: Person,
  definitions: AttributeDefinition[],
  definitionsByName: Map<string, AttributeDefinition>,
): Person {
  const attributeValues = { ...(person.attributeValues ?? {}) };
  const name = readCanonicalPersonName(person);

  for (const [key, value] of Object.entries(person.attributes ?? {})) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      continue;
    }

    const definition = definitionsByName.get(normalizeAttributeName(key));
    if (definition && attributeValues[definition.id] === undefined) {
      attributeValues[definition.id] = value;
    }
  }

  const nextPerson: Person = {
    ...person,
    name,
    attributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined,
  };

  return {
    ...nextPerson,
    attributes: buildPersonProjectedAttributes(nextPerson, definitions, definitionsByName),
  };
}

export function reconcilePersonAttributeState(person: Person, definitions: AttributeDefinition[]): Person {
  return reconcilePersonAttributeStateWithMap(person, definitions, buildAttributeDefinitionNameMap(definitions));
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
  const seenNames = new Map<string, number>();
  const definitionsByName = buildAttributeDefinitionNameMap(definitions);
  const people = scenario.people.map((person) => {
    const reconciled = reconcilePersonAttributeStateWithMap(person, definitions, definitionsByName);
    return {
      ...reconciled,
      name: makeUniquePersonName(reconciled.name, seenNames),
    };
  });

  return {
    ...scenario,
    people,
    constraints: scenario.constraints.map((constraint) => reconcileAttributeBalanceConstraint(constraint, definitions)),
  };
}

function scenarioNeedsPersonNameMigration(scenario: Pick<Scenario, 'people'>): boolean {
  const seenNames = new Set<string>();

  for (const person of scenario.people) {
    const directName = String((person as Person & { name?: unknown }).name ?? '').trim();
    const normalizedName = normalizeAttributeName(directName);

    if (!directName || seenNames.has(normalizedName)) {
      return true;
    }
    seenNames.add(normalizedName);

    if (Object.keys(person.attributes ?? {}).some((key) => normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY)) {
      return true;
    }
  }

  return false;
}

export function savedScenarioNeedsAttributeMigration(savedScenario: SavedScenario): boolean {
  if (savedScenario.attributeDefinitions.some((definition) => normalizeAttributeName(getAttributeDefinitionName(definition)) === ATTRIBUTE_DEFINITION_NAME_KEY)) {
    return true;
  }

  if (scenarioNeedsPersonNameMigration(savedScenario.scenario)) {
    return true;
  }

  return savedScenario.results.some((result) => (
    result.scenarioSnapshot ? scenarioNeedsPersonNameMigration(result.scenarioSnapshot) : false
  ));
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
  let nextName = readCanonicalPersonName(person);

  for (const [key, rawValue] of Object.entries(updates)) {
    if (normalizeAttributeName(key) === ATTRIBUTE_DEFINITION_NAME_KEY) {
      nextName = normalizePersonName(rawValue, nextName);
      delete nextAttributes[key];
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
      name: nextName,
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
  const resolvedResults = savedScenario.results.map((result) => {
    if (!result.scenarioSnapshot) {
      return result;
    }

    const snapshotScenario: Scenario = {
      people: result.scenarioSnapshot.people,
      groups: result.scenarioSnapshot.groups,
      num_sessions: result.scenarioSnapshot.num_sessions,
      objectives: result.scenarioSnapshot.objectives,
      constraints: result.scenarioSnapshot.constraints,
      settings: result.solverSettings,
    };
    const resolvedSnapshot = resolveScenarioWorkspaceState(snapshotScenario, resolvedWorkspace.attributeDefinitions);

    return {
      ...result,
      scenarioSnapshot: {
        ...result.scenarioSnapshot,
        people: resolvedSnapshot.scenario.people,
        groups: resolvedSnapshot.scenario.groups,
        objectives: resolvedSnapshot.scenario.objectives,
        constraints: resolvedSnapshot.scenario.constraints,
      },
    };
  });

  return {
    ...savedScenario,
    scenario: resolvedWorkspace.scenario,
    attributeDefinitions: resolvedWorkspace.attributeDefinitions,
    results: resolvedResults,
  };
}

export function getPersonDisplayName(person: Person): string {
  return readCanonicalPersonName(person);
}
