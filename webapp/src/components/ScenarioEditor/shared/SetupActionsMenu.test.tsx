import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetupActionsMenu } from './SetupActionsMenu';

describe('SetupActionsMenu', () => {
  it('renders the menu in a viewport layer instead of inside the trigger container', async () => {
    const user = userEvent.setup();

    render(
      <div data-testid="menu-shell">
        <SetupActionsMenu
          label="Import & Bulk"
          items={[
            { label: 'Upload CSV', onSelect: vi.fn() },
            { label: 'Upload Excel', onSelect: vi.fn() },
          ]}
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /import & bulk/i }));

    const item = screen.getByRole('button', { name: /upload csv/i });
    expect(document.body).toContainElement(item);
    expect(screen.getByTestId('menu-shell')).not.toContainElement(item);
  });
});
