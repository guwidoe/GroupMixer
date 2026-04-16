import type {
  AttributeBalanceParams,
  Constraint,
  Group,
  ImmovablePeopleParams,
  ImmovablePersonParams,
  Objective,
  Person,
  Scenario,
  SolverSettings,
} from '../../types';
import { reconcileScenarioAttributeDefinitions, reconcileScenarioAttributeState } from '../scenarioAttributes';
import { normalizeSolverFamilyId } from '../solverCatalog';

export type WarmStartSchedule = Record<string, Record<string, string[]>>;

export interface WasmScenarioContractInput {
  scenario: Scenario;
  initial_schedule?: WarmStartSchedule;
  construction_seed_schedule?: WarmStartSchedule;
}

export interface WasmScenarioRecommendSettingsRequest {
  scenario: Scenario;
  desired_runtime_seconds: number;
}

function cloneOptionalNumberArray(values?: number[]): number[] | undefined {
  return Array.isArray(values) ? [...values] : undefined;
}

function clonePeople(people: Person[]): Person[] {
  return people.map((person) => {
    const clonedPerson: Person = {
      id: person.id,
      attributes: { ...person.attributes },
    };

    const sessions = cloneOptionalNumberArray(person.sessions);
    if (sessions !== undefined) {
      clonedPerson.sessions = sessions;
    }

    return clonedPerson;
  });
}

function cloneGroups(groups: Group[]): Group[] {
  return groups.map((group) => {
    const clonedGroup: Group = {
      ...group,
    };

    const sessionSizes = cloneOptionalNumberArray(group.session_sizes);
    if (sessionSizes !== undefined) {
      clonedGroup.session_sizes = sessionSizes;
    }

    return clonedGroup;
  });
}

function normalizeObjectivesForWasm(objectives?: Objective[]): Objective[] {
  if (objectives && objectives.length > 0) {
    return objectives.map((objective) => ({ ...objective }));
  }

  return [
    {
      type: 'maximize_unique_contacts',
      weight: 1.0,
    },
  ];
}

function sanitizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeSolverSettingsForWasm(settings: SolverSettings): SolverSettings {
  const movePolicy = settings.move_policy
    ? {
        ...settings.move_policy,
        allowed_families: settings.move_policy.allowed_families
          ? [...settings.move_policy.allowed_families]
          : settings.move_policy.allowed_families,
        weights: settings.move_policy.weights
          ? { ...settings.move_policy.weights }
          : settings.move_policy.weights,
      }
    : settings.move_policy;

  let solverParams = settings.solver_params;

  if (solverParams && typeof solverParams === 'object') {
    if (
      normalizeSolverFamilyId(settings.solver_type) === 'solver1'
      && 'SimulatedAnnealing' in solverParams
    ) {
      const rawParams =
        (solverParams.SimulatedAnnealing as unknown as Record<string, unknown> | undefined) ?? {};

      solverParams = {
        solver_type: settings.solver_type,
        ...rawParams,
        initial_temperature: sanitizeNumber(rawParams.initial_temperature, 1.0),
        final_temperature: sanitizeNumber(rawParams.final_temperature, 0.01),
        reheat_cycles: sanitizeNumber(rawParams.reheat_cycles, 0),
        reheat_after_no_improvement: sanitizeNumber(rawParams.reheat_after_no_improvement, 0),
      } as unknown as SolverSettings['solver_params'];
    } else {
      solverParams = { ...solverParams };
    }
  }

  const normalizedSettings: SolverSettings = {
    ...settings,
    stop_conditions: { ...settings.stop_conditions },
    solver_params: solverParams,
    move_policy: movePolicy,
  };

  if (settings.logging) {
    normalizedSettings.logging = { ...settings.logging };
  }

  if (settings.telemetry) {
    normalizedSettings.telemetry = { ...settings.telemetry };
  }

  if (movePolicy) {
    normalizedSettings.move_policy = movePolicy;
  } else {
    delete normalizedSettings.move_policy;
  }

  const allowedSessions = cloneOptionalNumberArray(settings.allowed_sessions);
  if (allowedSessions !== undefined) {
    normalizedSettings.allowed_sessions = allowedSessions;
  } else {
    delete normalizedSettings.allowed_sessions;
  }

  return normalizedSettings;
}

