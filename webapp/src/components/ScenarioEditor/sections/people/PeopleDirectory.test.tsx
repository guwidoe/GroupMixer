import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../../../services/scenarioAttributes';
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

function createBulkUpdateProps() {
  return {
    bulkUpdateActive: false,
    bulkUpdateTextMode: 'grid' as const,
    setBulkUpdateTextMode: vi.fn(),
    bulkUpdateCsvInput: '',
    setBulkUpdateCsvInput: vi.fn(),
    bulkUpdateHeaders: ['id', 'name'],
    setBulkUpdateHeaders: vi.fn(),
    bulkUpdateRows: [],
    setBulkUpdateRows: vi.fn(),
    onRefreshBulkUpdate: vi.fn(),
    onApplyBulkUpdate: vi.fn(),
    onCloseBulkUpdate: vi.fn(),
  };
}

describe('PeopleDirectory', () => {
  it('shows the shell immediately and progressively reveals large people lists', () => {
    vi.useFakeTimers();

    try {
      render(
        <PeopleDirectory
          scenario={createLargeScenario(260)}
          attributeDefinitions={[]}
          sessionsCount={3}
          onAddPerson={vi.fn()}
          onEditPerson={vi.fn()}
          onDeletePerson={vi.fn()}
          onInlineUpdatePerson={vi.fn()}
          onOpenBulkAddForm={vi.fn()}
          onOpenBulkUpdateForm={vi.fn()}
          {...createBulkUpdateProps()}
          onTriggerCsvUpload={vi.fn()}
          onTriggerExcelImport={vi.fn()}
        />,
      );

      expect(screen.getByRole('heading', { name: /^people$/i })).toBeInTheDocument();
      expect(screen.getByText('260')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('Person 0001')).toBeInTheDocument();
      expect(screen.queryByText('Person 0260')).not.toBeInTheDocument();

      act(() => {
        vi.runAllTimers();
      });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText(/page 1 of/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
        attributeDefinitions={[createAttributeDefinition('role', ['dev'], 'attr-role')]}
        sessionsCount={3}
        onAddPerson={vi.fn()}
        onEditPerson={onEditPerson}
        onDeletePerson={onDeletePerson}
        onInlineUpdatePerson={vi.fn()}
        onOpenBulkAddForm={vi.fn()}
        onOpenBulkUpdateForm={vi.fn()}
        {...createBulkUpdateProps()}
        onTriggerCsvUpload={vi.fn()}
        onTriggerExcelImport={vi.fn()}
      />,
    );

    expect(screen.queryByText(/^availability$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit alex/i }));
    expect(onEditPerson).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /search table/i })).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(screen.getAllByText('dev').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete alex/i })[0]!);
    expect(onDeletePerson).toHaveBeenCalledWith('p1');
  });

  it('shows list-view attributes even when stored keys differ in casing', async () => {
    const user = userEvent.setup();

    render(
      <PeopleDirectory
        scenario={createSampleScenario({
          people: [
            { id: 'p1', attributes: { name: 'Alex', Gender: 'female', Department: 'Engineering' }, sessions: [0, 1] },
          ],
          settings: createSampleSolverSettings(),
        })}
        attributeDefinitions={[
          createAttributeDefinition('gender', ['female', 'male'], 'attr-gender'),
          createAttributeDefinition('department', ['Engineering'], 'attr-department'),
        ]}
        sessionsCount={3}
        onAddPerson={vi.fn()}
        onEditPerson={vi.fn()}
        onDeletePerson={vi.fn()}
        onInlineUpdatePerson={vi.fn()}
        onOpenBulkAddForm={vi.fn()}
        onOpenBulkUpdateForm={vi.fn()}
        {...createBulkUpdateProps()}
        onTriggerCsvUpload={vi.fn()}
        onTriggerExcelImport={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /list/i }));

    expect(screen.getByRole('columnheader', { name: /gender/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /department/i })).toBeInTheDocument();
    expect(screen.getAllByText('female').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
  });

  it('uses the shared data-grid edit and csv controls as the only bulk-edit surface', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [bulkUpdateActive, setBulkUpdateActive] = React.useState(false);
      const [bulkUpdateTextMode, setBulkUpdateTextMode] = React.useState<'text' | 'grid'>('grid');
      const [bulkUpdateCsvInput, setBulkUpdateCsvInput] = React.useState('id,name\np1,Alex');
      const [bulkUpdateHeaders, setBulkUpdateHeaders] = React.useState(['id', 'name']);
      const [bulkUpdateRows, setBulkUpdateRows] = React.useState([{ id: 'p1', name: 'Alex' }]);

      return (
        <PeopleDirectory
          scenario={createSampleScenario({
            people: [{ id: 'p1', attributes: { name: 'Alex' } }],
            settings: createSampleSolverSettings(),
          })}
          attributeDefinitions={[]}
          sessionsCount={3}
          onAddPerson={vi.fn()}
          onEditPerson={vi.fn()}
          onDeletePerson={vi.fn()}
          onInlineUpdatePerson={vi.fn()}
          onOpenBulkAddForm={vi.fn()}
          onOpenBulkUpdateForm={() => {
            setBulkUpdateActive(true);
            setBulkUpdateTextMode('grid');
          }}
          bulkUpdateActive={bulkUpdateActive}
          bulkUpdateTextMode={bulkUpdateTextMode}
          setBulkUpdateTextMode={setBulkUpdateTextMode}
          bulkUpdateCsvInput={bulkUpdateCsvInput}
          setBulkUpdateCsvInput={setBulkUpdateCsvInput}
          bulkUpdateHeaders={bulkUpdateHeaders}
          setBulkUpdateHeaders={setBulkUpdateHeaders}
          bulkUpdateRows={bulkUpdateRows}
          setBulkUpdateRows={setBulkUpdateRows}
          onRefreshBulkUpdate={vi.fn()}
          onApplyBulkUpdate={vi.fn()}
          onCloseBulkUpdate={() => setBulkUpdateActive(false)}
          onTriggerCsvUpload={vi.fn()}
          onTriggerExcelImport={vi.fn()}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /list/i }));
    await user.click(screen.getByRole('button', { name: /edit table/i }));

    expect(screen.queryByRole('heading', { name: /bulk edit people/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to directory/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /edit name for bulk row 1/i })).toHaveValue('Alex');

    await user.click(screen.getByRole('button', { name: /^csv$/i }));

    expect(screen.getByRole('textbox', { name: /people bulk edit csv/i })).toHaveValue('id,name\np1,Alex');
  });
});
