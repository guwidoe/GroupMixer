import type { Assignment, Problem, ProblemSnapshot, SolverSettings } from '../../types';
import { buildScheduleMap } from '../../services/evaluator';

export function cloneAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => ({ ...a }));
}

export function groupBySessionAndGroup(assignments: Assignment[]): Record<number, Record<string, string[]>> {
  return buildScheduleMap(assignments);
}

export function snapshotToProblem(snapshot: ProblemSnapshot, settings: SolverSettings): Problem {
  return {
    ...snapshot,
    settings,
  };
}
