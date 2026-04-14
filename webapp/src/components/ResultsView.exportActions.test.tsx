import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsView } from './ResultsView';
import { useAppStore } from '../store';
import { createSampleScenario, createSampleSolution, createSavedScenario } from '../test/fixtures';

vi.mock('../hooks', async () => {
  const React = await import('react');
  return {
    useLocalStorageState: (_key: string, initialValue: string) => React.useState(initialValue),
    useOutsideClick: () => {},
  };
});

vi.mock('./ConstraintComplianceCards', () => ({
  default: () => <div>compliance</div>,
}));

vi.mock('./ResultsView/ResultsSchedule', () => ({
  ResultsSchedule: () => <div>schedule</div>,
}));

describe('ResultsView export quick actions', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedStore() {
    const scenario = createSampleScenario();
    const solution = createSampleSolution();
    const savedScenario = createSavedScenario({
      name: 'Workshop',
      scenario,
    });

    savedScenario.results = [
      {
        ...savedScenario.results[0],
        name: 'Snapshot Result',
        solution,
      },
    ];

    useAppStore.setState({
      scenario,
      solution,
      solverState: useAppStore.getState().solverState,
      currentScenarioId: savedScenario.id,
      currentResultId: savedScenario.results[0].id,
      savedScenarios: { [savedScenario.id]: savedScenario },
    });
  }

  it('copies schedule data and prints the current result', async () => {
    seedStore();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const printMock = vi.fn();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: printMock,
    });

    render(<ResultsView />);

    await user.click(screen.getByRole('button', { name: /share & export/i }));
    await user.click(screen.getByRole('button', { name: /copy schedule table/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(writeText.mock.calls[0][0]).toContain('Person ID\tGroup ID\tSession\tPerson Name');
    expect(useAppStore.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'success',
      title: 'Copied to clipboard',
    });

    await user.click(screen.getByRole('button', { name: /share & export/i }));
    await user.click(screen.getByRole('button', { name: /print current result/i }));

    expect(printMock).toHaveBeenCalledTimes(1);
  });

  it('reports an error when clipboard access is unavailable', async () => {
    seedStore();
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(<ResultsView />);

    await user.click(screen.getByRole('button', { name: /share & export/i }));
    await user.click(screen.getByRole('button', { name: /copy schedule table/i }));

    expect(useAppStore.getState().ui.notifications.at(-1)).toMatchObject({
      type: 'error',
      title: 'Clipboard unavailable',
    });
  });
});
