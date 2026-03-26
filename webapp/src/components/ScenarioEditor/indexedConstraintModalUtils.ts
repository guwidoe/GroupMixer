import type { Constraint, Scenario } from '../../types';

export function getIndexedConstraint<T extends Constraint>(scenario: Scenario, index: number | null): T | null {
  if (index === null) {
    return null;
  }

  return (scenario.constraints[index] as T | undefined) ?? null;
}

export function saveIndexedConstraint<T extends Constraint>(
  scenario: Scenario,
  constraint: T,
  index: number | null,
): Scenario {
  const constraints = [...scenario.constraints];

  if (index === null) {
    constraints.push(constraint);
  } else {
    constraints[index] = constraint;
  }

  return {
    ...scenario,
    constraints,
  };
}
