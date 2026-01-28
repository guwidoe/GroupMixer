import type { Problem, ProblemSnapshot } from '../../types';

export interface ProblemConfigDifference {
  isDifferent: boolean;
  changes: {
    people?: boolean;
    groups?: boolean;
    num_sessions?: boolean;
    objectives?: boolean;
    constraints?: boolean;
  };
  details: {
    people?: string;
    groups?: string;
    num_sessions?: string;
    objectives?: string;
    constraints?: string;
  };
}

export function compareProblemConfigurations(
  current: Problem,
  snapshot: ProblemSnapshot | undefined,
): ProblemConfigDifference {
  if (!snapshot) {
    return {
      isDifferent: true,
      changes: {},
      details: {
        people: 'No configuration saved with this result',
        groups: 'No configuration saved with this result',
        num_sessions: 'No configuration saved with this result',
        objectives: 'No configuration saved with this result',
        constraints: 'No configuration saved with this result',
      },
    };
  }

  const changes: ProblemConfigDifference['changes'] = {};
  const details: ProblemConfigDifference['details'] = {};

  if (JSON.stringify(current.people) !== JSON.stringify(snapshot.people)) {
    changes.people = true;
    details.people = `People configuration changed (${current.people.length} now vs ${snapshot.people.length} when result was created)`;
  }

  if (JSON.stringify(current.groups) !== JSON.stringify(snapshot.groups)) {
    changes.groups = true;
    details.groups = `Groups configuration changed (${current.groups.length} now vs ${snapshot.groups.length} when result was created)`;
  }

  if (current.num_sessions !== snapshot.num_sessions) {
    changes.num_sessions = true;
    details.num_sessions = `Number of sessions changed (${current.num_sessions} now vs ${snapshot.num_sessions} when result was created)`;
  }

  if (JSON.stringify(current.objectives) !== JSON.stringify(snapshot.objectives)) {
    changes.objectives = true;
    details.objectives = 'Objectives configuration changed';
  }

  if (JSON.stringify(current.constraints) !== JSON.stringify(snapshot.constraints)) {
    changes.constraints = true;
    details.constraints = `Constraints changed (${current.constraints.length} now vs ${snapshot.constraints.length} when result was created)`;
  }

  const isDifferent = Object.keys(changes).length > 0;

  return {
    isDifferent,
    changes,
    details,
  };
}
