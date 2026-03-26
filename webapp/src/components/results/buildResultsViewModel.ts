import type { Scenario, Solution } from '../../types';

export interface ResultsSessionGroup {
  id: string;
  size: number;
  people: Array<Scenario['people'][number]>;
}

export interface ResultsSessionData {
  sessionIndex: number;
  groups: ResultsSessionGroup[];
  totalPeople: number;
}

export function buildResultsSessionData(scenario: Scenario, solution: Solution): ResultsSessionData[] {
  return Array.from({ length: scenario.num_sessions || 0 }, (_, sessionIndex) => {
    const sessionAssignments = solution.assignments.filter((assignment) => assignment.session_id === sessionIndex);

    const groups = scenario.groups.map((group) => {
      const groupAssignments = sessionAssignments.filter((assignment) => assignment.group_id === group.id);
      const people = groupAssignments
        .map((assignment) => scenario.people.find((person) => person.id === assignment.person_id))
        .filter((person): person is Scenario['people'][number] => Boolean(person));

      return {
        ...group,
        people,
      };
    });

    return {
      sessionIndex,
      groups,
      totalPeople: sessionAssignments.length,
    };
  });
}
