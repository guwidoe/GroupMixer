import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SetupCollectionPage } from './SetupCollectionPage';

describe('SetupCollectionPage', () => {
  it('switches between cards and list modes through the shared toolbar', async () => {
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
});
