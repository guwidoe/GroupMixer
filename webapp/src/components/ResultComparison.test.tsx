import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ResultComparison } from './ResultComparison';
import { createSavedScenario } from '../test/fixtures';
import { createDefaultSolverSettings } from '../services/solverUi';
import { useAppStore } from '../store';

describe('ResultComparison', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it('renders solver-aware configuration summaries for compared results', () => {
    const savedScenario = createSavedScenario();
    savedScenario.results = [
      savedScenario.results[0],
      {
        ...savedScenario.results[0],
        id: 'result-2',
        name: 'Solver 3 Run',
        solverSettings: createDefaultSolverSettings('solver3'),
      },
    ];

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
        {
          kind: 'solver3',
          canonical_id: 'solver3',
          display_name: 'Solver 3',
          accepted_config_ids: ['solver3'],
          capabilities: {
            supports_initial_schedule: true,
            supports_progress_callback: true,
            supports_benchmark_observer: true,
            supports_recommended_settings: false,
            supports_deterministic_seed: true,
          },
          notes: 'Solver 3 notes',
        },
      ],
      runtimeSolverCatalogStatus: 'ready',
      runtimeSolverCatalogError: null,
      savedScenarios: { [savedScenario.id]: savedScenario },
      selectedResultIds: savedScenario.results.map((result) => result.id),
      setShowResultComparison: () => {},
      selectResultsForComparison: () => {},
      loadRuntimeSolverCatalog: async () => undefined,
    });

    render(<ResultComparison />);

    expect(screen.getByText('Solver Family')).toBeInTheDocument();
    expect(screen.getByText('Solver 1')).toBeInTheDocument();
    expect(screen.getByText('Solver 3')).toBeInTheDocument();
    expect(screen.getByText('Correctness Lane')).toBeInTheDocument();
  });
});
