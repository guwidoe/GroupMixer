import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SolverRunControls } from './SolverRunControls';

const baseProps = {
  solverState: {
    isRunning: false,
    currentIteration: 0,
    bestScore: 0,
    currentScore: 0,
    elapsedTime: 0,
  },
  scenario: {
    people: [],
    groups: [],
    num_sessions: 1,
    objectives: [],
    constraints: [],
    settings: {
      solver_type: 'solver1',
      stop_conditions: {},
      solver_params: {},
    },
  },
  selectedSolverCatalogEntry: {
    id: 'solver1' as const,
    displayName: 'Solver 1',
    acceptedConfigIds: ['solver1'],
    notes: 'Stable solver.',
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
  solverCatalogStatus: 'ready' as const,
  solverCatalogErrorMessage: null,
  solverFormInputs: {},
  setSolverFormInputs: vi.fn(),
  desiredRuntimeMain: 3,
  setDesiredRuntimeMain: vi.fn(),
  onStartSolver: vi.fn(),
  onCancelSolver: vi.fn(),
  onSaveBestSoFar: vi.fn(),
  onResetSolver: vi.fn(),
};

describe('SolverRunControls', () => {
  it('shows the one-click run CTA on the Run Solver page', () => {
    render(<SolverRunControls {...baseProps} startMode="recommended" runtimeHelpText="help text" />);

    expect(screen.getByRole('button', { name: 'Run Solver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Runtime target help' })).toBeInTheDocument();
  });

  it('shows the manual-run CTA on manual tuning pages', () => {
    render(<SolverRunControls {...baseProps} startMode="manual" />);

    expect(screen.getByRole('button', { name: 'Run with Manual Settings' })).toBeInTheDocument();
  });
});
