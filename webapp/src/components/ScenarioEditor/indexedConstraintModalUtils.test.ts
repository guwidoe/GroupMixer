import { describe, expect, it } from 'vitest';
import type { Constraint } from '../../types';
import { createSampleScenario } from '../../test/fixtures';
import { getIndexedConstraint, saveIndexedConstraint } from './indexedConstraintModalUtils';

describe('indexedConstraintModalUtils', () => {
  it('returns the indexed constraint when present', () => {
    const constraint: Constraint = {
      type: 'RepeatEncounter',
      max_allowed_encounters: 1,
      penalty_function: 'linear',
      penalty_weight: 2,
    };
    const scenario = createSampleScenario({ constraints: [constraint] });

    expect(getIndexedConstraint(scenario, 0)).toEqual(constraint);
    expect(getIndexedConstraint(scenario, null)).toBeNull();
  });

  it('appends or replaces constraints without mutating the original scenario', () => {
    const original: Constraint = {
      type: 'RepeatEncounter',
      max_allowed_encounters: 1,
      penalty_function: 'linear',
      penalty_weight: 2,
    };
    const replacement: Constraint = {
      type: 'ShouldStayTogether',
      people: ['p1', 'p2'],
      penalty_weight: 5,
    };
    const scenario = createSampleScenario({ constraints: [original] });

    const replaced = saveIndexedConstraint(scenario, replacement, 0);
    const appended = saveIndexedConstraint(scenario, replacement, null);

    expect(replaced.constraints).toEqual([replacement]);
    expect(appended.constraints).toEqual([original, replacement]);
    expect(scenario.constraints).toEqual([original]);
  });
});
