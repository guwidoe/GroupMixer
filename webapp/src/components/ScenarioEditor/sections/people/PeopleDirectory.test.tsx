import { render, screen } from '@testing-library/react';
import { act } from 'react';
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

    expect(screen.getByRole('heading', { name: /people \(260\)/i })).toBeInTheDocument();
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
});
