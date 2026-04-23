import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsScheduleGrid } from './ResultsScheduleGrid';
import type { ResultsSessionData } from '../../services/results/buildResultsModel';
import { createSampleScenario } from '../../test/fixtures';

const scenario = createSampleScenario();

const sessionData: ResultsSessionData[] = [
  {
    sessionIndex: 0,
    label: 'Session 1',
    totalPeople: 4,
    totalCapacity: 4,
    openSeats: 0,
    groups: [
      {
        id: 'Group 1',
        size: 4,
        people: scenario.people,
        assignedCount: 4,
        openSeats: 0,
        fillRatio: 1,
      },
    ],
  },
];

describe('ResultsScheduleGrid', () => {
  it('renders compact group membership without redundant session or capacity chrome', () => {
    const { container } = render(<ResultsScheduleGrid sessionData={sessionData} />);

    expect(screen.queryByText('Session Overview')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group 1' })).toBeInTheDocument();
    expect(screen.getByText('4/4 people')).toBeInTheDocument();
    expect(screen.queryByText('4 assigned')).not.toBeInTheDocument();
    expect(container.querySelector('.h-1\\.5')).not.toBeInTheDocument();
    expect(container.querySelector('.grid-cols-\\[repeat\\(auto-fit\\,minmax\\(min\\(100\\%\\,15rem\\)\\,1fr\\)\\)\\]')).toBeInTheDocument();
    expect(container.querySelector('.border-t.pt-3')).toBeInTheDocument();
  });
});
