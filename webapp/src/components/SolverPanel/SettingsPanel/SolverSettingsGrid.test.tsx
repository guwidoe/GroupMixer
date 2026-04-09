import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSolverSettings, getSolverUiSpec } from '../../../services/solverUi';
import { SolverSettingsGrid } from './SolverSettingsGrid';

describe('SolverSettingsGrid', () => {
  it('renders universal, family-shared, and solver1-specific sections', () => {
    render(
      <SolverSettingsGrid
        solverSettings={createDefaultSolverSettings('solver1')}
        solverUiSpec={getSolverUiSpec('solver1')}
        solverFormInputs={{}}
        setSolverFormInputs={vi.fn()}
        handleSettingsChange={vi.fn()}
        isRunning={false}
      />,
    );

    expect(screen.getByText('Universal Runtime Controls')).toBeInTheDocument();
    expect(screen.getByText('Local Search Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Solver 1: Simulated Annealing')).toBeInTheDocument();
    expect(screen.getByText('Initial Temperature')).toBeInTheDocument();
  });

  it('renders solver3-specific controls instead of solver1 controls', () => {
    render(
      <SolverSettingsGrid
        solverSettings={createDefaultSolverSettings('solver3')}
        solverUiSpec={getSolverUiSpec('solver3')}
        solverFormInputs={{}}
        setSolverFormInputs={vi.fn()}
        handleSettingsChange={vi.fn()}
        isRunning={false}
      />,
    );

    expect(screen.getByText('Solver 3: Dense-State Search')).toBeInTheDocument();
    expect(screen.getByText('Enable Correctness Lane')).toBeInTheDocument();
    expect(screen.getByText('Correctness Sample Cadence')).toBeInTheDocument();
    expect(screen.queryByText('Initial Temperature')).not.toBeInTheDocument();
  });
});
