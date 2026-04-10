import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetupCollectionPage } from './SetupCollectionPage';

describe('SetupCollectionPage', () => {
  it('switches between cards and list modes through the shared header toggle', async () => {
    const user = userEvent.setup();

    render(
      <SetupCollectionPage
        sectionKey="test-shell"
        title="Test Section"
        count={3}
        hasItems
        emptyState={{ title: 'Empty', message: 'Nothing here yet.' }}
        renderContent={(viewMode) => <div>{viewMode === 'cards' ? 'Card content' : 'List content'}</div>}
      />,
    );

    expect(screen.getByText('Card content')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /list/i }));

    expect(screen.getByText('List content')).toBeInTheDocument();
  });

  it('renders a shared empty state when the collection has no items', () => {
    render(
      <SetupCollectionPage
        sectionKey="empty-shell"
        title="Empty Section"
        count={0}
        hasItems={false}
        emptyState={{ title: 'No items yet', message: 'Add one to get started.' }}
        renderContent={() => <div>Should not render</div>}
      />,
    );

    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
  });

  it('folds the view toggle into header actions when there is no dedicated toolbar content', () => {
    render(
      <SetupCollectionPage
        sectionKey="compact-shell"
        title="Compact Section"
        count={2}
        actions={<button type="button">Add item</button>}
        hasItems
        emptyState={{ title: 'Empty', message: 'Nothing here yet.' }}
        renderContent={() => <div>List content</div>}
        defaultViewMode="list"
      />,
    );

    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
    expect(screen.queryByTestId('setup-section-toolbar')).not.toBeInTheDocument();
  });

  it('keeps the dedicated toolbar row for extra content while the view toggle stays in the header', () => {
    render(
      <SetupCollectionPage
        sectionKey="toolbar-shell"
        title="Toolbar Section"
        count={2}
        actions={<button type="button">Add item</button>}
        hasItems
        emptyState={{ title: 'Empty', message: 'Nothing here yet.' }}
        toolbarLeading={<div>Toolbar search</div>}
        renderContent={() => <div>Card content</div>}
        defaultViewMode="cards"
      />,
    );

    expect(screen.getByTestId('setup-section-toolbar')).toBeInTheDocument();
    expect(screen.getByText('Toolbar search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
  });

  it('does not loop when onViewModeChange gets a fresh callback identity on rerender', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    function Harness() {
      const [tick, setTick] = React.useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick((current) => current + 1)}>
            Rerender {tick}
          </button>
          <SetupCollectionPage
            sectionKey="callback-loop-shell"
            title="Callback Loop Section"
            count={2}
            hasItems
            emptyState={{ title: 'Empty', message: 'Nothing here yet.' }}
            onViewModeChange={(viewMode) => onViewModeChange(viewMode)}
            renderContent={() => <div>Card content</div>}
          />
        </>
      );
    }

    render(<Harness />);

    expect(onViewModeChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /rerender/i }));

    expect(onViewModeChange).toHaveBeenCalledTimes(1);
  });
});
