/* eslint-disable react/no-multi-comp */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useAppStore } from '../store';
import { createSampleScenario, createSavedScenario } from '../test/fixtures';

vi.mock('./AppHeader', () => ({
  AppHeader: ({ renderDesktopActions, renderMobileActions }: {
    renderDesktopActions?: () => React.ReactNode;
    renderMobileActions?: (helpers: { closeMobileMenu: () => void }) => React.ReactNode;
  }) => (
    <div>
      <div data-testid="desktop-actions">{renderDesktopActions?.()}</div>
      <div data-testid="mobile-actions">{renderMobileActions?.({ closeMobileMenu: vi.fn() })}</div>
    </div>
  ),
}));

vi.mock('./ScenarioEditor/DemoDataDropdown', () => ({
  DemoDataDropdown: ({ onDemoCaseClick }: { onDemoCaseClick: (id: string, name: string) => void }) => (
    <div>
      <button onClick={() => onDemoCaseClick('demo-1', 'Demo One')}>Demo Data</button>
      <button onClick={() => onDemoCaseClick('generated-random-workshop', 'Generate random workshop scenario')}>Random Demo</button>
    </div>
  ),
}));

describe('Header', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    vi.clearAllMocks();
  });

  it('shows load/save/demo actions across app routes', async () => {
    const user = userEvent.setup();
    const setShowScenarioManager = vi.fn();
    const saveScenario = vi.fn();
    const setAdvancedModeEnabled = vi.fn();
    const setShowWorkflowGuideButton = vi.fn();
    const loadDemoCaseOverwrite = vi.fn();

    const savedScenario = createSavedScenario({
      id: 'scenario-1',
      name: 'Workshop Plan',
      scenario: createSampleScenario(),
    });

    useAppStore.setState({
      scenario: savedScenario.scenario,
      currentScenarioId: savedScenario.id,
      savedScenarios: { [savedScenario.id]: savedScenario },
      setShowScenarioManager,
      saveScenario,
      setAdvancedModeEnabled,
      setShowWorkflowGuideButton,
      loadDemoCase: vi.fn(),
      loadDemoCaseOverwrite,
      loadDemoCaseNewScenario: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/app/solver']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /load/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /save/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /demo data/i })[0]).toBeInTheDocument();
    expect(screen.queryByText(/manage scenarios/i)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /load/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);
    await user.click(screen.getAllByRole('switch', { name: /enable advanced mode/i })[0]);
    await user.click(screen.getAllByRole('switch', { name: /show workflow guide button/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /demo data/i })[0]);
    await user.click(screen.getByRole('button', { name: /overwrite/i }));

    expect(setShowScenarioManager).toHaveBeenCalledTimes(1);
    expect(saveScenario).toHaveBeenCalledWith('Workshop Plan');
    expect(setAdvancedModeEnabled).toHaveBeenCalledWith(true);
    expect(setShowWorkflowGuideButton).toHaveBeenCalledWith(false);
    expect(loadDemoCaseOverwrite).toHaveBeenCalledWith('demo-1');
  });

  it('shows the unified workspace actions even without a saved current scenario', () => {
    useAppStore.setState({
      scenario: createSampleScenario(),
      currentScenarioId: null,
      savedScenarios: {},
      setShowScenarioManager: vi.fn(),
      saveScenario: vi.fn(),
      loadDemoCase: vi.fn(),
      loadDemoCaseOverwrite: vi.fn(),
      loadDemoCaseNewScenario: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/app/solver']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /^load$/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^save$/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /demo data/i })[0]).toBeInTheDocument();
  });

  it('can generate a random demo scenario from the demo data menu', async () => {
    const user = userEvent.setup();
    const loadGeneratedDemoScenarioOverwrite = vi.fn();

    useAppStore.setState({
      scenario: createSampleScenario(),
      currentScenarioId: null,
      savedScenarios: {},
      setShowScenarioManager: vi.fn(),
      saveScenario: vi.fn(),
      loadDemoCase: vi.fn(),
      loadDemoCaseOverwrite: vi.fn(),
      loadDemoCaseNewScenario: vi.fn(),
      loadGeneratedDemoScenario: vi.fn(),
      loadGeneratedDemoScenarioOverwrite,
      loadGeneratedDemoScenarioNewScenario: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/app/solver']}>
        <Header />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /random demo/i }));
    await user.clear(screen.getByRole('textbox', { name: /groups \(g\)/i }));
    await user.type(screen.getByRole('textbox', { name: /groups \(g\)/i }), '5');
    await user.clear(screen.getByRole('textbox', { name: /people per group \(p\)/i }));
    await user.type(screen.getByRole('textbox', { name: /people per group \(p\)/i }), '3');
    await user.clear(screen.getByRole('textbox', { name: /sessions \(w\)/i }));
    await user.type(screen.getByRole('textbox', { name: /sessions \(w\)/i }), '4');
    await user.click(screen.getByRole('button', { name: /generate scenario/i }));
    await user.click(screen.getByRole('button', { name: /overwrite/i }));

    expect(loadGeneratedDemoScenarioOverwrite).toHaveBeenCalledTimes(1);
    expect(loadGeneratedDemoScenarioOverwrite).toHaveBeenCalledWith(
      expect.objectContaining({
        num_sessions: 4,
        constraints: [
          expect.objectContaining({
            type: 'RepeatEncounter',
            penalty_function: 'squared',
            penalty_weight: 10,
          }),
        ],
        groups: expect.arrayContaining([expect.objectContaining({ size: 3 })]),
      }),
      'Random Demo (5 groups × 3 people, 4 sessions)',
    );
  });
});
