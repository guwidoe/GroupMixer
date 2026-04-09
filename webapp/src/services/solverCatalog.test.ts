import { describe, expect, it } from 'vitest';
import { createSampleSolverSettings } from '../test/fixtures';
import {
  getSolverParameterFieldMetadata,
  isLegacySimulatedAnnealingSettings,
  normalizeSolverFamilyId,
} from './solverCatalog';

describe('solverCatalog', () => {
  it('normalizes accepted solver type aliases to the canonical family id', () => {
    expect(normalizeSolverFamilyId('SimulatedAnnealing')).toBe('solver1');
    expect(normalizeSolverFamilyId('simulated_annealing')).toBe('solver1');
    expect(normalizeSolverFamilyId('legacy_simulated_annealing')).toBe('solver1');
    expect(normalizeSolverFamilyId('solver3')).toBe('solver3');
    expect(normalizeSolverFamilyId('unknown')).toBeNull();
  });

  it('returns metadata-driven parameter fields for known solver settings', () => {
    const settings = createSampleSolverSettings();
    expect(isLegacySimulatedAnnealingSettings(settings)).toBe(true);

    const fields = getSolverParameterFieldMetadata(settings);
    expect(fields.map((field) => field.formInputKey)).toEqual([
      'initialTemp',
      'finalTemp',
      'reheatCycles',
      'reheat',
    ]);
  });
});
