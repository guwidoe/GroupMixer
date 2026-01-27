import type { Problem, ProblemSnapshot, SolverSettings } from '../types';

export function snapshotToProblem(snapshot: ProblemSnapshot, settings: SolverSettings): Problem {
  return {
    ...snapshot,
    settings,
  };
}
