import type { Constraint, Scenario } from '../../types';
import { getPersonDisplayName } from '../../services/scenarioAttributes';
import type { QuickSetupDraft, QuickSetupFixedAssignment, QuickSetupParticipantColumn } from '../../components/EmbeddableTool/types';
import { buildGroups } from './buildGroups';
import { normalizeBalanceTargets, type QuickSetupBalanceTargets } from './attributeBalanceTargets';
import { serializeParticipantColumns } from './participantColumns';

interface LandingGroupingConfig {
  groupingMode: QuickSetupDraft['groupingMode'];
  groupingValue: number;
  groups: Scenario['groups'];
}

function hasAllSessionsScope(sessions: number[] | undefined, numSessions: number) {
  if (!sessions || sessions.length === 0) {
    return true;
  }

  if (sessions.length !== numSessions) {
    return false;
  }

  const normalized = [...new Set(sessions)].sort((left, right) => left - right);
  return normalized.length === numSessions
    && normalized.every((session, index) => session === index);
}

function isRepeatEncounterConstraintSupported(constraint: Extract<Constraint, { type: 'RepeatEncounter' }>) {
  return constraint.max_allowed_encounters === 1
    && constraint.penalty_function === 'squared'
    && constraint.penalty_weight === 1;
}

function isLandingSupportedConstraint(constraint: Constraint, scenario: Scenario) {
  switch (constraint.type) {
    case 'RepeatEncounter':
      return isRepeatEncounterConstraintSupported(constraint);
    case 'MustStayTogether':
      return hasAllSessionsScope(constraint.sessions, scenario.num_sessions) && constraint.people.length > 1;
    case 'MustStayApart':
      return hasAllSessionsScope(constraint.sessions, scenario.num_sessions) && constraint.people.length === 2;
    case 'ImmovablePerson':
      return hasAllSessionsScope(constraint.sessions, scenario.num_sessions);
    case 'ImmovablePeople':
      return hasAllSessionsScope(constraint.sessions, scenario.num_sessions) && constraint.people.length > 0;
    case 'AttributeBalance':
      return hasAllSessionsScope(constraint.sessions, scenario.num_sessions)
        && (constraint.mode ?? 'exact') === 'exact';
    default:
      return false;
  }
}

function inferLandingGroupingConfig(scenario: Scenario): LandingGroupingConfig | null {
  const participantCount = scenario.people.length;
  const expectedSizes = scenario.groups.map((group) => group.size);
  const candidateModes: Array<QuickSetupDraft['groupingMode']> = ['groupCount', 'groupSize'];

  for (const groupingMode of candidateModes) {
    const candidateValues = groupingMode === 'groupCount'
      ? [scenario.groups.length]
      : Array.from(new Set(scenario.groups.map((group) => group.size)));

    for (const groupingValue of candidateValues) {
      const generatedGroups = buildGroups(participantCount, { groupingMode, groupingValue });
      const generatedSizes = generatedGroups.map((group) => group.size);
      if (generatedSizes.length === expectedSizes.length && generatedSizes.every((size, index) => size === expectedSizes[index])) {
        return {
          groupingMode,
          groupingValue,
          groups: generatedGroups,
        };
      }
    }
  }

  return null;
}

function buildParticipantColumns(scenario: Scenario): QuickSetupParticipantColumn[] {
  const attributeKeys = [...new Set(
    scenario.people.flatMap((person) => Object.keys(person.attributes)),
  )].sort((left, right) => left.localeCompare(right));

  return [
    {
      id: 'name',
      name: 'Name',
      values: scenario.people.map((person) => getPersonDisplayName(person)).join('\n'),
    },
    ...attributeKeys.map((attributeKey, index) => ({
      id: `attribute-${index + 1}`,
      name: attributeKey,
      values: scenario.people.map((person) => person.attributes[attributeKey] ?? '').join('\n'),
    })),
  ];
}

function formatPeopleConstraintInput(peopleById: Map<string, string>, personIds: string[], separator: string) {
  return personIds.map((personId) => peopleById.get(personId) ?? personId).join(separator);
}

function buildKeepTogetherInput(scenario: Scenario) {
  const peopleById = new Map(scenario.people.map((person) => [person.id, getPersonDisplayName(person)] as const));
  return scenario.constraints
    .filter((constraint): constraint is Extract<Constraint, { type: 'MustStayTogether' }> => constraint.type === 'MustStayTogether')
    .map((constraint) => formatPeopleConstraintInput(peopleById, constraint.people, ', '))
    .join('\n');
}

function buildKeepApartInput(scenario: Scenario) {
  const peopleById = new Map(scenario.people.map((person) => [person.id, getPersonDisplayName(person)] as const));
  return scenario.constraints
    .filter((constraint): constraint is Extract<Constraint, { type: 'MustStayApart' }> => constraint.type === 'MustStayApart')
    .map((constraint) => formatPeopleConstraintInput(peopleById, constraint.people, ' - '))
    .join('\n');
}

