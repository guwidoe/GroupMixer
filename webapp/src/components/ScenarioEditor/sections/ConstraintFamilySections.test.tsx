import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../store';
import type { Scenario } from '../../../types';
import { HardConstraintFamilySection, SoftConstraintFamilySection } from './ConstraintFamilySections';

function createScenario(): Scenario {
  return {
    people: [
      { id: 'p1', attributes: { name: 'Alex' } },
      { id: 'p2', attributes: { name: 'Blair' } },
      { id: 'p3', attributes: { name: 'Casey' } },
    ],
    groups: [{ id: 'g1', size: 4 }],
    num_sessions: 3,
    constraints: [
      { type: 'ImmovablePeople', people: ['p1'], group_id: 'g1', sessions: [0] },
      { type: 'ShouldStayTogether', people: ['p2', 'p3'], penalty_weight: 20, sessions: [0, 1] },
    ],
    settings: {
      solver_type: 'simulated_annealing',
      stop_conditions: {},
      solver_params: {},
    },
  };
}

describe('ConstraintFamilySections', () => {
  const originalState = useAppStore.getState();

  beforeEach(() => {
    const scenario = createScenario();
    useAppStore.setState({
      ...originalState,
      ui: { ...originalState.ui, isLoading: false },
      resolveScenario: () => scenario,
      setScenario: vi.fn(),
    });
  });

  afterEach(() => {
    useAppStore.setState(originalState);
  });

  it('renders hard constraint families through the shared collection architecture', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <HardConstraintFamilySection family="ImmovablePeople" onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />,
    );

    expect(screen.getByRole('heading', { name: /immovable people/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add immovable people/i }));
    expect(onAdd).toHaveBeenCalledWith('ImmovablePeople');

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /group/i })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit table/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();
  });

  it('renders soft constraint family conversion affordances without the old family tabs', async () => {
    const user = userEvent.setup();

    render(
      <SoftConstraintFamilySection family="ShouldStayTogether" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: /should stay together/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/filter by person or session/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit table/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open filter for people/i }));
    expect(screen.getByRole('textbox', { name: /filter should stay together by people/i })).toBeInTheDocument();
    expect(screen.queryByText(/soft constraints/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    await user.click(screen.getByRole('button', { name: /select cards/i }));
    await user.click(screen.getByRole('button', { name: /select should stay together preference/i }));
    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    expect(screen.getByRole('button', { name: /convert selected to pair meeting count/i })).toBeInTheDocument();
  });
});
