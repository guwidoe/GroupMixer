import type { Constraint, Group, Person } from '../../types';
import type { QuickSetupDraft } from '../../components/LandingTool/types';

function normalize(value: string) {
  return value.trim().toLowerCase();
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
  const byName = new Map(people.map((person) => [normalize(person.id), person.id] as const));
  return names
    .map((name) => byName.get(normalize(name)))
    .filter((id): id is string => Boolean(id));
}

function deriveDesiredValues(people: Person[], groups: Group[], attributeKey: string) {
  const totals = new Map<string, number>();
  for (const person of people) {
    const value = person.attributes[attributeKey];
    if (value) {
      totals.set(value, (totals.get(value) ?? 0) + 1);
    }
  }

  const entries = [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
  const assignments: Record<string, number>[] = groups.map(() => ({}));

  for (const [value, total] of entries) {
    const exactTargets = groups.map((group) => (total * group.size) / Math.max(1, people.length));
    const floors = exactTargets.map((target) => Math.floor(target));
    let remaining = total - floors.reduce((sum, current) => sum + current, 0);
    const order = exactTargets
      .map((target, index) => ({ index, fraction: target - floors[index] }))
      .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

    for (const group of assignments) {
      group[value] = 0;
    }
    floors.forEach((count, index) => {
      assignments[index][value] = count;
    });
    for (let index = 0; index < order.length && remaining > 0; index += 1) {
      assignments[order[index].index][value] += 1;
      remaining -= 1;
    }
  }

  return assignments;
}

export function buildConstraints(
  draft: Pick<
    QuickSetupDraft,
    'sessions' | 'keepTogetherInput' | 'avoidPairingsInput' | 'balanceAttributeKey'
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

  if (draft.balanceAttributeKey) {
    const desiredByGroup = deriveDesiredValues(people, groups, draft.balanceAttributeKey);
    for (const [index, group] of groups.entries()) {
      constraints.push({
        type: 'AttributeBalance',
        group_id: group.id,
        attribute_key: draft.balanceAttributeKey,
        desired_values: desiredByGroup[index],
        penalty_weight: 30,
        mode: 'exact',
      });
    }
  }

  return constraints;
}
