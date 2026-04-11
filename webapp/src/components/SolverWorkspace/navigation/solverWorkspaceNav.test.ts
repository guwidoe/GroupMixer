import { describe, expect, it } from 'vitest';
import type { SolverCatalogEntry } from '../../../services/solverUi';
import {
  DEFAULT_SOLVER_WORKSPACE_SECTION,
  getResolvedSolverWorkspaceSectionsByGroup,
  getSolverWorkspacePath,
  resolveSolverWorkspaceSection,
} from './solverWorkspaceNav';

const solverCatalog: SolverCatalogEntry[] = [
  {
    id: 'solver1',
    displayName: 'Solver 1',
    acceptedConfigIds: ['solver1'],
    notes: 'Stable baseline solver.',
    capabilities: {
      supportsInitialSchedule: true,
      supportsProgressCallback: true,
      supportsBenchmarkObserver: false,
      supportsRecommendedSettings: true,
      supportsDeterministicSeed: true,
    },
    uiSpecAvailable: true,
    experimental: false,
  },
  {
    id: 'solver3',
    displayName: 'Solver 3',
    acceptedConfigIds: ['solver3'],
    notes: 'Advanced experimental solver.',
    capabilities: {
      supportsInitialSchedule: true,
      supportsProgressCallback: true,
      supportsBenchmarkObserver: false,
      supportsRecommendedSettings: false,
      supportsDeterministicSeed: true,
    },
    uiSpecAvailable: true,
    experimental: true,
  },
];

describe('solverWorkspaceNav', () => {
  it('resolves invalid sections to the default run page', () => {
    expect(resolveSolverWorkspaceSection(undefined)).toBe(DEFAULT_SOLVER_WORKSPACE_SECTION);
    expect(resolveSolverWorkspaceSection('unknown')).toBe(DEFAULT_SOLVER_WORKSPACE_SECTION);
    expect(getSolverWorkspacePath('unknown')).toBe('/app/solver/run');
  });

  it('builds grouped sections from the runtime-backed solver catalog', () => {
    const groupedSections = getResolvedSolverWorkspaceSectionsByGroup(solverCatalog, 'ready');

    expect(groupedSections).toHaveLength(2);
    expect(groupedSections[0]?.sections.map((section) => section.id)).toEqual(['run']);
    expect(groupedSections[1]?.sections.map((section) => section.id)).toEqual(['solver1', 'solver3']);
    expect(groupedSections[1]?.sections[1]?.catalogEntry?.experimental).toBe(true);
  });
});
