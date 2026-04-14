import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsScheduleList } from './ResultsScheduleList';
import { createSampleScenario } from '../../test/fixtures';

const scenario = createSampleScenario();
const participants = [
  {
    personId: 'p1',
    displayName: 'Alice',
    person: scenario.people[0],
    assignedSessions: 1,
    unassignedSessions: 1,
    sessions: [
      {
        sessionIndex: 0,
        sessionLabel: 'Session 1',
        groupId: 'g1',
        groupSize: 2,
        isAssigned: true,
      },
      {
        sessionIndex: 1,
        sessionLabel: 'Session 2',
        groupId: null,
        groupSize: null,
        isAssigned: false,
      },
    ],
  },
];

describe('ResultsScheduleList', () => {
  it('renders both mobile cards and desktop table rows from participant itineraries', () => {
    const { container } = render(<ResultsScheduleList participants={participants} sessionCount={2} />);

    expect(screen.getAllByText('Alice').length).toBeGreaterThan(1);
    expect(screen.getByText('1/2 assigned')).toBeInTheDocument();
    expect(screen.getAllByText('Not assigned').length).toBeGreaterThan(0);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /person/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /session 2/i })).toBeInTheDocument();

    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Session 1')).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText('g1')).toBeInTheDocument();
  });
});
