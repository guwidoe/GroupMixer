import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../../services/scenarioAttributes';
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
      {
        type: 'AttributeBalance',
        group_id: 'g1',
        attribute_id: 'attr-gender',
        attribute_key: 'gender',
        desired_values: { female: 2, male: 1 },
        penalty_weight: 30,
        mode: 'exact',
        sessions: [0, 1],
      },
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
      attributeDefinitions: [createAttributeDefinition('gender', ['female', 'male'], 'attr-gender')],
      setScenario: vi.fn(),
      addNotification: vi.fn(),
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

    expect(screen.getByRole('heading', { name: /fixed placements/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add fixed placements/i }));
    expect(onAdd).toHaveBeenCalledWith('ImmovablePeople');

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /group/i })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();

    await user.click(screen.getByText('Alex'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('renders soft constraint family conversion affordances without the old family tabs', async () => {
    const user = userEvent.setup();

    render(
      <SoftConstraintFamilySection family="ShouldStayTogether" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: /prefer together/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/filter by person or session/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open filter for people/i }));
    expect(screen.getByRole('textbox', { name: /filter people/i })).toBeInTheDocument();
    expect(screen.queryByText(/soft constraints/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    await user.click(screen.getByRole('button', { name: /select cards/i }));
    await user.click(screen.getByRole('button', { name: /select prefer together item/i }));
    await user.click(screen.getByRole('button', { name: /^actions$/i }));
    expect(screen.getByRole('button', { name: /convert selected to pair encounters/i })).toBeInTheDocument();
  });

  it('uses attribute names plus a single targets column for attribute balance list editing and csv', async () => {
    const user = userEvent.setup();
    const onApplyAttributeBalanceRows = vi.fn();

    render(
      <SoftConstraintFamilySection
        family="AttributeBalance"
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onApplyAttributeBalanceRows={onApplyAttributeBalanceRows}
        createAttributeBalanceRow={() => ({
          constraint: {
            type: 'AttributeBalance',
            group_id: 'g1',
            attribute_id: 'attr-gender',
            attribute_key: 'gender',
            desired_values: {},
            penalty_weight: 50,
            mode: 'exact',
            sessions: undefined,
          },
          index: -1,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /targets/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /female/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^male /i })).not.toBeInTheDocument();
    expect(screen.getByText('gender')).toBeInTheDocument();
    expect(screen.getByText(/female: 2 · male: 1/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit table/i }));
    expect(screen.getByRole('spinbutton', { name: /target for female/i })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: /target for male/i })).toHaveValue(1);

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /balance attributes csv/i });
    expect(csvInput).toHaveValue(
      'Group,Attribute,Targets,Mode,Weight,Sessions\ng1,gender,"{""female"":2,""male"":1}",exact,30,"{""mode"":""selected"",""sessions"":[0,1]}"',
    );

    fireEvent.change(csvInput, {
      target: {
        value: 'Group,Attribute,Targets,Mode,Weight,Sessions\ng1,gender,"{""female"":2,""male"":1}",exact,30,"{""mode"":""selected"",""sessions"":[0,1,2]}"',
      },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApplyAttributeBalanceRows).toHaveBeenCalledWith([
      expect.objectContaining({
        constraint: expect.objectContaining({
          sessions: [0, 1, 2],
        }),
      }),
    ]);
  });

  it('validates attribute-balance target JSON keys against the selected attribute options', async () => {
    const user = userEvent.setup();
    const onApplyAttributeBalanceRows = vi.fn();

    useAppStore.setState({
      ...useAppStore.getState(),
      resolveScenario: () => ({
        ...createScenario(),
        constraints: [
          {
            type: 'AttributeBalance',
            group_id: 'g1',
            attribute_id: 'attr-gender',
            attribute_key: 'gender',
            desired_values: { female: 2, 'asdf | asdf:': 1 },
            penalty_weight: 30,
            mode: 'exact',
            sessions: [0, 1],
          },
        ],
      }),
      attributeDefinitions: [createAttributeDefinition('gender', ['female', 'asdf | asdf:'], 'attr-gender')],
    });

    render(
      <SoftConstraintFamilySection
        family="AttributeBalance"
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onApplyAttributeBalanceRows={onApplyAttributeBalanceRows}
        createAttributeBalanceRow={() => ({
          constraint: {
            type: 'AttributeBalance',
            group_id: 'g1',
            attribute_id: 'attr-gender',
            attribute_key: 'gender',
            desired_values: {},
            penalty_weight: 50,
            mode: 'exact',
            sessions: undefined,
          },
          index: -1,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /balance attributes csv/i });
    expect(csvInput).toHaveValue(
      'Group,Attribute,Targets,Mode,Weight,Sessions\ng1,gender,"{""female"":2,""asdf | asdf:"":1}",exact,30,"{""mode"":""selected"",""sessions"":[0,1]}"',
    );

    fireEvent.change(csvInput, {
      target: { value: 'Group,Attribute,Targets,Mode,Weight,Sessions\ng1,gender,"{""female"":3,""unknown"":2}",exact,30,"{""mode"":""selected"",""sessions"":[0,1]}"' },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(screen.getByText(/csv validation errors/i)).toBeInTheDocument();
    expect(screen.getByText(/expected targets keys to be one of/i)).toBeInTheDocument();
    expect(onApplyAttributeBalanceRows).not.toHaveBeenCalled();
  });
});
