import { describe, expect, it } from 'vitest';
import { createSampleSolverSettings } from '../../../test/fixtures';
import type { SolverSettings } from '../../../types';
import { normalizeRecommendedSolverSettings } from './recommendedSettings';

describe('normalizeRecommendedSolverSettings', () => {
  it('converts flat simulated annealing params into the nested UI shape', () => {
    const rawSettings = {
      solver_type: 'SimulatedAnnealing',
      stop_conditions: { time_limit_seconds: 5 },
      solver_params: {
        solver_type: 'SimulatedAnnealing',
        initial_temperature: 10,
        final_temperature: 1,
        cooling_schedule: 'linear',
        reheat_cycles: 2,
        reheat_after_no_improvement: 9,
      },
    } as unknown as SolverSettings;

    expect(normalizeRecommendedSolverSettings(rawSettings)).toEqual({
      solver_type: 'SimulatedAnnealing',
      stop_conditions: { time_limit_seconds: 5 },
      solver_params: {
        SimulatedAnnealing: {
          initial_temperature: 10,
          final_temperature: 1,
          cooling_schedule: 'linear',
          reheat_cycles: 2,
          reheat_after_no_improvement: 9,
        },
      },
    });
  });

  it('returns already-normalized settings unchanged', () => {
    const settings = createSampleSolverSettings();

    expect(normalizeRecommendedSolverSettings(settings)).toBe(settings);
  });

  it('returns unrelated solver params unchanged', () => {
    const settings = {
      solver_type: 'OtherSolver',
      stop_conditions: {},
      solver_params: {
        OtherSolver: {
          strength: 3,
        },
      },
    } as unknown as SolverSettings;

    expect(normalizeRecommendedSolverSettings(settings)).toBe(settings);
  });
});
