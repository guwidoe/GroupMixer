import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAttributeDefinition } from '../../../../services/scenarioAttributes';
import type { Person, Scenario } from '../../../../types';
import { createSampleScenario, createSampleSolverSettings } from '../../../../test/fixtures';
import { PeopleDirectory } from './PeopleDirectory';

function createLargeScenario(peopleCount: number): Scenario {
  return createSampleScenario({
    people: Array.from({ length: peopleCount }, (_, index) => ({
      id: `person-${index + 1}`,
      name: `Person ${String(index + 1).padStart(4, '0')}`,
      attributes: {},
    })),
    settings: createSampleSolverSettings(),
  });
}

function createBaseProps(overrides: Partial<React.ComponentProps<typeof PeopleDirectory>> = {}) {
  return {
    scenario: createSampleScenario({ settings: createSampleSolverSettings() }),
    attributeDefinitions: [],
    sessionsCount: 3,
    onAddPerson: vi.fn(),
    onEditPerson: vi.fn(),
    onDeletePerson: vi.fn(),
    onApplyGridPeople: vi.fn(),
    createGridPersonRow: () => ({ id: 'new-person', name: '', attributes: {}, sessions: undefined } satisfies Person),
    ...overrides,
  };
}

describe('PeopleDirectory', () => {
  it('shows the shell immediately and progressively reveals large people lists', () => {
    vi.useFakeTimers();

    try {
      render(
        <PeopleDirectory
          {...createBaseProps({
            scenario: createLargeScenario(180),
          })}
        />,
      );

      expect(screen.getByRole('heading', { name: /^people$/i })).toBeInTheDocument();
      expect(screen.getByText('180')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /import & bulk/i })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/preparing editable table/i);

      fireEvent.click(screen.getByRole('button', { name: /^cards$/i }));
      expect(screen.getByText('Person 0001')).toBeInTheDocument();
      expect(screen.queryByText('Person 0180')).not.toBeInTheDocument();

      act(() => {
        vi.runAllTimers();
      });

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByText('Person 0180')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  }, 15000);

  it('supports shared cards/list switching and person actions', async () => {
    const user = userEvent.setup();
    const onEditPerson = vi.fn();
    const onDeletePerson = vi.fn();
    const onApplyGridPeople = vi.fn();

    render(
      <PeopleDirectory
        {...createBaseProps({
          scenario: createSampleScenario({
            people: [
              { id: 'p1', name: 'Alex', attributes: { role: 'dev' }, sessions: [0, 1] },
            ],
            settings: createSampleSolverSettings(),
          }),
          attributeDefinitions: [createAttributeDefinition('role', ['dev'], 'attr-role')],
          onEditPerson,
          onDeletePerson,
          onApplyGridPeople,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /^cards$/i }));
    expect(screen.getByRole('textbox', { name: /search people/i })).toBeInTheDocument();
    expect(screen.queryByText(/browse the people directory as cards/i)).not.toBeInTheDocument();

    expect(screen.queryByText(/^availability$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();

    await user.click(screen.getByText('Alex'));
    expect(onEditPerson).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /search table/i })).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(screen.getAllByText('dev').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /edit table/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^csv$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^view$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /delete alex/i })[0]!);
    expect(onDeletePerson).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /apply changes/i }));
    expect(onApplyGridPeople).toHaveBeenCalledWith([]);
  });

  it('shows list-view attributes even when stored keys differ in casing', async () => {
    const user = userEvent.setup();

    render(
      <PeopleDirectory
        {...createBaseProps({
          scenario: createSampleScenario({
            people: [
              { id: 'p1', name: 'Alex', attributes: { Gender: 'female', Department: 'Engineering' }, sessions: [0, 1] },
            ],
            settings: createSampleSolverSettings(),
          }),
          attributeDefinitions: [
            createAttributeDefinition('gender', ['female', 'male'], 'attr-gender'),
            createAttributeDefinition('department', ['Engineering'], 'attr-department'),
          ],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /list/i }));

    expect(screen.getByRole('columnheader', { name: /gender/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /department/i })).toBeInTheDocument();
    expect(screen.getAllByText('female').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Engineering').length).toBeGreaterThan(0);
  });

  it('uses the shared typed grid csv workflow for people columns including sessions', async () => {
    const user = userEvent.setup();
    const onApplyGridPeople = vi.fn();

    render(
      <PeopleDirectory
        {...createBaseProps({
          scenario: createSampleScenario({
            people: [{ id: 'p1', name: 'Alex', attributes: { role: 'dev' }, sessions: [0, 1] }],
            settings: createSampleSolverSettings(),
          }),
          attributeDefinitions: [createAttributeDefinition('role', ['dev', 'design'], 'attr-role')],
          createGridPersonRow: () => ({ id: 'p2', name: '', attributes: {}, sessions: undefined }),
          onApplyGridPeople,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /list/i }));
    expect(screen.getByRole('button', { name: /edit table/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^csv$/i }));
    const csvInput = screen.getByRole('textbox', { name: /people grid csv/i });
    expect(String((csvInput as HTMLTextAreaElement).value)).toMatch(/Name,Sessions,role/i);
    expect(String((csvInput as HTMLTextAreaElement).value)).toContain('"[0,1]"');

    fireEvent.change(csvInput, {
      target: {
        value: 'Name,Sessions,role\nAlex,"[0,1,2]",dev',
      },
    });
    await user.click(screen.getByRole('button', { name: /apply changes/i }));

    expect(onApplyGridPeople).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'p1',
        sessions: [0, 1, 2],
      }),
    ]);
  });

  it('warns before switching from list to cards when the grid has unapplied changes', async () => {
    const user = userEvent.setup();
    const onApplyGridPeople = vi.fn();

    render(
      <PeopleDirectory
        {...createBaseProps({
          scenario: createSampleScenario({
            people: [{ id: 'p1', name: 'Alex', attributes: {} }],
            settings: createSampleSolverSettings(),
          }),
          onApplyGridPeople,
        })}
      />,
    );

    const input = screen.getByRole('textbox', { name: /edit name for row p1/i });
    await user.clear(input);
    await user.type(input, 'Alex Prime');
    await user.tab();

    await user.click(screen.getByRole('button', { name: /^cards$/i }));

    expect(await screen.findByRole('dialog', { name: /unapplied grid changes/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /discard and leave/i }));

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search people/i })).toBeInTheDocument();
    expect(onApplyGridPeople).not.toHaveBeenCalled();
  });
});
