import type { Constraint, Scenario } from '../../types';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export interface WasmScenarioContractInput {
  scenario: Scenario;
  initial_schedule?: WarmStartSchedule;
}

export interface WasmScenarioRecommendSettingsRequest {
  scenario: Scenario;
  desired_runtime_seconds: number;
}

/**
 * Canonical browser→WASM boundary.
 *
 * `Scenario` is the browser/UI noun. All browser-side solver entrypoints should pass through
 * this module before touching WASM so default objectives, constraint/session normalization,
 * and solver-settings sanitization stay consistent across direct WASM calls, worker calls,
 * and browser-agent usage.
 */
export function normalizeScenarioForWasm(scenario: Scenario): Scenario {
  const solverSettings = { ...scenario.settings };

  if (solverSettings.solver_params && typeof solverSettings.solver_params === 'object') {
    const solverType = solverSettings.solver_type;
    if (solverType === 'SimulatedAnnealing' && 'SimulatedAnnealing' in solverSettings.solver_params) {
      const params = solverSettings.solver_params.SimulatedAnnealing as unknown as Record<string, unknown>;
      const sanitizeNumber = (v: unknown, d: number) => (typeof v === 'number' && !isNaN(v) ? v : d);
      params.initial_temperature = sanitizeNumber(params.initial_temperature, 1.0);
      params.final_temperature = sanitizeNumber(params.final_temperature, 0.01);
      params.reheat_cycles = sanitizeNumber(params.reheat_cycles, 0);
      params.reheat_after_no_improvement = sanitizeNumber(params.reheat_after_no_improvement, 0);

      (solverSettings.solver_params as unknown as Record<string, unknown>) = {
        solver_type: solverType,
        ...solverSettings.solver_params.SimulatedAnnealing,
      };
    }
  }

  const cleanedConstraints = (scenario.constraints || []).map((constraint: Constraint) => {
    if (
      (constraint.type === 'ShouldStayTogether' || constraint.type === 'ShouldNotBeTogether') &&
      (constraint.penalty_weight === undefined || constraint.penalty_weight === null)
    ) {
      return { ...constraint, penalty_weight: 1000 };
    }
    if (
      constraint.type === 'AttributeBalance' &&
      (constraint.penalty_weight === undefined || constraint.penalty_weight === null)
    ) {
      return { ...constraint, penalty_weight: 50 };
    }
    if (
      constraint.type === 'RepeatEncounter' &&
      (constraint.penalty_weight === undefined || constraint.penalty_weight === null)
    ) {
      return { ...constraint, penalty_weight: 1 };
    }
    return constraint;
  });

  const allSessions = Array.from({ length: scenario.num_sessions }, (_, i) => i);
  const normalizedConstraints = cleanedConstraints.map((constraint: Constraint) => {
    if (constraint.type === 'ImmovablePeople') {
      const sessions = (constraint as unknown as { sessions?: number[] }).sessions;
      return {
        ...constraint,
        sessions: Array.isArray(sessions) && sessions.length > 0 ? sessions : allSessions,
      } as Constraint;
    }
    if (constraint.type === 'ImmovablePerson') {
      const sessions = (constraint as unknown as { sessions?: number[] }).sessions;
      return {
        ...constraint,
        sessions: Array.isArray(sessions) && sessions.length > 0 ? sessions : allSessions,
      } as Constraint;
    }
    return constraint;
  });

  const objectives =
    scenario.objectives && scenario.objectives.length > 0
      ? scenario.objectives
      : [
          {
            type: 'maximize_unique_contacts',
            weight: 1.0,
          },
        ];

  return {
    ...scenario,
    objectives,
    constraints: normalizedConstraints,
    settings: solverSettings,
  };
}

export function buildWasmScenarioInput(scenario: Scenario): WasmScenarioContractInput {
  return {
    scenario: normalizeScenarioForWasm(scenario),
  };
}

export function buildWasmWarmStartInput(
  scenario: Scenario,
  initialSchedule: WarmStartSchedule,
): WasmScenarioContractInput {
  return {
    scenario: normalizeScenarioForWasm(scenario),
    initial_schedule: initialSchedule,
  };
}

export function buildWasmRecommendSettingsRequest(
  scenario: Scenario,
  desiredRuntimeSeconds: number,
): WasmScenarioRecommendSettingsRequest {
  return {
    scenario: normalizeScenarioForWasm(scenario),
    desired_runtime_seconds: desiredRuntimeSeconds,
  };
}
