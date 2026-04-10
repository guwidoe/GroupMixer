import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionScopeField } from './SessionScopeField';

describe('SessionScopeField', () => {
  it('keeps compact mode concise and moves explanations behind tooltip triggers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SessionScopeField
        compact
        totalSessions={6}
        value={{ mode: 'selected', sessions: [0, 1, 2, 3, 4, 5] }}
        onChange={onChange}
      />,
    );

    expect(screen.queryByText(/automatically includes future sessions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/freezes the current selection even if more sessions are added later/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/applies only to the explicitly selected current sessions/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/why choose all sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/why choose only selected sessions/i)).toBeInTheDocument();

    await user.hover(screen.getByLabelText(/why choose only selected sessions/i));
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(/freezes the current selection/i);
  });
});
