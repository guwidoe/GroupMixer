import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsHistory } from './ResultsHistory';
import { useAppStore } from '../store';
import { createSavedProblem } from '../test/fixtures';
import { renderWithRouter } from '../test/utils';

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
    const savedProblem = createSavedProblem({
      id: 'problem-1',
      name: 'Workshop History',
    });

    useAppStore.setState({
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
      solution: savedProblem.results[0].solution,
      selectedResultIds: [],
      selectResultsForComparison: vi.fn(),
      updateResultName: vi.fn(),
      deleteResult: vi.fn(),
      setShowResultComparison: vi.fn(),
      setSolution: vi.fn(),
      restoreResultAsNewProblem: vi.fn(),
    });

    renderWithRouter(<ResultsHistory />, { route: '/app/history' });

    expect(screen.getByRole('heading', { name: /results history/i })).toBeInTheDocument();
    expect(screen.getAllByText(/baseline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/best result/i)).toBeInTheDocument();
  });
});
