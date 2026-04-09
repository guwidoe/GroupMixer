import type {
  LoggingOptions,
  Solver3CorrectnessLaneParams,
  SolverSettings,
  StopConditions,
} from '../../types';
import type { SolverFamilyId } from './types';

export const DEFAULT_SOLVER_FAMILY_ID: SolverFamilyId = 'solver1';
export const LEGACY_SOLVER1_CONFIG_ID = 'SimulatedAnnealing';

const DEFAULT_STOP_CONDITIONS: StopConditions = {
  max_iterations: 10000,
  time_limit_seconds: 30,
  no_improvement_iterations: 5000,
};

const DEFAULT_LOGGING: LoggingOptions = {
  log_frequency: 1000,
  log_initial_state: true,
  log_duration_and_score: true,
  display_final_schedule: true,
  log_initial_score_breakdown: true,
  log_final_score_breakdown: true,
  log_stop_condition: true,
  debug_validate_invariants: false,
  debug_dump_invariant_context: false,
};

export const DEFAULT_SOLVER1_PARAMS = {
  initial_temperature: 1.0,
  final_temperature: 0.01,
  cooling_schedule: 'geometric' as const,
  reheat_cycles: 0,
  reheat_after_no_improvement: 0,
};

export const DEFAULT_SOLVER3_CORRECTNESS_LANE: Solver3CorrectnessLaneParams = {
  enabled: false,
  sample_every_accepted_moves: 16,
};

export function createDefaultSolverSettings(familyId: SolverFamilyId = DEFAULT_SOLVER_FAMILY_ID): SolverSettings {
  switch (familyId) {
    case 'solver1':
      return {
        solver_type: LEGACY_SOLVER1_CONFIG_ID,
        stop_conditions: { ...DEFAULT_STOP_CONDITIONS },
        solver_params: {
          SimulatedAnnealing: {
            ...DEFAULT_SOLVER1_PARAMS,
          },
        },
        logging: { ...DEFAULT_LOGGING },
      };
    case 'solver2':
      return {
        solver_type: 'solver2',
        stop_conditions: { ...DEFAULT_STOP_CONDITIONS },
        solver_params: {
          solver_type: 'solver2',
        },
        logging: { ...DEFAULT_LOGGING },
      };
    case 'solver3':
      return {
        solver_type: 'solver3',
        stop_conditions: { ...DEFAULT_STOP_CONDITIONS },
        solver_params: {
          solver_type: 'solver3',
          correctness_lane: {
            ...DEFAULT_SOLVER3_CORRECTNESS_LANE,
          },
        },
        logging: { ...DEFAULT_LOGGING },
      };
  }
}
