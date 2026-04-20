import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionReductionInvalidations, planSessionCountReduction } from '../../services/sessionCountMigration';
import { createSampleScenario } from '../../test/fixtures';
import { ReduceSessionsReviewModal } from './ReduceSessionsReviewModal';

describe('ReduceSessionsReviewModal', () => {
  it('disables confirmation when the reduction has blockers', () => {
    const plan = planSessionCountReduction({
      scenario: createSampleScenario({
        num_sessions: 4,
        people: [
          { id: 'p1', attributes: { name: 'Alice' } },
          { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
          { id: 'p3', attributes: { name: 'Cara' }, sessions: [3] },
          { id: 'p4', attributes: { name: 'Dan' } },
        ],
        constraints: [],
      }),
      nextSessionCount: 3,
    });

    render(
      <ReduceSessionsReviewModal
        isOpen
        plan={plan}
        invalidations={[]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /review session reduction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply reduction/i })).toBeDisabled();
    expect(screen.getByText(/person p3/i)).toBeInTheDocument();
  });

  it('shows runtime invalidations alongside plan details', () => {
    const plan = planSessionCountReduction({
      scenario: createSampleScenario({
        num_sessions: 4,
        groups: [{ id: 'g1', size: 2, session_sizes: [2, 2, 1, 1] }],
        constraints: [
          { type: 'MustStayApart', people: ['p1', 'p2'], sessions: [3] },
        ],
        people: [
          { id: 'p1', attributes: { name: 'Alice' } },
          { id: 'p2', attributes: { name: 'Bob' }, sessions: [0, 1, 2] },
          { id: 'p3', attributes: { name: 'Cara' } },
          { id: 'p4', attributes: { name: 'Dan' } },
        ],
      }),
      nextSessionCount: 3,
    });

    render(
      <ReduceSessionsReviewModal
        isOpen
        plan={plan}
        invalidations={buildSessionReductionInvalidations({
          hasActiveSolution: true,
          hasWarmStartSelection: true,
          hasManualEditorState: false,
        })}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(/runtime resets/i)).toBeInTheDocument();
    expect(screen.getByText(/current result will be cleared/i)).toBeInTheDocument();
    expect(screen.getByText(/warm start selection will be cleared/i)).toBeInTheDocument();
    expect(screen.getByText(/must stay apart/i)).toBeInTheDocument();
  });
});
