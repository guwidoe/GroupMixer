import type { Group, Person } from '../../types';

export type QuickSetupBalanceTargets = Record<string, Record<string, Record<string, number>>>;

function normalizeAttributeKeys(keys: string[] | undefined): string[] {
  return [...new Set((keys ?? []).map((key) => key.trim()).filter(Boolean))];
}

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
  const assignedGroupTotals = groups.map(() => 0);

  for (const [value, total] of entries) {
    const exactTargets = groups.map((group) => (total * group.size) / Math.max(1, people.length));
    const floors = exactTargets.map((target) => Math.floor(target));
    let remaining = total - floors.reduce((sum, current) => sum + current, 0);
    const order = exactTargets
      .map((target, index) => ({
        index,
        fraction: target - floors[index],
        exactTarget: target,
      }))
      .sort((left, right) => {
        const fractionDelta = right.fraction - left.fraction;
        if (fractionDelta !== 0) {
          return fractionDelta;
        }

        const remainingCapacityDelta = (groups[right.index].size - assignedGroupTotals[right.index])
          - (groups[left.index].size - assignedGroupTotals[left.index]);
        if (remainingCapacityDelta !== 0) {
          return remainingCapacityDelta;
        }

        const exactTargetDelta = right.exactTarget - left.exactTarget;
        if (exactTargetDelta !== 0) {
          return exactTargetDelta;
        }

        return left.index - right.index;
      });

    for (const group of assignments) {
      group[value] = 0;
    }
    floors.forEach((count, index) => {
      assignments[index][value] = count;
      assignedGroupTotals[index] += count;
    });

    for (const candidate of order) {
      if (remaining <= 0) {
        break;
      }

      const groupIndex = candidate.index;
      if (assignedGroupTotals[groupIndex] >= groups[groupIndex].size) {
        continue;
      }

      assignments[groupIndex][value] += 1;
      assignedGroupTotals[groupIndex] += 1;
      remaining -= 1;
    }

    if (remaining > 0) {
      const fallbackOrder = groups
        .map((group, index) => ({ index, remainingCapacity: group.size - assignedGroupTotals[index] }))
        .filter((candidate) => candidate.remainingCapacity > 0)
        .sort((left, right) => right.remainingCapacity - left.remainingCapacity || left.index - right.index);

      for (const candidate of fallbackOrder) {
        if (remaining <= 0) {
          break;
        }

        assignments[candidate.index][value] += 1;
        assignedGroupTotals[candidate.index] += 1;
        remaining -= 1;
      }
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

export function normalizeManualBalanceAttributeKeys(
  manualBalanceAttributeKeys: string[] | undefined,
  availableAttributeKeys: string[] | undefined,
  balanceTargets?: QuickSetupBalanceTargets,
): string[] {
  const availableKeys = normalizeAttributeKeys(availableAttributeKeys);
  const fallbackKeys = Object.keys(normalizeBalanceTargets(balanceTargets));
  const baseKeys = manualBalanceAttributeKeys ?? fallbackKeys;

  return normalizeAttributeKeys(baseKeys).filter((key) => availableKeys.includes(key));
}

export function isBalanceAttributeAutoDistributed(
  manualBalanceAttributeKeys: string[] | undefined,
  attributeKey: string,
): boolean {
  const normalizedAttributeKey = attributeKey.trim();
  if (normalizedAttributeKey.length === 0) {
    return false;
  }

  return !normalizeAttributeKeys(manualBalanceAttributeKeys).includes(normalizedAttributeKey);
}

export function setBalanceAttributeAutoDistributionEnabled(
  manualBalanceAttributeKeys: string[] | undefined,
  attributeKey: string,
  enabled: boolean,
): string[] {
  const normalizedAttributeKey = attributeKey.trim();
  const nextManualKeys = normalizeAttributeKeys(manualBalanceAttributeKeys).filter((key) => key !== normalizedAttributeKey);

  if (!enabled && normalizedAttributeKey.length > 0) {
    nextManualKeys.push(normalizedAttributeKey);
  }

  return nextManualKeys;
}

export function syncAutoBalanceTargets(options: {
  balanceTargets: QuickSetupBalanceTargets | undefined;
  manualBalanceAttributeKeys: string[] | undefined;
  people: Person[];
  groups: Group[];
  availableAttributeKeys: string[];
}): {
  balanceTargets: QuickSetupBalanceTargets;
  manualBalanceAttributeKeys: string[];
} {
  const { balanceTargets, manualBalanceAttributeKeys, people, groups, availableAttributeKeys } = options;
  const availableKeys = normalizeAttributeKeys(availableAttributeKeys);
  const normalizedTargets = normalizeBalanceTargets(balanceTargets);
  const nextManualKeys = normalizeManualBalanceAttributeKeys(manualBalanceAttributeKeys, availableKeys, normalizedTargets);
  let nextTargets = Object.fromEntries(
    Object.entries(normalizedTargets).filter(([attributeKey]) => availableKeys.includes(attributeKey)),
  );

  for (const attributeKey of availableKeys) {
    if (!isBalanceAttributeAutoDistributed(nextManualKeys, attributeKey)) {
      continue;
    }

    nextTargets = setBalanceAttributeTargets(
      nextTargets,
      attributeKey,
      deriveBalancedTargetValues(people, groups, attributeKey),
    );
  }

  return {
    balanceTargets: nextTargets,
    manualBalanceAttributeKeys: nextManualKeys,
  };
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
