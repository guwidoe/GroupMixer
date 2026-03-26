import { describe, expect, it } from 'vitest';
import type { Constraint } from '../../types';
import { createSampleProblem } from '../../test/fixtures';
import {
  removeConstraintAtIndex,
  removePersonFromPeopleConstraint,
  replaceConstraintsAtIndices,
} from './constraintMutations';

function createProblemWithConstraints(constraints: Constraint[]) {
  return createSampleProblem({ constraints });
}

describe('constraintMutations', () => {
  it('removes an entire constraint by index', () => {
    const problem = createProblemWithConstraints([
      { type: 'MustStayTogether', people: ['p1', 'p2'] },
      { type: 'ShouldStayTogether', people: ['p3', 'p4'], penalty_weight: 5 },
    ]);

    const updated = removeConstraintAtIndex(problem, 0);

    expect(updated.constraints).toEqual([
      { type: 'ShouldStayTogether', people: ['p3', 'p4'], penalty_weight: 5 },
    ]);
  });

  it('removes a person from a people-based constraint while keeping it valid', () => {
    const problem = createProblemWithConstraints([
      { type: 'ShouldStayTogether', people: ['p1', 'p2', 'p3'], penalty_weight: 8 },
    ]);

    const updated = removePersonFromPeopleConstraint(problem, 0, 'p2', 2);

    expect(updated.constraints).toEqual([
      { type: 'ShouldStayTogether', people: ['p1', 'p3'], penalty_weight: 8 },
    ]);
  });

  it('removes a people-based constraint entirely when it would become invalid', () => {
    const problem = createProblemWithConstraints([
      { type: 'MustStayTogether', people: ['p1', 'p2'] },
    ]);

    const updated = removePersonFromPeopleConstraint(problem, 0, 'p1', 2);

    expect(updated.constraints).toEqual([]);
  });

  it('replaces selected constraints with expanded constraints', () => {
    const problem = createProblemWithConstraints([
      { type: 'MustStayTogether', people: ['p1', 'p2'] },
      { type: 'RepeatEncounter', max_allowed_encounters: 1, penalty_function: 'linear', penalty_weight: 3 },
    ]);

    const updated = replaceConstraintsAtIndices(problem, [0], (constraint) => {
      if (constraint.type !== 'MustStayTogether') {
        return [constraint];
      }

      return [
        {
          type: 'ShouldStayTogether',
          people: constraint.people,
          penalty_weight: 10,
        },
      ];
    });

    expect(updated.constraints).toEqual([
      { type: 'ShouldStayTogether', people: ['p1', 'p2'], penalty_weight: 10 },
      { type: 'RepeatEncounter', max_allowed_encounters: 1, penalty_function: 'linear', penalty_weight: 3 },
    ]);
  });
});
