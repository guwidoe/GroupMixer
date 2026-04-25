import type {
  Solver3CorrectnessLaneParams,
  Solver3Params,
  SolverSettings,
} from '../../types';
import {
  DEFAULT_SOLVER1_PARAMS,
  DEFAULT_SOLVER3_CORRECTNESS_LANE,
  LEGACY_SOLVER1_CONFIG_ID,
  createDefaultSolverSettings,
} from './defaults';
import type {
  CommonSolverSettingsDraft,
  SolverDraft,
  SolverFamilyId,
} from './types';

const SOLVER_FAMILY_ALIASES: Record<SolverFamilyId, readonly string[]> = {
  auto: ['auto', 'default'],
  solver1: ['solver1', 'legacy_simulated_annealing', 'simulated_annealing', LEGACY_SOLVER1_CONFIG_ID],
  solver3: ['solver3'],
};

function cloneCommonDraft(settings: SolverSettings): CommonSolverSettingsDraft {
  return {
    stopConditions: { ...settings.stop_conditions },
    logging: settings.logging ? { ...settings.logging } : settings.logging,
    telemetry: settings.telemetry ? { ...settings.telemetry } : settings.telemetry,
    seed: settings.seed,
    movePolicy: settings.move_policy
      ? {
          ...settings.move_policy,
          allowed_families: settings.move_policy.allowed_families
            ? [...settings.move_policy.allowed_families]
            : settings.move_policy.allowed_families,
          weights: settings.move_policy.weights ? { ...settings.move_policy.weights } : settings.move_policy.weights,
        }
      : settings.move_policy,
    allowedSessions: Array.isArray(settings.allowed_sessions) ? [...settings.allowed_sessions] : settings.allowed_sessions,
  };
}

export function normalizeSolverFamilyId(solverType: string | undefined | null): SolverFamilyId | null {
  if (!solverType) {
    return null;
  }

  const match = (Object.entries(SOLVER_FAMILY_ALIASES) as Array<[SolverFamilyId, readonly string[]]>)
    .find(([, aliases]) => aliases.includes(solverType));

  return match?.[0] ?? null;
}

export function getAcceptedSolverFamilyIds(familyId: SolverFamilyId): readonly string[] {
  return SOLVER_FAMILY_ALIASES[familyId];
}

export function isLegacySimulatedAnnealingSettings(
  settings: Pick<SolverSettings, 'solver_type' | 'solver_params'>,
): boolean {
  return normalizeSolverFamilyId(settings.solver_type) === 'solver1'
    && typeof settings.solver_params === 'object'
    && settings.solver_params !== null
    && 'SimulatedAnnealing' in settings.solver_params;
}

export function isFlatLegacySimulatedAnnealingParams(value: unknown): value is {
  solver_type?: string;
  initial_temperature: number;
  final_temperature: number;
  cooling_schedule: string;
  reheat_cycles?: number;
  reheat_after_no_improvement?: number;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return normalizeSolverFamilyId(typeof candidate.solver_type === 'string' ? candidate.solver_type : undefined) === 'solver1';
}

export function getSolver1Params(settings: Pick<SolverSettings, 'solver_params'>) {
  const solverParams = settings.solver_params as Record<string, unknown> | undefined;
  const nested = solverParams?.SimulatedAnnealing as Record<string, unknown> | undefined;
  const flat = isFlatLegacySimulatedAnnealingParams(solverParams) ? solverParams : undefined;
  const source = nested ?? flat ?? {};

  return {
    initial_temperature: typeof source.initial_temperature === 'number' ? source.initial_temperature : DEFAULT_SOLVER1_PARAMS.initial_temperature,
    final_temperature: typeof source.final_temperature === 'number' ? source.final_temperature : DEFAULT_SOLVER1_PARAMS.final_temperature,
    cooling_schedule: source.cooling_schedule === 'linear' ? 'linear' : DEFAULT_SOLVER1_PARAMS.cooling_schedule,
    reheat_cycles: typeof source.reheat_cycles === 'number' ? source.reheat_cycles : DEFAULT_SOLVER1_PARAMS.reheat_cycles,
    reheat_after_no_improvement: typeof source.reheat_after_no_improvement === 'number'
      ? source.reheat_after_no_improvement
      : DEFAULT_SOLVER1_PARAMS.reheat_after_no_improvement,
  };
}

