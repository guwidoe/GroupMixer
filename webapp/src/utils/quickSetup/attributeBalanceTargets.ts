import type { Group, Person } from '../../types';

export type QuickSetupBalanceTargets = Record<string, Record<string, Record<string, number>>>;

function normalizeCount(value: number) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function normalizeBalanceTargetValues(values: Record<string, number> | undefined): Record<string, number> {
  if (!values) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, normalizeCount(value)] as const)
      .filter(([key]) => key.trim().length > 0),
  );
}

export function deriveBalancedTargetValues(
  people: Person[],
  groups: Group[],
  attributeKey: string,
): Record<string, Record<string, number>> {
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

  return Object.fromEntries(
    groups.map((group, index) => [group.id, assignments[index] ?? {}] as const),
  );
}

export function normalizeBalanceTargets(balanceTargets: QuickSetupBalanceTargets | undefined): QuickSetupBalanceTargets {
  if (!balanceTargets) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(balanceTargets)
      .map(([attributeKey, groups]) => {
        const normalizedGroups = Object.fromEntries(
          Object.entries(groups ?? {})
            .map(([groupId, values]) => [groupId, normalizeBalanceTargetValues(values)] as const)
            .filter(([, values]) => Object.keys(values).length > 0),
        );

        return [attributeKey, normalizedGroups] as const;
      })
      .filter(([, groups]) => Object.keys(groups).length > 0),
  );
}

export function setBalanceTargetValues(
  balanceTargets: QuickSetupBalanceTargets | undefined,
  attributeKey: string,
  groupId: string,
  values: Record<string, number>,
): QuickSetupBalanceTargets {
  const normalizedValues = normalizeBalanceTargetValues(values);
  const nextTargets = normalizeBalanceTargets(balanceTargets);

  if (!nextTargets[attributeKey]) {
    nextTargets[attributeKey] = {};
  }

  if (Object.keys(normalizedValues).length === 0) {
    delete nextTargets[attributeKey][groupId];
    if (Object.keys(nextTargets[attributeKey]).length === 0) {
      delete nextTargets[attributeKey];
    }
    return nextTargets;
  }

  nextTargets[attributeKey][groupId] = normalizedValues;
  return nextTargets;
}

export function setBalanceAttributeTargets(
  balanceTargets: QuickSetupBalanceTargets | undefined,
  attributeKey: string,
  targetsByGroup: Record<string, Record<string, number>>,
): QuickSetupBalanceTargets {
  const nextTargets = normalizeBalanceTargets(balanceTargets);
  const normalizedTargetsByGroup = Object.fromEntries(
    Object.entries(targetsByGroup)
      .map(([groupId, values]) => [groupId, normalizeBalanceTargetValues(values)] as const)
      .filter(([, values]) => Object.keys(values).length > 0),
  );

  if (Object.keys(normalizedTargetsByGroup).length === 0) {
    delete nextTargets[attributeKey];
    return nextTargets;
  }

  nextTargets[attributeKey] = normalizedTargetsByGroup;
  return nextTargets;
}

export function hasAnyBalanceTargets(balanceTargets: QuickSetupBalanceTargets | undefined): boolean {
  return Object.keys(normalizeBalanceTargets(balanceTargets)).length > 0;
}
