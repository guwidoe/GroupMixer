import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Scenario } from '../../../types';
import { ScenarioSetupLayout } from './ScenarioSetupLayout';

function createScenario(): Scenario {
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

describe('ScenarioSetupLayout', () => {
  it('renders grouped compact sidebar navigation with the active section highlighted', () => {
    const onNavigate = vi.fn();

    render(
      <ScenarioSetupLayout
        scenario={createScenario()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="attributes"
        onNavigate={onNavigate}
      >
        <div>Section content</div>
      </ScenarioSetupLayout>,
    );

    const sidebar = screen.getByLabelText('Scenario Setup navigation');
    expect(within(sidebar).getByText('Model')).toBeInTheDocument();
    expect(within(sidebar).getByText('Rules')).toBeInTheDocument();
    expect(within(sidebar).getByText('Goals')).toBeInTheDocument();

    const activeItem = within(sidebar).getByRole('button', { name: /attribute definitions/i });
    expect(activeItem).toHaveAttribute('aria-current', 'page');
    expect(within(activeItem).getByText('1')).toBeInTheDocument();
    expect(within(sidebar).queryByText(/define the attribute schema/i)).not.toBeInTheDocument();
  });

  it('collapses the desktop sidebar into an icon rail while keeping count badges', async () => {
    const user = userEvent.setup();

    render(
      <ScenarioSetupLayout
        scenario={createScenario()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="attributes"
        onNavigate={vi.fn()}
        collapsedSidebarHeader={
          <div>
            <button type="button" aria-label="Load">Load</button>
            <button type="button" aria-label="Save">Save</button>
            <button type="button" aria-label="Demo Data">Demo Data</button>
          </div>
        }
      >
        <div>Section content</div>
      </ScenarioSetupLayout>,
    );

    const sidebar = screen.getByLabelText('Scenario Setup navigation');
    await user.click(screen.getByRole('button', { name: /collapse scenario setup sidebar/i }));

    expect(screen.getByRole('button', { name: /expand scenario setup sidebar/i })).toBeInTheDocument();
    expect(within(sidebar).queryByText('Scenario Setup')).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /load/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /demo data/i })).toBeInTheDocument();

    const attributesButton = within(sidebar).getByRole('button', { name: /attribute definitions/i });
    expect(within(attributesButton).getByText('1')).toBeInTheDocument();
  });

  it('opens the mobile drawer and navigates via the shared section list', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <ScenarioSetupLayout
        scenario={createScenario()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="sessions"
        onNavigate={onNavigate}
      >
        <div>Section content</div>
      </ScenarioSetupLayout>,
    );

    const openButton = screen.getByRole('button', { name: /open scenario setup navigation/i });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(openButton);

    expect(openButton).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog', { name: /scenario setup navigation drawer/i });
    await user.click(within(dialog).getByRole('button', { name: /soft constraints/i }));

    expect(onNavigate).toHaveBeenCalledWith('soft');
    expect(screen.queryByRole('dialog', { name: /scenario setup navigation drawer/i })).not.toBeInTheDocument();
  });

  it('renders the sidebar shell without counts first, then shows counts when summary data arrives', () => {
    const { rerender } = render(
      <ScenarioSetupLayout
        scenario={null}
        attributeDefinitions={[]}
        objectiveCount={0}
        activeSection="people"
        onNavigate={vi.fn()}
      >
        <div>Section content</div>
      </ScenarioSetupLayout>,
    );

    const sidebar = screen.getByLabelText('Scenario Setup navigation');
    const peopleButton = within(sidebar).getByRole('button', { name: /people/i });
    expect(within(peopleButton).queryByText('2')).not.toBeInTheDocument();

    rerender(
      <ScenarioSetupLayout
        scenario={createScenario()}
        attributeDefinitions={[{ key: 'role', values: ['dev', 'pm'] }]}
        objectiveCount={1}
        activeSection="people"
        onNavigate={vi.fn()}
      >
        <div>Section content</div>
      </ScenarioSetupLayout>,
    );

    expect(within(screen.getByRole('button', { name: /people/i })).getByText('2')).toBeInTheDocument();
  });
});
