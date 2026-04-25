import { describe, expect, it } from 'vitest';
import { createSampleSolverSettings } from '../../test/fixtures';
import { createDefaultSolverSettings } from './defaults';
import {
  fromContractSolverSettings,
  getSolver1Params,
  getSolver3Params,
  normalizeSolverFamilyId,
  switchSolverFamily,
  toContractSolverSettings,
} from './translate';

describe('solverUi translate', () => {
  it('normalizes solver ids and legacy aliases to canonical family ids', () => {
    expect(normalizeSolverFamilyId('auto')).toBe('auto');
    expect(normalizeSolverFamilyId('default')).toBe('auto');
    expect(normalizeSolverFamilyId('SimulatedAnnealing')).toBe('solver1');
    expect(normalizeSolverFamilyId('legacy_simulated_annealing')).toBe('solver1');
    expect(normalizeSolverFamilyId('solver1')).toBe('solver1');
    expect(normalizeSolverFamilyId('solver3')).toBe('solver3');
    expect(normalizeSolverFamilyId('unknown')).toBeNull();
  });

  it('round-trips auto settings through the draft translator', () => {
    const settings = createDefaultSolverSettings('auto');

    const draft = fromContractSolverSettings(settings);
    const roundTrip = toContractSolverSettings(draft);

    expect(draft.familyId).toBe('auto');
    expect(roundTrip).toEqual({
      solver_type: 'auto',
      stop_conditions: settings.stop_conditions,
      solver_params: {
        solver_type: 'auto',
      },
      logging: settings.logging,
    });
  });

  it('round-trips solver1 settings through the draft translator', () => {
    const settings = createSampleSolverSettings();

    const draft = fromContractSolverSettings(settings);
    const roundTrip = toContractSolverSettings(draft);

    expect(draft.familyId).toBe('solver1');
    expect(roundTrip).toEqual({
      ...settings,
      solver_type: 'SimulatedAnnealing',
      solver_params: {
        SimulatedAnnealing: getSolver1Params(settings),
      },
    });
  });

  it('round-trips solver3 settings through the draft translator', () => {
    const settings = createDefaultSolverSettings('solver3');

    const draft = fromContractSolverSettings(settings);
    const roundTrip = toContractSolverSettings(draft);

    expect(draft.familyId).toBe('solver3');
    expect(draft.specific.correctnessLaneEnabled).toBe(false);
    expect(roundTrip).toEqual({
      solver_type: 'solver3',
      stop_conditions: settings.stop_conditions,
      solver_params: {
        solver_type: 'solver3',
        correctness_lane: getSolver3Params(settings).correctness_lane,
      },
      logging: settings.logging,
    });
  });

  it('switches between families while preserving shared settings and replacing family-specific params', () => {
    const settings = {
      ...createSampleSolverSettings(),
      stop_conditions: {
        max_iterations: 54321,
        time_limit_seconds: 12,
        no_improvement_iterations: 999,
      },
      seed: 42,
    };

    const switched = switchSolverFamily(settings, 'solver3');

    expect(switched.solver_type).toBe('solver3');
    expect(switched.stop_conditions).toEqual(settings.stop_conditions);
    expect(switched.seed).toBe(42);
    expect(getSolver3Params(switched).correctness_lane).toEqual({
      enabled: false,
      sample_every_accepted_moves: 16,
    });
    expect((switched.solver_params as Record<string, unknown>).SimulatedAnnealing).toBeUndefined();
  });

  it('switches to auto while preserving shared settings and removing manual solver params', () => {
    const settings = {
      ...createSampleSolverSettings(),
      seed: 42,
    };

    const switched = switchSolverFamily(settings, 'auto');

    expect(switched.solver_type).toBe('auto');
    expect(switched.stop_conditions).toEqual(settings.stop_conditions);
    expect(switched.seed).toBe(42);
    expect(switched.solver_params).toEqual({ solver_type: 'auto' });
  });
});