function buildBalanceTargets(
  scenario: Scenario,
  generatedGroups: Scenario['groups'],
): QuickSetupBalanceTargets {
  const originalGroupIndexById = new Map(scenario.groups.map((group, index) => [group.id, index] as const));
  const nextTargets: QuickSetupBalanceTargets = {};

  for (const constraint of scenario.constraints) {
    if (constraint.type !== 'AttributeBalance') {
      continue;
    }

    const originalGroupIndex = originalGroupIndexById.get(constraint.group_id);
    if (originalGroupIndex == null) {
      continue;
    }

    const nextGroupId = generatedGroups[originalGroupIndex]?.id;
    if (!nextGroupId) {
      continue;
    }

    if (!nextTargets[constraint.attribute_key]) {
      nextTargets[constraint.attribute_key] = {};
    }

    nextTargets[constraint.attribute_key][nextGroupId] = { ...constraint.desired_values };
  }

  return normalizeBalanceTargets(nextTargets);
}

function buildFixedAssignments(
  scenario: Scenario,
  generatedGroups: Scenario['groups'],
): QuickSetupFixedAssignment[] {
  const originalGroupIndexById = new Map(scenario.groups.map((group, index) => [group.id, index] as const));
  const peopleById = new Map(scenario.people.map((person) => [person.id, getPersonDisplayName(person)] as const));
  const assignments: QuickSetupFixedAssignment[] = [];

  for (const constraint of scenario.constraints) {
    if (constraint.type !== 'ImmovablePerson' && constraint.type !== 'ImmovablePeople') {
      continue;
    }

    const originalGroupIndex = originalGroupIndexById.get(constraint.group_id);
    if (originalGroupIndex == null) {
      continue;
    }

    const nextGroupId = generatedGroups[originalGroupIndex]?.id;
    if (!nextGroupId) {
      continue;
    }

    const people = constraint.type === 'ImmovablePerson' ? [constraint.person_id] : constraint.people;
    for (const personId of people) {
      assignments.push({ personId: peopleById.get(personId) ?? personId, groupId: nextGroupId });
    }
  }

  const deduped = new Map<string, QuickSetupFixedAssignment>();
  for (const assignment of assignments) {
    deduped.set(assignment.personId, assignment);
  }

  return [...deduped.values()];
}

export function isLandingDemoScenarioCompatible(scenario: Scenario) {
  if (!inferLandingGroupingConfig(scenario)) {
    return false;
  }

  if (scenario.groups.some((group) => Array.isArray(group.session_sizes) && (
    new Set(group.session_sizes).size > 1 || group.session_sizes.some((size) => size !== group.size)
  ))) {
    return false;
  }

  if (scenario.people.some((person) => !hasAllSessionsScope(person.sessions, scenario.num_sessions))) {
    return false;
  }

  const repeatEncounterConstraints = scenario.constraints.filter((constraint) => constraint.type === 'RepeatEncounter');
  if (repeatEncounterConstraints.length > 1) {
    return false;
  }

  const attributeBalanceKeys = new Set<string>();
  const immovableAssignments = new Map<string, string>();
  for (const constraint of scenario.constraints) {
    if (!isLandingSupportedConstraint(constraint, scenario)) {
      return false;
    }

    if (constraint.type === 'ImmovablePerson') {
      const previousGroupId = immovableAssignments.get(constraint.person_id);
      if (previousGroupId && previousGroupId !== constraint.group_id) {
        return false;
      }
      immovableAssignments.set(constraint.person_id, constraint.group_id);
    }

    if (constraint.type === 'ImmovablePeople') {
      for (const personId of constraint.people) {
        const previousGroupId = immovableAssignments.get(personId);
        if (previousGroupId && previousGroupId !== constraint.group_id) {
          return false;
        }
        immovableAssignments.set(personId, constraint.group_id);
      }
    }

    if (constraint.type === 'AttributeBalance') {
      const attributeValues = new Set(
        scenario.people
          .map((person) => person.attributes[constraint.attribute_key])
          .filter(Boolean),
      );
      const desiredKeys = Object.keys(constraint.desired_values ?? {});
      if (desiredKeys.some((key) => !attributeValues.has(key))) {
        return false;
      }

      const duplicateKey = `${constraint.attribute_key}::${constraint.group_id}`;
      if (attributeBalanceKeys.has(duplicateKey)) {
        return false;
      }
      attributeBalanceKeys.add(duplicateKey);
    }
  }

  return true;
}

export function createQuickSetupDraftFromScenario(
  scenario: Scenario,
  baseDraft: QuickSetupDraft,
): QuickSetupDraft | null {
  const grouping = inferLandingGroupingConfig(scenario);
  if (!grouping || !isLandingDemoScenarioCompatible(scenario)) {
    return null;
  }

  const repeatEncounterEnabled = scenario.constraints.some((constraint) => constraint.type === 'RepeatEncounter');
  const participantColumns = buildParticipantColumns(scenario);

  return {
    ...baseDraft,
    participantColumns,
    participantInput: serializeParticipantColumns(participantColumns),
    inputMode: participantColumns.length > 1 ? 'csv' : 'names',
    groupingMode: grouping.groupingMode,
    groupingValue: grouping.groupingValue,
    sessions: Math.max(1, scenario.num_sessions),
    avoidRepeatPairings: repeatEncounterEnabled,
    keepTogetherInput: buildKeepTogetherInput(scenario),
    avoidPairingsInput: buildKeepApartInput(scenario),
    fixedAssignments: buildFixedAssignments(scenario, grouping.groups),
    balanceAttributeKey: null,
    balanceTargets: buildBalanceTargets(scenario, grouping.groups),
    workspaceScenarioId: null,
  };
}
