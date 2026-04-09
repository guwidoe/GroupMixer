import type { SolverSettings } from '../../types';
import { isFlatLegacySimulatedAnnealingParams, normalizeSolverFamilyId } from '../solverCatalog';

export function normalizeRecommendedSolverSettings(settings: SolverSettings): SolverSettings {
  const solverParams = settings.solver_params as Record<string, unknown> | undefined;
  if (
    !solverParams
    || 'SimulatedAnnealing' in solverParams
    || normalizeSolverFamilyId(settings.solver_type) !== 'solver1'
    || !isFlatLegacySimulatedAnnealingParams(solverParams)
  ) {
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
