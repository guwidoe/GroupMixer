import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResultsHistory } from './ResultsHistory';
import { useAppStore } from '../store';
import { createSavedScenario } from '../test/fixtures';

vi.mock('../hooks', async () => {
  const React = await import('react');
  return {
    useLocalStorageState: (_key: string, initialValue: string) => React.useState(initialValue),
    useOutsideClick: () => {},
  };
});

describe('ResultsHistory', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it('renders saved results history without crashing when results exist', () => {
    const savedScenario = createSavedScenario({
      id: 'scenario-1',
      name: 'Workshop History',
    });

    useAppStore.setState({
      currentScenarioId: savedScenario.id,
      runtimeSolverCatalog: [
        {
          kind: 'solver1',
          canonical_id: 'solver1',
          display_name: 'Solver 1',
          accepted_config_ids: ['solver1', 'SimulatedAnnealing'],
          capabilities: {
            supports_initial_schedule: true,
            supports_progress_callback: true,
            supports_benchmark_observer: true,
            supports_recommended_settings: true,
            supports_deterministic_seed: true,
          },
          notes: 'Solver 1 notes',
        },
      ],
      runtimeSolverCatalogStatus: 'ready',
      runtimeSolverCatalogError: null,
      savedScenarios: { [savedScenario.id]: savedScenario },
      solution: savedScenario.results[0].solution,
      selectedResultIds: [],
      selectResultsForComparison: vi.fn(),
      updateResultName: vi.fn(),
      deleteResult: vi.fn(),
      setShowResultComparison: vi.fn(),
      setSolution: vi.fn(),
      restoreResultAsNewScenario: vi.fn(),
      loadRuntimeSolverCatalog: vi.fn(async () => undefined),
    });

    render(
      <MemoryRouter initialEntries={['/app/history']}>
        <Routes>
          <Route path="/app/history" element={<ResultsHistory />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /saved results/i })).toBeInTheDocument();
    expect(screen.getAllByText(/baseline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/best result/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open current result/i })).toBeInTheDocument();
  });

  it('opens the current result route from the saved results surface', async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      id: 'scenario-1',
      name: 'Workshop History',
    });

    useAppStore.setState({
      currentScenarioId: savedScenario.id,
      currentResultId: null,
      runtimeSolverCatalog: [
        {
          kind: 'solver1',
          canonical_id: 'solver1',
          display_name: 'Solver 1',
          accepted_config_ids: ['solver1', 'SimulatedAnnealing'],
          capabilities: {
            supports_initial_schedule: true,
            supports_progress_callback: true,
            supports_benchmark_observer: true,
            supports_recommended_settings: true,
            supports_deterministic_seed: true,
          },
          notes: 'Solver 1 notes',
        },
      ],
      runtimeSolverCatalogStatus: 'ready',
      runtimeSolverCatalogError: null,
      savedScenarios: { [savedScenario.id]: savedScenario },
      solution: savedScenario.results[0].solution,
      selectedResultIds: [],
      selectResultsForComparison: vi.fn(),
      updateResultName: vi.fn(),
      deleteResult: vi.fn(),
      setShowResultComparison: vi.fn(),
      setSolution: vi.fn(),
      restoreResultAsNewScenario: vi.fn(),
      loadRuntimeSolverCatalog: vi.fn(async () => undefined),
    });

    render(
      <MemoryRouter initialEntries={['/app/history']}>
        <Routes>
          <Route path="/app/history" element={<ResultsHistory />} />
          <Route path="/app/results" element={<div>Current result route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open current result/i }));

    expect(await screen.findByText('Current result route')).toBeInTheDocument();
    expect(useAppStore.getState().currentResultId).toBe(savedScenario.results[0].id);
  });
});
