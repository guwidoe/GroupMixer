/* eslint-disable react/no-multi-comp */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsView } from './ResultsView';
import { useAppStore } from '../store';
import { createSampleProblem, createSampleSolution, createSavedProblem } from '../test/fixtures';

vi.mock('../hooks', async () => {
  const React = await import('react');
  return {
    useLocalStorageState: (_key: string, initialValue: string) => React.useState(initialValue),
    useOutsideClick: () => {},
  };
});

vi.mock('./ConstraintComplianceCards', () => ({
  default: ({ problem, solution }: { problem: { people: unknown[] }; solution: { assignments: unknown[] } }) => (
    <div>{`compliance:${problem.people.length}:${solution.assignments.length}`}</div>
  ),
}));

vi.mock('./ResultsView/ResultsHeader', () => ({
  ResultsHeader: ({ resultName, onRestoreConfig }: { resultName?: string; onRestoreConfig: () => void }) => (
    <div>
      <div>{`header:${resultName ?? 'none'}`}</div>
      <button onClick={onRestoreConfig}>restore</button>
    </div>
  ),
}));

vi.mock('./ResultsView/ResultsMetrics', () => ({
  ResultsMetrics: ({ solution }: { solution: { final_score: number } }) => <div>{`metrics:${solution.final_score}`}</div>,
}));

vi.mock('./ResultsView/ResultsSchedule', () => ({
  ResultsSchedule: ({
    sessionData,
    effectiveProblem,
    vizPluginId,
  }: {
    sessionData: Array<unknown>;
    effectiveProblem: { groups: Array<{ id: string }> };
    vizPluginId: string;
  }) => <div>{`schedule:${sessionData.length}:${effectiveProblem.groups[0]?.id ?? 'none'}:${vizPluginId}`}</div>,
}));

describe('ResultsView', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty results state when no solution is selected', () => {
    useAppStore.setState({
      problem: createSampleProblem(),
      solution: null,
    });

    render(<ResultsView />);

    expect(screen.getByRole('heading', { name: /no results yet/i })).toBeInTheDocument();
  });

  it('shows the missing-problem empty state when a solution exists without a recoverable problem', () => {
    useAppStore.setState({
      problem: null,
      solution: createSampleSolution(),
      currentProblemId: null,
      savedProblems: {},
    });

    render(<ResultsView />);

    expect(screen.getByRole('heading', { name: /no results available/i })).toBeInTheDocument();
  });

  it('hydrates child views from the saved result snapshot and restores that configuration', async () => {
    const user = userEvent.setup();
    const savedProblem = createSavedProblem({
      name: 'Workshop',
      problem: createSampleProblem({ groups: [{ id: 'live-group', size: 4 }], num_sessions: 1 }),
    });
    savedProblem.results = [
      {
        ...savedProblem.results[0],
        name: 'Snapshot Result',
        problemSnapshot: {
          people: savedProblem.problem.people,
          groups: [{ id: 'snap-group', size: 4 }],
          num_sessions: 2,
          objectives: savedProblem.problem.objectives,
          constraints: savedProblem.problem.constraints,
        },
      },
    ];
    const restoreResultAsNewProblem = vi.fn();

    useAppStore.setState({
      problem: savedProblem.problem,
      solution: savedProblem.results[0].solution,
      solverState: useAppStore.getState().solverState,
      currentProblemId: savedProblem.id,
      savedProblems: { [savedProblem.id]: savedProblem },
      restoreResultAsNewProblem: restoreResultAsNewProblem as never,
    });

    render(<ResultsView />);

    expect(screen.getByText('header:Snapshot Result')).toBeInTheDocument();
    expect(screen.getByText('metrics:12.5')).toBeInTheDocument();
    expect(screen.getByText('compliance:4:8')).toBeInTheDocument();
    expect(screen.getByText('schedule:2:snap-group:scheduleMatrix')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /restore/i }));

    expect(restoreResultAsNewProblem).toHaveBeenCalledWith(
      savedProblem.results[0].id,
      'Workshop – Snapshot Result (restored)',
    );
  });
});
