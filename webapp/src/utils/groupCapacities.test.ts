import { describe, expect, it } from 'vitest';
import { createSampleScenario } from '../test/fixtures';
import {
  getEffectiveGroupCapacity,
  getGroupCapacityProfile,
  getScenarioMaxGroupCapacity,
  hasSessionSpecificGroupCapacities,
} from './groupCapacities';

describe('groupCapacities', () => {
  it('falls back to the default group size when no session override exists', () => {
    const group = { id: 'g1', size: 4 };

    expect(getEffectiveGroupCapacity(group, 0)).toBe(4);
    expect(getEffectiveGroupCapacity(group, 3)).toBe(4);
  });

  it('uses session-specific capacities when present', () => {
    const group = { id: 'g1', size: 4, session_sizes: [4, 0, 2] };

    expect(getEffectiveGroupCapacity(group, 0)).toBe(4);
    expect(getEffectiveGroupCapacity(group, 1)).toBe(0);
    expect(getEffectiveGroupCapacity(group, 2)).toBe(2);
    expect(getGroupCapacityProfile(group, 3)).toEqual([4, 0, 2]);
    expect(hasSessionSpecificGroupCapacities(group, 3)).toBe(true);
  });

  it('computes scenario-wide max capacity across session-specific overrides', () => {
    const scenario = createSampleScenario({
      num_sessions: 3,
      groups: [
        { id: 'g1', size: 2, session_sizes: [2, 0, 2] },
        { id: 'g2', size: 3, session_sizes: [3, 5, 1] },
      ],
    });

    expect(getScenarioMaxGroupCapacity(scenario)).toBe(5);
  });
});
