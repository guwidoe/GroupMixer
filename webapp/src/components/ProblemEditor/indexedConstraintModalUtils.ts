import type { Constraint, Problem } from '../../types';

export function getIndexedConstraint<T extends Constraint>(problem: Problem, index: number | null): T | null {
  if (index === null) {
    return null;
  }

  return (problem.constraints[index] as T | undefined) ?? null;
}

export function saveIndexedConstraint<T extends Constraint>(
  problem: Problem,
  constraint: T,
  index: number | null,
): Problem {
  const constraints = [...problem.constraints];

  if (index === null) {
    constraints.push(constraint);
  } else {
    constraints[index] = constraint;
  }

  return {
    ...problem,
    constraints,
  };
}
