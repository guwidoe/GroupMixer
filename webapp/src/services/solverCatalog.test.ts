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
    expect(normalizeSolverFamilyId('SimulatedAnnealing')).toBe('legacy_simulated_annealing');
    expect(normalizeSolverFamilyId('simulated_annealing')).toBe('legacy_simulated_annealing');
    expect(normalizeSolverFamilyId('legacy_simulated_annealing')).toBe('legacy_simulated_annealing');
    expect(normalizeSolverFamilyId('unknown')).toBeNull();
  });

  it('exposes the current solver catalog entry', () => {
    const catalog = getSolverCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: 'legacy_simulated_annealing',
      displayName: 'Legacy Simulated Annealing',
    });
    expect(getSolverCatalogEntry('SimulatedAnnealing')?.capabilities.supportsRecommendedSettings).toBe(true);
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
