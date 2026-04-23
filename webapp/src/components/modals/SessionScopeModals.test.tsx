import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../services/scenarioAttributes';
import { useAppStore } from '../../store';
import { AttributeBalanceModal } from './AttributeBalanceModal';
import { ImmovablePeopleModal } from './ImmovablePeopleModal';
import { MustStayApartModal } from './MustStayApartModal';
import { ShouldStayTogetherModal } from './ShouldStayTogetherModal';

describe('session-scope modals', () => {
  const originalState = useAppStore.getState();

  beforeEach(() => {
    useAppStore.setState({
      ...originalState,
      ui: { ...originalState.ui, isLoading: false },
      resolveScenario: () => ({
        people: [
          { id: 'p1', attributes: { name: 'Alex' } },
          { id: 'p2', attributes: { name: 'Blair' } },
        ],
        groups: [{ id: 'g1', size: 4 }],
        num_sessions: 3,
        constraints: [],
        settings: {
          solver_type: 'simulated_annealing',
          stop_conditions: {},
          solver_params: {},
        },
      }),
      attributeDefinitions: [createAttributeDefinition('gender', ['female', 'male'], 'attr-gender')],
    });
  });

  afterEach(() => {
    useAppStore.setState(originalState);
  });

  it('preserves an explicit all-current selection in the should-stay-together modal', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ShouldStayTogetherModal
        sessionsCount={3}
        initial={{
          type: 'ShouldStayTogether',
          people: ['p1', 'p2'],
          penalty_weight: 10,
          sessions: undefined,
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /only selected sessions/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'ShouldStayTogether',
      people: ['p1', 'p2'],
      penalty_weight: 10,
      sessions: [0, 1, 2],
    });
  });

  it('serializes all-session mode back to undefined in the attribute-balance modal', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <AttributeBalanceModal
        initial={{
          type: 'AttributeBalance',
          group_id: 'g1',
          attribute_id: 'attr-gender',
          attribute_key: 'gender',
          desired_values: { female: 2, male: 1 },
          penalty_weight: 10,
          mode: 'exact',
          sessions: [0, 1, 2],
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /all sessions/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'AttributeBalance',
      group_id: 'g1',
      attribute_id: 'attr-gender',
      attribute_key: 'gender',
      desired_values: { female: 2, male: 1 },
      penalty_weight: 10,
      mode: 'exact',
      sessions: undefined,
    });
  });

  it('uses the shared compact session-scope field in modals', () => {
    render(
      <ShouldStayTogetherModal
        sessionsCount={3}
        initial={{
          type: 'ShouldStayTogether',
          people: ['p1', 'p2'],
          penalty_weight: 10,
          sessions: [0, 2],
        }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText(/automatically includes future sessions/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/why choose all sessions/i)).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.queryByText(/session 1/i)).not.toBeInTheDocument();
  });

  it('migrates immovable-people modal to the shared session-scope model', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <ImmovablePeopleModal
        sessionsCount={3}
        initial={{
          type: 'ImmovablePeople',
          people: ['p1'],
          group_id: 'g1',
          sessions: undefined,
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /only selected sessions/i }));
    await user.click(screen.getByRole('checkbox', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'ImmovablePeople',
      people: ['p1'],
      group_id: 'g1',
      sessions: [0, 2],
    });
  });

  it('uses the shared hard-people modal path for keep-apart constraints', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <MustStayApartModal
        sessionsCount={3}
        initial={{
          type: 'MustStayApart',
          people: ['p1', 'p2'],
          sessions: undefined,
        }}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('radio', { name: /only selected sessions/i }));
    await user.click(screen.getByRole('checkbox', { name: '2' }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'MustStayApart',
      people: ['p1', 'p2'],
      sessions: [0, 2],
    });
  });
});
