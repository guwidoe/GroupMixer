import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ManualEditorTopBar } from './ManualEditorTopBar';

describe('ManualEditorTopBar', () => {
  it('exposes a back button to the results page', async () => {
    const user = userEvent.setup();
    const onBackToResults = vi.fn();

    render(
      <ManualEditorTopBar
        mode="warn"
        onBackToResults={onBackToResults}
        onModeChange={vi.fn()}
        onPullNewPeople={vi.fn()}
        onPullNewConstraints={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /back to results/i }));

    expect(onBackToResults).toHaveBeenCalledTimes(1);
  });
});
