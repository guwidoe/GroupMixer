import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store';
import { WorkflowGuideButton } from './WorkflowGuideButton';

describe('WorkflowGuideButton', () => {
  beforeEach(() => {
    useAppStore.getState().reset();
    useAppStore.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        showWorkflowGuideButton: true,
        advancedModeEnabled: true,
      },
    }));
  });

  it('renders by default when a workflow action exists', () => {
    render(
      <MemoryRouter initialEntries={['/app/scenario/sessions']}>
        <WorkflowGuideButton />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /next: groups/i })).toBeInTheDocument();
  });

  it('hides the button when the preference is disabled', () => {
    useAppStore.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        showWorkflowGuideButton: false,
      },
    }));

    render(
      <MemoryRouter initialEntries={['/app/scenario/sessions']}>
        <WorkflowGuideButton />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /next: groups/i })).not.toBeInTheDocument();
  });
});