function normalizeSessionsForConstraint(
  sessions: number[] | undefined,
  allSessions: number[],
): number[] {
  return Array.isArray(sessions) && sessions.length > 0 ? [...sessions] : [...allSessions];
}

function normalizeConstraintForWasm(constraint: Constraint, allSessions: number[]): Constraint {
  switch (constraint.type) {
    case 'RepeatEncounter':
      return {
        ...constraint,
        penalty_weight: constraint.penalty_weight ?? 1,
      };
    case 'AttributeBalance': {
      const restConstraint = { ...(constraint as AttributeBalanceParams & { attribute_id?: string }) };
      delete restConstraint.attribute_id;
      const normalized: Constraint = {
        ...restConstraint,
        desired_values: { ...(constraint as AttributeBalanceParams).desired_values },
        penalty_weight: constraint.penalty_weight ?? 50,
      };

      const sessions = cloneOptionalNumberArray((constraint as AttributeBalanceParams).sessions);
      if (sessions !== undefined) {
        (normalized as AttributeBalanceParams).sessions = sessions;
      }

      return normalized;
    }
    case 'ImmovablePerson': {
      const immovable = constraint as Extract<Constraint, { type: 'ImmovablePerson' }> &
        ImmovablePersonParams;
      return {
        ...immovable,
        sessions: normalizeSessionsForConstraint(immovable.sessions, allSessions),
      };
    }
    case 'ImmovablePeople': {
      const immovable = constraint as Extract<Constraint, { type: 'ImmovablePeople' }> &
        ImmovablePeopleParams;
      return {
        ...immovable,
        people: [...immovable.people],
        sessions: normalizeSessionsForConstraint(immovable.sessions, allSessions),
      };
    }
    case 'MustStayTogether':
      return {
        ...constraint,
        people: [...constraint.people],
        ...(constraint.sessions ? { sessions: [...constraint.sessions] } : {}),
      };
    case 'MustStayApart':
      return {
        ...constraint,
        people: [...constraint.people],
        ...(constraint.sessions ? { sessions: [...constraint.sessions] } : {}),
      };
    case 'ShouldStayTogether':
      return {
        ...constraint,
        people: [...constraint.people],
        ...(constraint.sessions ? { sessions: [...constraint.sessions] } : {}),
        penalty_weight: constraint.penalty_weight ?? 1000,
      };
    case 'ShouldNotBeTogether':
      return {
        ...constraint,
        people: [...constraint.people],
        ...(constraint.sessions ? { sessions: [...constraint.sessions] } : {}),
        penalty_weight: constraint.penalty_weight ?? 1000,
      };
    case 'PairMeetingCount':
      return {
        ...constraint,
        people: [...constraint.people] as [string, string],
        ...(constraint.sessions ? { sessions: [...constraint.sessions] } : {}),
      };
    default:
      return constraint;
  }
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
  const allSessions = Array.from({ length: scenario.num_sessions }, (_, i) => i);
  const attributeDefinitions = reconcileScenarioAttributeDefinitions(scenario);
  const relationalScenario = reconcileScenarioAttributeState(scenario, attributeDefinitions);

  return {
    ...relationalScenario,
    people: clonePeople(relationalScenario.people),
    groups: cloneGroups(relationalScenario.groups),
    objectives: normalizeObjectivesForWasm(relationalScenario.objectives),
    constraints: (relationalScenario.constraints || []).map((constraint) =>
      normalizeConstraintForWasm(constraint, allSessions),
    ),
    settings: normalizeSolverSettingsForWasm(relationalScenario.settings),
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

export function buildWasmConstructionSeedInput(
  scenario: Scenario,
  constructionSeedSchedule: WarmStartSchedule,
): WasmScenarioContractInput {
  return {
    scenario: normalizeScenarioForWasm(scenario),
    construction_seed_schedule: constructionSeedSchedule,
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
