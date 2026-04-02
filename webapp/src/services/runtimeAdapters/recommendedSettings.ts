import type { SolverSettings } from '../../types';

type RawSimulatedAnnealingParams = {
  solver_type?: string;
  initial_temperature: number;
  final_temperature: number;
  cooling_schedule: string;
  reheat_cycles?: number;
  reheat_after_no_improvement: number;
};

function isRawSimulatedAnnealingParams(value: unknown): value is RawSimulatedAnnealingParams {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return candidate.solver_type === 'SimulatedAnnealing';
}

export function normalizeRecommendedSolverSettings(settings: SolverSettings): SolverSettings {
  const solverParams = settings.solver_params as Record<string, unknown> | undefined;
  if (!solverParams || 'SimulatedAnnealing' in solverParams || !isRawSimulatedAnnealingParams(solverParams)) {
    return settings;
  }

  const {
    initial_temperature,
    final_temperature,
    cooling_schedule,
    reheat_cycles,
    reheat_after_no_improvement,
  } = solverParams;

  return {
    ...settings,
    solver_params: {
      SimulatedAnnealing: {
        initial_temperature,
        final_temperature,
        cooling_schedule,
        reheat_cycles,
        reheat_after_no_improvement,
      },
    },
  };
}