function coerceSolver3CorrectnessLane(value: unknown): Solver3CorrectnessLaneParams {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_SOLVER3_CORRECTNESS_LANE.enabled,
    sample_every_accepted_moves:
      typeof record.sample_every_accepted_moves === 'number'
        ? record.sample_every_accepted_moves
        : DEFAULT_SOLVER3_CORRECTNESS_LANE.sample_every_accepted_moves,
  };
}

export function getSolver3Params(settings: Pick<SolverSettings, 'solver_params'>): Solver3Params {
  const solverParams = settings.solver_params as Record<string, unknown> | undefined;
  const nested = solverParams?.solver3 as Record<string, unknown> | undefined;
  const flat = solverParams?.solver_type === 'solver3' ? solverParams : undefined;
  const source = nested ?? flat ?? {};

  return {
    correctness_lane: coerceSolver3CorrectnessLane(source.correctness_lane),
  };
}

export function fromContractSolverSettings(settings: SolverSettings): SolverDraft {
  const familyId = normalizeSolverFamilyId(settings.solver_type);
  if (!familyId) {
    throw new Error(`Unknown solver family '${settings.solver_type}'`);
  }

  const common = cloneCommonDraft(settings);

  switch (familyId) {
    case 'auto':
      return {
        familyId,
        common,
        specific: {},
      };
    case 'solver1': {
      const params = getSolver1Params(settings);
      return {
        familyId,
        common,
        specific: {
          initialTemperature: params.initial_temperature,
          finalTemperature: params.final_temperature,
          coolingSchedule: params.cooling_schedule,
          reheatCycles: params.reheat_cycles,
          reheatAfterNoImprovement: params.reheat_after_no_improvement,
        },
      };
    }
    case 'solver3': {
      const params = getSolver3Params(settings);
      return {
        familyId,
        common,
        specific: {
          correctnessLaneEnabled: params.correctness_lane?.enabled ?? DEFAULT_SOLVER3_CORRECTNESS_LANE.enabled,
          correctnessLaneSampleEveryAcceptedMoves:
            params.correctness_lane?.sample_every_accepted_moves
            ?? DEFAULT_SOLVER3_CORRECTNESS_LANE.sample_every_accepted_moves,
        },
      };
    }
  }
}

export function toContractSolverSettings(draft: SolverDraft): SolverSettings {
  const common: SolverSettings = {
    solver_type: draft.familyId,
    stop_conditions: { ...draft.common.stopConditions },
    solver_params: {},
  };

  if (draft.common.logging) {
    common.logging = { ...draft.common.logging };
  }
  if (draft.common.telemetry) {
    common.telemetry = { ...draft.common.telemetry };
  }
  if (typeof draft.common.seed === 'number') {
    common.seed = draft.common.seed;
  }
  if (draft.common.movePolicy) {
    common.move_policy = {
      ...draft.common.movePolicy,
      allowed_families: draft.common.movePolicy.allowed_families
        ? [...draft.common.movePolicy.allowed_families]
        : draft.common.movePolicy.allowed_families,
      weights: draft.common.movePolicy.weights ? { ...draft.common.movePolicy.weights } : draft.common.movePolicy.weights,
    };
  }
  if (Array.isArray(draft.common.allowedSessions)) {
    common.allowed_sessions = [...draft.common.allowedSessions];
  }

  switch (draft.familyId) {
    case 'auto':
      return {
        ...common,
        solver_type: 'auto',
        solver_params: {
          solver_type: 'auto',
        },
      };
    case 'solver1':
      return {
        ...common,
        solver_type: LEGACY_SOLVER1_CONFIG_ID,
        solver_params: {
          SimulatedAnnealing: {
            initial_temperature: draft.specific.initialTemperature,
            final_temperature: draft.specific.finalTemperature,
            cooling_schedule: draft.specific.coolingSchedule,
            reheat_cycles: draft.specific.reheatCycles,
            reheat_after_no_improvement: draft.specific.reheatAfterNoImprovement,
          },
        },
      };
    case 'solver3':
      return {
        ...common,
        solver_type: 'solver3',
        solver_params: {
          solver_type: 'solver3',
          correctness_lane: {
            enabled: draft.specific.correctnessLaneEnabled,
            sample_every_accepted_moves: draft.specific.correctnessLaneSampleEveryAcceptedMoves,
          },
        },
      };
  }
}

export function switchSolverFamily(settings: SolverSettings, familyId: SolverFamilyId): SolverSettings {
  const common = cloneCommonDraft(settings);
  const nextDraft = fromContractSolverSettings(createDefaultSolverSettings(familyId));
  return toContractSolverSettings({
    ...nextDraft,
    common,
  } as SolverDraft);
}
