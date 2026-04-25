import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioManager } from './ScenarioManager';
import { useAppStore } from '../store';
import { createSampleScenario, createSavedScenario } from '../test/fixtures';

beforeEach(() => {
  vi.restoreAllMocks();
  useAppStore.getState().reset();
  useAppStore.setState({
    scenario: createSampleScenario(),
    currentScenarioId: 'scenario-1',
    savedScenarios: {
      'scenario-1': createSavedScenario({ id: 'scenario-1', name: 'Workshop Plan' }),
      'scenario-2': createSavedScenario({ id: 'scenario-2', name: 'Template Plan', isTemplate: true }),
    },
    loadSavedScenarios: vi.fn(),
  });
});

describe('ScenarioManager', () => {
  it('opens the new-scenario menu and renders the create dialog without crashing', async () => {
    const user = userEvent.setup();

    render(<ScenarioManager isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /new scenario/i }));
    await user.click(screen.getByRole('button', { name: /blank scenario/i }));

    expect(screen.getByRole('heading', { name: /create new scenario/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter scenario name/i)).toBeInTheDocument();
  }, 10000);

  it('selects all and filtered scenarios for bulk actions', async () => {
    const user = userEvent.setup();

    render(<ScenarioManager isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(screen.getByLabelText(/select workshop plan/i)).toBeChecked();
    expect(screen.getByLabelText(/select template plan/i)).toBeChecked();
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));
    await user.type(screen.getByPlaceholderText(/search scenarios/i), 'Workshop');
    await user.click(screen.getByRole('button', { name: /select filtered/i }));

    expect(screen.getByLabelText(/select workshop plan/i)).toBeChecked();
    expect(screen.queryByLabelText(/select template plan/i)).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  }, 10000);

  it('confirms bulk deletion for selected scenarios', async () => {
    const user = userEvent.setup();
    const deleteScenario = vi.fn();
    useAppStore.setState({ deleteScenario });

    render(<ScenarioManager isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /delete selected/i }));

    expect(screen.getByRole('heading', { name: /delete selected scenarios/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete 2/i }));

    expect(deleteScenario).toHaveBeenCalledWith('scenario-1');
    expect(deleteScenario).toHaveBeenCalledWith('scenario-2');
  }, 10000);

  it('exports selected scenarios as one bundle', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:scenario-bundle');
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    render(<ScenarioManager isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /select all/i }));
    await user.click(screen.getByRole('button', { name: /export selected/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scenario-bundle');
  }, 10000);
});
