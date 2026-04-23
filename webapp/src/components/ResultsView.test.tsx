/* eslint-disable react/no-multi-comp */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsView } from './ResultsView';
import { useAppStore } from '../store';
import { createSampleScenario, createSampleSolution, createSavedScenario } from '../test/fixtures';

vi.mock('../hooks', async () => {
  const React = await import('react');
  return {
    useLocalStorageState: (_key: string, initialValue: string) => React.useState(initialValue),
    useOutsideClick: () => {},
  };
});

vi.mock('./ConstraintComplianceCards', () => ({
  default: ({ scenario, solution }: { scenario: { people: unknown[] }; solution: { assignments: unknown[] } }) => (
    <div>{`compliance:${scenario.people.length}:${solution.assignments.length}`}</div>
  ),
}));

vi.mock('./ResultsView/ResultsHeader', () => ({
  ResultsHeader: ({ resultName, onRestoreConfig, summary }: { resultName?: string; onRestoreConfig: () => void; summary: { totalSessions: number } | null }) => (
    <div>
      <div>{`header:${resultName ?? 'none'}`}</div>
      <div>{`summary:${summary?.totalSessions ?? 0}`}</div>
      <button onClick={onRestoreConfig}>restore</button>
    </div>
  ),
}));

vi.mock('./ResultsView/ResultsMetrics', () => ({
  ResultsMetrics: ({ solution }: { solution: { final_score: number } }) => <div>{`metrics:${solution.final_score}`}</div>,
}));

vi.mock('./ResultsView/ResultsSchedule', () => ({
  ResultsSchedule: ({
    resultsModel,
    effectiveScenario,
    vizPluginId,
  }: {
    resultsModel: { sessions: Array<unknown> } | null;
    effectiveScenario: { groups: Array<{ id: string }> };
    vizPluginId: string;
  }) => <div>{`schedule:${resultsModel?.sessions.length ?? 0}:${effectiveScenario.groups[0]?.id ?? 'none'}:${vizPluginId}`}</div>,
}));

describe('ResultsView', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty results state when no solution is selected', () => {
    const savedScenario = createSavedScenario({ name: 'Workshop' });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: null,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });

    render(
      <MemoryRouter>
        <ResultsView />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /no results yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saved results/i })).toBeInTheDocument();
  });

  it('shows the missing-scenario empty state when a solution exists without a recoverable scenario', () => {
    useAppStore.setState({
      scenario: null,
      solution: createSampleSolution(),
      currentScenarioId: null,
      savedScenarios: {},
    });

    render(
      <MemoryRouter>
        <ResultsView />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /no results available/i })).toBeInTheDocument();
  });

  it('hydrates child views from the saved result snapshot and restores that configuration', async () => {
    const user = userEvent.setup();
    const savedScenario = createSavedScenario({
      name: 'Workshop',
      scenario: createSampleScenario({ groups: [{ id: 'live-group', size: 4 }], num_sessions: 1 }),
    });
    savedScenario.results = [
      {
        ...savedScenario.results[0],
        name: 'Snapshot Result',
        scenarioSnapshot: {
          people: savedScenario.scenario.people,
          groups: [{ id: 'snap-group', size: 4 }],
          num_sessions: 2,
          objectives: savedScenario.scenario.objectives,
          constraints: savedScenario.scenario.constraints,
        },
      },
    ];
    const restoreResultAsNewScenario = vi.fn();

    useAppStore.setState({
      scenario: savedScenario.scenario,
      solution: savedScenario.results[0].solution,
      solverState: useAppStore.getState().solverState,
      currentScenarioId: savedScenario.id,
      currentResultId: savedScenario.results[0].id,
      savedScenarios: { [savedScenario.id]: savedScenario },
      restoreResultAsNewScenario: restoreResultAsNewScenario as never,
    });

    render(
      <MemoryRouter>
        <ResultsView />
      </MemoryRouter>,
    );

    expect(screen.getByText('header:Snapshot Result')).toBeInTheDocument();
    expect(screen.getByText('summary:2')).toBeInTheDocument();
    expect(screen.getByText('metrics:12.5')).toBeInTheDocument();
    expect(screen.getByText('compliance:4:8')).toBeInTheDocument();
    expect(screen.getByText('schedule:2:snap-group:scheduleMatrix')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /restore/i }));

    expect(restoreResultAsNewScenario).toHaveBeenCalledWith(
      savedScenario.results[0].id,
      'Workshop – Snapshot Result (restored)',
    );
  });
});
