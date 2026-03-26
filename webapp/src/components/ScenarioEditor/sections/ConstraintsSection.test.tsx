import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSampleScenario } from '../../../test/fixtures';
import type { Constraint } from '../../../types';
import { ConstraintsSection } from './ConstraintsSection';

vi.mock('../../PersonCard', () => ({
  default: ({ person }: { person: { id: string } }) => <span>{person.id}</span>,
}));

vi.mock('../../AttributeBalanceDashboard', () => ({
  default: () => <div>attribute-balance-dashboard</div>,
}));

const softTypes = [
  'RepeatEncounter',
  'AttributeBalance',
  'ShouldNotBeTogether',
  'ShouldStayTogether',
  'PairMeetingCount',
] as const;

const hardTypes = ['ImmovablePeople', 'MustStayTogether'] as const;

function renderSection(activeConstraintTab: (typeof softTypes)[number], constraints: Constraint[]) {
  return render(
    <ConstraintsSection
      scenario={createSampleScenario({ constraints })}
      activeConstraintTab={activeConstraintTab}
      constraintCategoryTab="soft"
      softTypes={softTypes}
      hardTypes={hardTypes}
      onChangeCategory={vi.fn()}
      onChangeTab={vi.fn()}
      onAddConstraint={vi.fn()}
      onEditConstraint={vi.fn()}
      onDeleteConstraint={vi.fn()}
    />,
  );
}

describe('ConstraintsSection', () => {
  it('renders Should Stay Together constraints with the correct label and weight', () => {
    renderSection('ShouldStayTogether', [
      {
        type: 'ShouldStayTogether',
        people: ['p1', 'p2', 'p3'],
        penalty_weight: 12,
        sessions: [0, 2],
      },
    ]);

    expect(screen.getByRole('button', { name: /should stay together/i })).toBeInTheDocument();
    expect(screen.getByText(/weight: 12/i)).toBeInTheDocument();
    expect(screen.getByText(/sessions:/i)).toBeInTheDocument();
    expect(screen.getByText(/1, 3/)).toBeInTheDocument();
  });

  it('renders Pair Meeting Count details without relying on unsafe union casts', () => {
    renderSection('PairMeetingCount', [
      {
        type: 'PairMeetingCount',
        people: ['p1', 'p4'],
        sessions: [1],
        target_meetings: 1,
        mode: 'exact',
        penalty_weight: 7,
      },
    ]);

    expect(screen.getByRole('button', { name: /pair meeting count/i })).toBeInTheDocument();
    expect(screen.getByText(/target meetings:/i)).toBeInTheDocument();
    expect(screen.getByText(/mode:/i)).toBeInTheDocument();
    expect(screen.getByText(/exact/i)).toBeInTheDocument();
    expect(screen.getByText(/sessions:/i)).toBeInTheDocument();
    expect(screen.getByText(/weight: 7/i)).toBeInTheDocument();
  });
});
