import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AutoConfigPanel } from './AutoConfigPanel';

describe('AutoConfigPanel', () => {
  it('shows a capability note instead of Auto-set when recommendations are unsupported', () => {
    render(
      <AutoConfigPanel
        solverFormInputs={{}}
        setSolverFormInputs={vi.fn()}
        desiredRuntimeSettings={3}
        setDesiredRuntimeSettings={vi.fn()}
        onAutoSetSettings={vi.fn()}
        isRunning={false}
        solverCatalogStatus="ready"
        solverCatalogErrorMessage={null}
        supportsRecommendedSettings={false}
        solverDisplayName="Solver 3"
      />,
    );

    expect(screen.getByText('Automatic Settings Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auto-set' })).not.toBeInTheDocument();
  });

  it('renders Auto-set when recommendations are supported', async () => {
    const onAutoSetSettings = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <AutoConfigPanel
        solverFormInputs={{}}
        setSolverFormInputs={vi.fn()}
        desiredRuntimeSettings={3}
        setDesiredRuntimeSettings={vi.fn()}
        onAutoSetSettings={onAutoSetSettings}
        isRunning={false}
        solverCatalogStatus="ready"
        solverCatalogErrorMessage={null}
        supportsRecommendedSettings
        solverDisplayName="Solver 1"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Auto-set' }));
    expect(onAutoSetSettings).toHaveBeenCalledTimes(1);
  });
});
