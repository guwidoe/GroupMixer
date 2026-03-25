import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProblemManager } from './ProblemManager';
import { useAppStore } from '../store';
import { createSampleProblem, createSavedProblem } from '../test/fixtures';

beforeEach(() => {
  useAppStore.getState().reset();
  useAppStore.setState({
    problem: createSampleProblem(),
    currentProblemId: 'problem-1',
    savedProblems: {
      'problem-1': createSavedProblem({ id: 'problem-1', name: 'Workshop Plan' }),
    },
    loadSavedProblems: vi.fn(),
  });
});

describe('ProblemManager', () => {
  it('opens the new-problem menu and renders the create dialog without crashing', async () => {
    const user = userEvent.setup();

    render(<ProblemManager isOpen onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /new problem/i }));
    await user.click(screen.getByRole('button', { name: /blank problem/i }));

    expect(screen.getByRole('heading', { name: /create new problem/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter problem name/i)).toBeInTheDocument();
  }, 10000);
});
