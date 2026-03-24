import type { Constraint, Problem } from '../../types';

type PeopleConstraint = Constraint & { people: string[] };

function hasPeople(constraint: Constraint): constraint is PeopleConstraint {
  return 'people' in constraint && Array.isArray(constraint.people);
}

export function removeConstraintAtIndex(problem: Problem, constraintIndex: number): Problem {
  return {
    ...problem,
    constraints: problem.constraints.filter((_, index) => index !== constraintIndex),
  };
}

export function replaceConstraintsAtIndices(
  problem: Problem,
  indices: number[],
  replacer: (constraint: Constraint, index: number) => Constraint[],
): Problem {
  const selectedIndices = new Set(indices);

  return {
    ...problem,
    constraints: problem.constraints.flatMap((constraint, index) => {
      if (!selectedIndices.has(index)) {
        return [constraint];
      }

      return replacer(constraint, index);
    }),
  };
}

export function removePersonFromPeopleConstraint(
  problem: Problem,
  constraintIndex: number,
  personId: string,
  minimumPeople: number,
): Problem {
  const constraint = problem.constraints[constraintIndex];
  if (!constraint || !hasPeople(constraint)) {
    return problem;
  }

  const remainingPeople = constraint.people.filter((currentPersonId) => currentPersonId !== personId);
  if (remainingPeople.length === constraint.people.length) {
    return problem;
  }

  if (remainingPeople.length < minimumPeople) {
    return removeConstraintAtIndex(problem, constraintIndex);
  }

  return {
    ...problem,
    constraints: problem.constraints.map((currentConstraint, index) =>
      index === constraintIndex
        ? ({ ...constraint, people: remainingPeople } as Constraint)
        : currentConstraint,
    ),
  };
}
