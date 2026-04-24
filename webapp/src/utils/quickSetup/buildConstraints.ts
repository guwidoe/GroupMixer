import type { Constraint, Group, Person } from '../../types';
import type { QuickSetupDraft } from '../../components/EmbeddableTool/types';
import { deriveBalancedTargetValues, hasAnyBalanceTargets, normalizeBalanceTargets } from './attributeBalanceTargets';
import { normalizeFixedAssignmentRows, resolveFixedAssignmentGroupId } from './fixedAssignments';

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function buildPersonReferenceMap(people: Person[]) {
  const references = new Map<string, string>();
  for (const person of people) {
    references.set(normalize(person.name), person.id);
    references.set(normalize(person.id), person.id);
  }
  return references;
}

function parseConstraintGroups(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[,+]/).map((value) => value.trim()).filter(Boolean))
    .filter((group) => group.length > 1);
}

function parsePairLines(text: string): Array<[string, string]> {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/-|,/).map((value) => value.trim()).filter(Boolean))
    .filter((parts): parts is [string, string] => parts.length >= 2)
    .map(([left, right]) => [left, right]);
}

function resolvePeople(names: string[], people: Person[]): string[] {
  const byName = buildPersonReferenceMap(people);
  return names
    .map((name) => byName.get(normalize(name)))
    .filter((id): id is string => Boolean(id));
}

export function buildConstraints(
  draft: Pick<
    QuickSetupDraft,
    'sessions' | 'keepTogetherInput' | 'avoidPairingsInput' | 'fixedAssignments' | 'balanceAttributeKey' | 'balanceTargets'
  >,
  people: Person[],
  groups: Group[],
): Constraint[] {
  const constraints: Constraint[] = [];

  if (draft.sessions > 1) {
    constraints.push({
      type: 'RepeatEncounter',
      max_allowed_encounters: 1,
      penalty_function: 'squared',
      penalty_weight: 1,
    });
  }

  for (const names of parseConstraintGroups(draft.keepTogetherInput)) {
    const resolved = resolvePeople(names, people);
    if (resolved.length > 1) {
      constraints.push({
        type: 'MustStayTogether',
        people: resolved,
      });
    }
  }

  for (const [left, right] of parsePairLines(draft.avoidPairingsInput)) {
    const resolved = resolvePeople([left, right], people);
    if (resolved.length === 2) {
      constraints.push({
        type: 'MustStayApart',
        people: resolved,
      });
    }
  }

  const resolvedPeopleByName = buildPersonReferenceMap(people);
  for (const assignment of normalizeFixedAssignmentRows(draft.fixedAssignments)) {
    if (assignment.personId.length === 0 || assignment.groupId.length === 0) {
      continue;
    }

    const personId = resolvedPeopleByName.get(normalize(assignment.personId));
    const groupId = resolveFixedAssignmentGroupId(assignment.groupId, groups);
    if (!personId || !groupId) {
      continue;
    }

    constraints.push({
      type: 'ImmovablePeople',
      people: [personId],
      group_id: groupId,
    });
  }

  const manualBalanceTargets = normalizeBalanceTargets(draft.balanceTargets);
  if (hasAnyBalanceTargets(manualBalanceTargets)) {
    for (const group of groups) {
      for (const [attributeKey, targetsByGroup] of Object.entries(manualBalanceTargets)) {
        const desiredValues = targetsByGroup[group.id];
        if (!desiredValues) {
          continue;
        }

        constraints.push({
          type: 'AttributeBalance',
          group_id: group.id,
          attribute_key: attributeKey,
          desired_values: desiredValues,
          penalty_weight: 30,
          mode: 'exact',
        });
      }
    }
  } else if (draft.balanceAttributeKey) {
    const desiredByGroup = deriveBalancedTargetValues(people, groups, draft.balanceAttributeKey);
    for (const group of groups) {
      constraints.push({
        type: 'AttributeBalance',
        group_id: group.id,
        attribute_key: draft.balanceAttributeKey,
        desired_values: desiredByGroup[group.id] ?? {},
        penalty_weight: 30,
        mode: 'exact',
      });
    }
  }

  return constraints;
}
