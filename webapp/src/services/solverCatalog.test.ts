import { describe, expect, it } from 'vitest';
import { createSampleSolverSettings } from '../test/fixtures';
import {
  getSolverCatalog,
  getSolverCatalogEntry,
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

  it('exposes locally known solver presentation metadata for supported solver families', () => {
    const catalog = getSolverCatalog();
    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      id: 'solver1',
      displayName: 'Solver 1',
    });
    expect(catalog[1]).toMatchObject({
      id: 'solver3',
      displayName: 'Solver 3',
    });
    expect(getSolverCatalogEntry('SimulatedAnnealing')?.capabilities.supportsRecommendedSettings).toBe(true);
    expect(getSolverCatalogEntry('solver3')?.capabilities.supportsRecommendedSettings).toBe(false);
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
