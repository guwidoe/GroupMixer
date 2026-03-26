import type { Scenario, ScenarioSnapshot, SolverSettings } from '../types';

export function snapshotToScenario(snapshot: ScenarioSnapshot, settings: SolverSettings): Scenario {
  return {
    ...snapshot,
    settings,
  };
}
