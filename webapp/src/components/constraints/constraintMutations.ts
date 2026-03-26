import type { Constraint, Scenario } from '../../types';

type PeopleConstraint = Constraint & { people: string[] };

function hasPeople(constraint: Constraint): constraint is PeopleConstraint {
  return 'people' in constraint && Array.isArray(constraint.people);
}

export function removeConstraintAtIndex(scenario: Scenario, constraintIndex: number): Scenario {
  return {
    ...scenario,
    constraints: scenario.constraints.filter((_, index) => index !== constraintIndex),
  };
}

export function replaceConstraintsAtIndices(
  scenario: Scenario,
  indices: number[],
  replacer: (constraint: Constraint, index: number) => Constraint[],
): Scenario {
  const selectedIndices = new Set(indices);

  return {
    ...scenario,
    constraints: scenario.constraints.flatMap((constraint, index) => {
      if (!selectedIndices.has(index)) {
        return [constraint];
      }

      return replacer(constraint, index);
    }),
  };
}

export function removePersonFromPeopleConstraint(
  scenario: Scenario,
  constraintIndex: number,
  personId: string,
  minimumPeople: number,
): Scenario {
  const constraint = scenario.constraints[constraintIndex];
  if (!constraint || !hasPeople(constraint)) {
    return scenario;
  }

  const remainingPeople = constraint.people.filter((currentPersonId) => currentPersonId !== personId);
  if (remainingPeople.length === constraint.people.length) {
    return scenario;
  }

  if (remainingPeople.length < minimumPeople) {
    return removeConstraintAtIndex(scenario, constraintIndex);
  }

  return {
    ...scenario,
    constraints: scenario.constraints.map((currentConstraint, index) =>
      index === constraintIndex
        ? ({ ...constraint, people: remainingPeople } as Constraint)
        : currentConstraint,
    ),
  };
}
