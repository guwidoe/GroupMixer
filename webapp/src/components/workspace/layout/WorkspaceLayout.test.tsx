import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar, FlaskConical, Play } from 'lucide-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLayout } from './WorkspaceLayout';
import type { WorkspaceNavGroup } from './types';

const groupedItems: WorkspaceNavGroup[] = [
  {
    id: 'run',
    label: 'Run',
    description: 'Primary workflows.',
    items: [
      {
        id: 'run-solver',
        label: 'Run Solver',
        icon: Play,
      },
    ],
  },
  {
    id: 'manual',
    label: 'Manual Tuning',
    description: 'Advanced solver control.',
    items: [
      {
        id: 'solver1',
        label: 'Solver 1',
        icon: Calendar,
        count: 2,
      },
      {
        id: 'solver3',
        label: 'Solver 3',
        icon: FlaskConical,
        badge: { label: 'Experimental', tone: 'accent' },
      },
    ],
  },
];

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders generic grouped workspace navigation and supports badges/counts', () => {
    render(
      <WorkspaceLayout workspaceLabel="Solver" groupedItems={groupedItems} activeItemId="solver3" onNavigate={vi.fn()}>
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    const sidebar = screen.getByLabelText('Solver navigation');
    expect(within(sidebar).getByText('Run')).toBeInTheDocument();
    expect(within(sidebar).getByText('Manual Tuning')).toBeInTheDocument();
    expect(within(sidebar).getByText('Experimental')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^solver 1$/i })).getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^solver 3$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses the sidebar into a rail while preserving collapsed count badges', async () => {
    const user = userEvent.setup();

    render(
      <WorkspaceLayout
        workspaceLabel="Solver"
        groupedItems={groupedItems}
        activeItemId="run-solver"
        onNavigate={vi.fn()}
        collapsedSidebarHeader={<button type="button">L</button>}
      >
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    const sidebar = screen.getByLabelText('Solver navigation');
    await user.click(screen.getByRole('button', { name: /collapse solver sidebar/i }));

    const solver1Button = within(sidebar).getByRole('button', { name: /^solver 1$/i });
    expect(within(solver1Button).getByText('2')).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: 'L' })).toBeInTheDocument();
  });

  it('persists collapsed sidebar state across remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <WorkspaceLayout
        workspaceLabel="Solver"
        groupedItems={groupedItems}
        activeItemId="run-solver"
        onNavigate={vi.fn()}
        collapsedSidebarHeader={<button type="button">L</button>}
      >
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    await user.click(screen.getByRole('button', { name: /collapse solver sidebar/i }));
    unmount();

    render(
      <WorkspaceLayout
        workspaceLabel="Solver"
        groupedItems={groupedItems}
        activeItemId="run-solver"
        onNavigate={vi.fn()}
        collapsedSidebarHeader={<button type="button">L</button>}
      >
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    expect(screen.getByRole('button', { name: /expand solver sidebar/i })).toBeInTheDocument();
  });

  it('persists group expansion state across remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <WorkspaceLayout workspaceLabel="Solver" groupedItems={groupedItems} activeItemId="solver1" onNavigate={vi.fn()}>
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    await user.click(screen.getByRole('button', { name: /manual tuning/i }));
    expect(screen.queryByRole('button', { name: /^solver 1$/i })).not.toBeInTheDocument();
    unmount();

    render(
      <WorkspaceLayout workspaceLabel="Solver" groupedItems={groupedItems} activeItemId="solver1" onNavigate={vi.fn()}>
        <div>Workspace content</div>
      </WorkspaceLayout>,
    );

    expect(screen.queryByRole('button', { name: /^solver 1$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manual tuning/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
