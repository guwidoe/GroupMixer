import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../services/scenarioAttributes';
import { useAppStore } from '../../store';
import { AttributeBalanceModal } from './AttributeBalanceModal';

describe('AttributeBalanceModal', () => {
  const originalState = useAppStore.getState();

  beforeEach(() => {
    useAppStore.setState({
      ...originalState,
      ui: { ...originalState.ui, isLoading: false },
      resolveScenario: () => ({
        people: [
          { id: 'p1', attributes: { name: 'Alex', gender: 'female' }, sessions: [0] },
          { id: 'p2', attributes: { name: 'Blair', gender: 'female' }, sessions: [0] },
          { id: 'p3', attributes: { name: 'Casey', gender: 'female' }, sessions: [0] },
          { id: 'p4', attributes: { name: 'Drew', gender: 'male' }, sessions: [1] },
          { id: 'p5', attributes: { name: 'Elliot' }, sessions: [1] },
        ],
        groups: [{ id: 'g1', size: 4, session_sizes: [4, 2] }],
        num_sessions: 2,
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

  it('seeds create-mode defaults from the selected-session mix and minimum capacity', async () => {
    const user = userEvent.setup();

    render(<AttributeBalanceModal onCancel={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText(/using the smallest selected-session group capacity \(2\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('female count')).toHaveValue('1');
    expect(screen.getByLabelText('male count')).toHaveValue('1');
    expect(screen.getByLabelText(/not allocated count/i)).toHaveTextContent('0');

    await user.click(screen.getByRole('radio', { name: /only selected sessions/i }));
    await user.click(screen.getByRole('checkbox', { name: '2' }));

    expect(screen.getByLabelText('female count')).toHaveValue('4');
    expect(screen.getByLabelText('male count')).toHaveValue('0');
  });

  it('preserves edit-mode values instead of reseeding them', () => {
    render(
      <AttributeBalanceModal
        initial={{
          type: 'AttributeBalance',
          group_id: 'g1',
          attribute_id: 'attr-gender',
          attribute_key: 'gender',
          desired_values: { female: 2 },
          penalty_weight: 10,
          mode: 'exact',
          sessions: undefined,
        }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('female count')).toHaveValue('2');
    expect(screen.getByLabelText('male count')).toHaveValue('0');
  });
});
