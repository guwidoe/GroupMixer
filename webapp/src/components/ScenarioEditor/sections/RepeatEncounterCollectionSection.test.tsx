import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Scenario } from '../../../types';
import { RepeatEncounterCollectionSection } from './RepeatEncounterCollectionSection';

function createScenario(): Scenario {
  return {
    people: [],
    groups: [],
    num_sessions: 3,
    constraints: [
      {
        type: 'RepeatEncounter',
        max_allowed_encounters: 1,
        penalty_function: 'linear',
        penalty_weight: 5,
      },
    ],
    settings: {
      solver_type: 'simulated_annealing',
      stop_conditions: {},
      solver_params: {},
    },
  };
}

describe('RepeatEncounterCollectionSection', () => {
  it('uses shared typed grid editing and csv controls', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <RepeatEncounterCollectionSection
        scenario={createScenario()}
        onAdd={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onApplyGridRows={vi.fn()}
        createGridRow={() => ({
          constraint: {
            type: 'RepeatEncounter',
            max_allowed_encounters: 2,
            penalty_function: 'squared',
            penalty_weight: 8,
          },
          index: -1,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    expect(screen.getByRole('textbox', { name: /search repeat encounter preferences/i })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /search repeat encounter preferences/i }), 'zzz');
    expect(screen.getByText(/no repeat limits match this search/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByRole('button', { name: /edit repeat encounter preference/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit repeat encounter preference/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /^list$/i }));
    const penaltyFunctionSelect = screen.getByRole('combobox', { name: /edit penalty function for row 0-0/i });
    expect(within(penaltyFunctionSelect).getByRole('option', { name: 'linear' })).toBeInTheDocument();
    expect(within(penaltyFunctionSelect).getByRole('option', { name: 'squared' })).toBeInTheDocument();
    expect(within(penaltyFunctionSelect).queryByRole('option', { name: 'quadratic' })).not.toBeInTheDocument();
    expect(within(penaltyFunctionSelect).queryByRole('option', { name: 'exponential' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    expect(screen.getByRole('textbox', { name: /repeat encounter csv/i })).toHaveValue(
      'Limit,Penalty function,Weight\n1,linear,5',
    );
  }, 15000);
});
