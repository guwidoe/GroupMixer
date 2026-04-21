import { getPersonAttributeValue } from '../../services/scenarioAttributes';
import type { AttributeDefinition, Group, Person } from '../../types';
import {
  DISTRIBUTION_UNALLOCATED_KEY,
  getAttributeDistributionBuckets,
  type AttributeDistributionValue,
} from '../ui';

export interface GroupCapacityResolution {
  capacity: number;
  capacities: number[];
  hasVariance: boolean;
}

function roundNonNegativeInt(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function getGroupCapacityForSession(group: Group, session: number) {
  const sessionCapacity = group.session_sizes?.[session];
  return roundNonNegativeInt(sessionCapacity ?? group.size);
}

export function resolveGroupCapacityForSessions(group: Group | undefined, sessions: number[]): GroupCapacityResolution {
  if (!group) {
    return { capacity: 0, capacities: [], hasVariance: false };
  }

  const applicableSessions = sessions.length > 0 ? sessions : [0];
  const capacities = applicableSessions.map((session) => getGroupCapacityForSession(group, session));
  const capacity = capacities.length > 0 ? Math.min(...capacities) : roundNonNegativeInt(group.size);

  return {
    capacity,
    capacities,
    hasVariance: capacities.some((candidate) => candidate !== capacity),
  };
}

export function doesPersonParticipateInSelectedSessions(person: Person, sessions: number[]): boolean {
  if (sessions.length === 0) {
    return true;
  }

  if (!person.sessions || person.sessions.length === 0) {
    return true;
  }

  return person.sessions.some((session) => sessions.includes(session));
}

export function apportionCountsByLargestRemainder(
  sourceCounts: Record<string, number>,
  orderedKeys: string[],
  capacity: number,
): Record<string, number> {
  const safeCapacity = roundNonNegativeInt(capacity);
  const totals = orderedKeys.map((key) => roundNonNegativeInt(sourceCounts[key] ?? 0));
  const totalSource = totals.reduce((sum, count) => sum + count, 0);

  if (safeCapacity <= 0) {
    return Object.fromEntries(orderedKeys.map((key) => [key, 0]));
  }

  if (totalSource <= 0) {
    return Object.fromEntries(
      orderedKeys.map((key) => [key, key === DISTRIBUTION_UNALLOCATED_KEY ? safeCapacity : 0]),
    );
  }

  const quotas = totals.map((count) => (count / totalSource) * safeCapacity);
  const floors = quotas.map((quota) => Math.floor(quota));
  let remaining = safeCapacity - floors.reduce((sum, count) => sum + count, 0);

  const byRemainder = quotas
    .map((quota, index) => ({ index, remainder: quota - floors[index] }))
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }
      return left.index - right.index;
    });

  for (let index = 0; index < byRemainder.length && remaining > 0; index += 1) {
    floors[byRemainder[index].index] += 1;
    remaining -= 1;
  }

  return Object.fromEntries(orderedKeys.map((key, index) => [key, floors[index] ?? 0]));
}

export function buildSuggestedAttributeDistribution(params: {
  people: Person[];
  attributeDefinition: AttributeDefinition;
  attributeDefinitions: AttributeDefinition[];
  sessions: number[];
  capacity: number;
}): AttributeDistributionValue {
  const { people, attributeDefinition, attributeDefinitions, sessions, capacity } = params;
  const buckets = getAttributeDistributionBuckets(attributeDefinition.values);
  const sourceCounts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0])) as Record<string, number>;
  const knownValues = new Set(attributeDefinition.values);

  people.forEach((person) => {
    if (!doesPersonParticipateInSelectedSessions(person, sessions)) {
      return;
    }

    const rawValue = getPersonAttributeValue(person, attributeDefinitions, {
      id: attributeDefinition.id,
      name: attributeDefinition.name,
    });
    const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    const bucketKey = trimmedValue && knownValues.has(trimmedValue) ? trimmedValue : DISTRIBUTION_UNALLOCATED_KEY;
    sourceCounts[bucketKey] = (sourceCounts[bucketKey] ?? 0) + 1;
  });

  const apportioned = apportionCountsByLargestRemainder(
    sourceCounts,
    buckets.map((bucket) => bucket.key),
    capacity,
  );

  const desiredValues: AttributeDistributionValue = {};
  attributeDefinition.values.forEach((value) => {
    const count = roundNonNegativeInt(apportioned[value] ?? 0);
    if (count > 0) {
      desiredValues[value] = count;
    }
  });

  return desiredValues;
}

export function areAttributeDistributionValuesEqual(
  left: AttributeDistributionValue | undefined,
  right: AttributeDistributionValue | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {})
    .filter(([, value]) => roundNonNegativeInt(value) > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(right ?? {})
    .filter(([, value]) => roundNonNegativeInt(value) > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([leftKey, leftValue], index) => {
    const [rightKey, rightValue] = rightEntries[index] ?? [];
    return leftKey === rightKey && roundNonNegativeInt(leftValue) === roundNonNegativeInt(rightValue);
  });
}
