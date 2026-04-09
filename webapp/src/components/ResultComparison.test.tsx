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
      savedScenarios: { [savedScenario.id]: savedScenario },
      selectedResultIds: savedScenario.results.map((result) => result.id),
      setShowResultComparison: () => {},
      selectResultsForComparison: () => {},
    });

    render(<ResultComparison />);

    expect(screen.getByText('Solver Family')).toBeInTheDocument();
    expect(screen.getByText('Solver 1')).toBeInTheDocument();
    expect(screen.getByText('Solver 3')).toBeInTheDocument();
    expect(screen.getByText('Correctness Lane')).toBeInTheDocument();
  });
});
