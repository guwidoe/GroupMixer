import type { Assignment, Scenario, ScenarioSnapshot, SolverSettings } from '../../types';
import { buildScheduleMap } from '../../services/evaluator';

export function cloneAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => ({ ...a }));
}

export function groupBySessionAndGroup(assignments: Assignment[]): Record<number, Record<string, string[]>> {
  return buildScheduleMap(assignments);
}

export function snapshotToScenario(snapshot: ScenarioSnapshot, settings: SolverSettings): Scenario {
  return {
    ...snapshot,
    settings,
  };
}
