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
    <button onClick={() => onDemoCaseClick('demo-1', 'Demo One')}>Demo Data</button>
  ),
}));

describe('Header', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    vi.clearAllMocks();
  });

  it('shows load/save/demo actions on setup routes instead of the scenario manager button', async () => {
    const user = userEvent.setup();
    const setShowScenarioManager = vi.fn();
    const saveScenario = vi.fn();
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
      loadDemoCase: vi.fn(),
      loadDemoCaseOverwrite,
      loadDemoCaseNewScenario: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/app/scenario/people']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /load/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /save/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /demo data/i })[0]).toBeInTheDocument();
    expect(screen.queryByText(/manage scenarios/i)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /load/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /demo data/i })[0]);
    await user.click(screen.getByRole('button', { name: /overwrite/i }));

    expect(setShowScenarioManager).toHaveBeenCalledTimes(1);
    expect(saveScenario).toHaveBeenCalledWith('Workshop Plan');
    expect(loadDemoCaseOverwrite).toHaveBeenCalledWith('demo-1');
  });

  it('keeps the existing non-setup header actions outside setup routes', () => {
    useAppStore.setState({
      currentScenarioId: null,
      savedScenarios: {},
      setShowScenarioManager: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/app/solver']}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/manage scenarios/i)[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^load$/i })).not.toBeInTheDocument();
  });
});
