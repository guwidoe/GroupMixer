import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Scenario } from '../../../types';
import { GroupsSection } from './GroupsSection';

function createScenario(): Scenario {
  return {
    people: [],
    groups: [{ id: 'g1', size: 4 }],
    num_sessions: 3,
    constraints: [],
    settings: {
      solver_type: 'simulated_annealing',
      stop_conditions: {},
      solver_params: {},
    },
  };
}

describe('GroupsSection', () => {
  it('supports cards/list switching and group actions through the shared collection architecture', async () => {
    const user = userEvent.setup();
    const onAddGroup = vi.fn();
    const onEditGroup = vi.fn();
    const onDeleteGroup = vi.fn();

    render(
      <GroupsSection
        scenario={createScenario()}
        onAddGroup={onAddGroup}
        onEditGroup={onEditGroup}
        onDeleteGroup={onDeleteGroup}
        onApplyGridGroups={vi.fn()}
        createGridGroupRow={() => ({ id: 'g2', size: 4, session_sizes: undefined })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /add group/i }));
    expect(onAddGroup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /import & bulk/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    expect(screen.getByRole('textbox', { name: /search groups/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /search groups/i }), 'zzz');
    expect(screen.getByText(/no groups match this search/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByText('g1')).toBeInTheDocument();

    await user.click(screen.getByText('g1'));
    expect(onEditGroup).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /default capacity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit table/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^view$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete g1/i })[0]!);
    expect(onDeleteGroup).toHaveBeenCalledWith('g1');

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    expect(screen.getByRole('textbox', { name: /groups grid csv/i })).toHaveValue(
      'Group,Default capacity,Session capacities\ng1,4,"[4,4,4]"',
    );
  }, 10000);
});
