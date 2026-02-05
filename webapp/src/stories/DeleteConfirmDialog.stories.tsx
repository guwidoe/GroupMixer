import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DeleteConfirmDialog } from '../components/ProblemManager/DeleteConfirmDialog';

/**
 * DeleteConfirmDialog is a confirmation modal for deleting a problem.
 * Shows a warning message and requires explicit confirmation.
 */
const meta: Meta<typeof DeleteConfirmDialog> = {
  title: 'Dialogs/DeleteConfirmDialog',
  component: DeleteConfirmDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DeleteConfirmDialog>;

export const Open: Story = {
  args: {
    open: true,
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onConfirm: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'When closed, the dialog renders nothing.',
      },
    },
  },
};
