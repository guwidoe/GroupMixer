import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioManager } from './ScenarioManager';
import { useAppStore } from '../store';
import { createSampleScenario, createSavedScenario } from '../test/fixtures';

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({
    scenario: createSampleScenario(),
    currentScenarioId: 'scenario-1',
    savedScenarios: {
      'scenario-1': createSavedScenario({ id: 'scenario-1', name: 'Workshop Plan' }),
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
});
