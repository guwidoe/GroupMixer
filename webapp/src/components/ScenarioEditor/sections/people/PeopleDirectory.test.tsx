import { render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Scenario } from '../../../../types';
import { createSampleScenario, createSampleSolverSettings } from '../../../../test/fixtures';
import { PeopleDirectory } from './PeopleDirectory';

function createLargeScenario(peopleCount: number): Scenario {
  return createSampleScenario({
    people: Array.from({ length: peopleCount }, (_, index) => ({
      id: `person-${index + 1}`,
      attributes: { name: `Person ${String(index + 1).padStart(4, '0')}` },
    })),
    settings: createSampleSolverSettings(),
  });
}

describe('PeopleDirectory', () => {
  it('shows the shell immediately and progressively reveals large people lists', () => {
    vi.useFakeTimers();

    render(
      <PeopleDirectory
        scenario={createLargeScenario(260)}
        attributeDefinitions={[]}
        sessionsCount={3}
        onAddPerson={vi.fn()}
        onEditPerson={vi.fn()}
        onDeletePerson={vi.fn()}
        onOpenBulkAddForm={vi.fn()}
        onOpenBulkUpdateForm={vi.fn()}
        onTriggerCsvUpload={vi.fn()}
        onTriggerExcelImport={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /^people$/i })).toBeInTheDocument();
    expect(screen.getByText('260')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loading people asynchronously/i);
    expect(screen.getByText('Person 0001')).toBeInTheDocument();
    expect(screen.queryByText('Person 0260')).not.toBeInTheDocument();

    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Person 0260')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('supports shared cards/list switching and person actions', async () => {
    const user = userEvent.setup();
    const onEditPerson = vi.fn();
    const onDeletePerson = vi.fn();

    render(
      <PeopleDirectory
        scenario={createSampleScenario({
          people: [
            { id: 'p1', attributes: { name: 'Alex', role: 'dev' }, sessions: [0, 1] },
          ],
          settings: createSampleSolverSettings(),
        })}
        attributeDefinitions={[{ key: 'role', values: ['dev'] }]}
        sessionsCount={3}
        onAddPerson={vi.fn()}
        onEditPerson={onEditPerson}
        onDeletePerson={onDeletePerson}
        onOpenBulkAddForm={vi.fn()}
        onOpenBulkUpdateForm={vi.fn()}
        onTriggerCsvUpload={vi.fn()}
        onTriggerExcelImport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit alex/i }));
    expect(onEditPerson).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete alex/i })[0]!);
    expect(onDeletePerson).toHaveBeenCalledWith('p1');
  });
});
