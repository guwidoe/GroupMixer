import type { Group, Scenario, ScenarioSnapshot } from '../types';

export function getEffectiveGroupCapacity(
  group: Pick<Group, 'size' | 'session_sizes'>,
  sessionIndex: number,
): number {
  const sessionSizes = group.session_sizes;
  if (Array.isArray(sessionSizes) && sessionIndex >= 0 && sessionIndex < sessionSizes.length) {
    const value = sessionSizes[sessionIndex];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return group.size;
}

export function getGroupCapacityProfile(
  group: Pick<Group, 'size' | 'session_sizes'>,
  numSessions: number,
): number[] {
  return Array.from({ length: Math.max(0, numSessions) }, (_, sessionIndex) =>
    getEffectiveGroupCapacity(group, sessionIndex),
  );
}

export function hasSessionSpecificGroupCapacities(
  group: Pick<Group, 'size' | 'session_sizes'>,
  numSessions: number,
): boolean {
  if (!Array.isArray(group.session_sizes) || group.session_sizes.length === 0) {
    return false;
  }

  return getGroupCapacityProfile(group, numSessions).some((capacity) => capacity !== group.size);
}

export function getMaxGroupCapacity(
  group: Pick<Group, 'size' | 'session_sizes'>,
  numSessions: number,
): number {
  const capacities = getGroupCapacityProfile(group, numSessions);
  return capacities.length > 0 ? Math.max(...capacities) : group.size;
}

export function getScenarioMaxGroupCapacity(
  scenario: Pick<Scenario | ScenarioSnapshot, 'groups' | 'num_sessions'>,
): number {
  if (!scenario.groups || scenario.groups.length === 0) {
    return 0;
  }

  return Math.max(...scenario.groups.map((group) => getMaxGroupCapacity(group, scenario.num_sessions)));
}
