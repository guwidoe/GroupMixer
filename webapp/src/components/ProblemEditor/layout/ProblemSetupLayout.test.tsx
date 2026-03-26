import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Problem } from '../../../types';
import { ProblemSetupLayout } from './ProblemSetupLayout';

function createProblem(): Problem {
  return {
    people: [
      { id: 'p1', attributes: { role: 'dev' } },
      { id: 'p2', attributes: { role: 'pm' } },
    ],
    groups: [
      { id: 'g1', size: 4 },
      { id: 'g2', size: 4 },
    ],
    num_sessions: 3,
    objectives: [{ type: 'maximize_unique_contacts', weight: 1 }],
    constraints: [
      { type: 'ImmovablePeople', people: ['p1'], group_id: 'g1', sessions: [0] },
      { type: 'RepeatEncounter', max_allowed_encounters: 1, penalty_function: 'linear', penalty_weight: 10 },
    ],
    settings: {
      solver_type: 'simulated_annealing',
      stop_conditions: {},
      solver_params: {},
    },
  };
}

describe('ProblemSetupLayout', () => {
  it('renders grouped sidebar navigation with the active section highlighted', () => {
    const onNavigate = vi.fn();

    render(
      <ProblemSetupLayout
        problem={createProblem()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="attributes"
        onNavigate={onNavigate}
      >
        <div>Section content</div>
      </ProblemSetupLayout>,
    );

    const sidebar = screen.getByLabelText('Problem Setup navigation');
    expect(within(sidebar).getByText('Model')).toBeInTheDocument();
    expect(within(sidebar).getByText('Rules')).toBeInTheDocument();
    expect(within(sidebar).getByText('Goals')).toBeInTheDocument();

    const activeItem = within(sidebar).getByRole('button', { name: /attributes/i });
    expect(activeItem).toHaveAttribute('aria-current', 'page');
    expect(within(activeItem).getByText('1')).toBeInTheDocument();
  });

  it('opens the mobile drawer and navigates via the shared section list', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <ProblemSetupLayout
        problem={createProblem()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="sessions"
        onNavigate={onNavigate}
      >
        <div>Section content</div>
      </ProblemSetupLayout>,
    );

    const openButton = screen.getByRole('button', { name: /open problem setup navigation/i });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(openButton);

    expect(openButton).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog', { name: /problem setup navigation drawer/i });
    await user.click(within(dialog).getByRole('button', { name: /soft constraints/i }));

    expect(onNavigate).toHaveBeenCalledWith('soft');
    expect(screen.queryByRole('dialog', { name: /problem setup navigation drawer/i })).not.toBeInTheDocument();
  });
});
