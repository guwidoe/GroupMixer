import { render, screen } from '@testing-library/react';
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

    render(
      <RepeatEncounterCollectionSection
        scenario={createScenario()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onApplyGridRows={vi.fn()}
        createGridRow={() => ({
          constraint: {
            type: 'RepeatEncounter',
            max_allowed_encounters: 2,
            penalty_function: 'quadratic',
            penalty_weight: 8,
          },
          index: -1,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    expect(screen.getByRole('textbox', { name: /repeat encounter csv/i })).toHaveValue(
      'Limit,Penalty function,Weight\n1,linear,5',
    );
  });
});
