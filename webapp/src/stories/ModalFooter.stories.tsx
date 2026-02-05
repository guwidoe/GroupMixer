import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ModalFooter from '../components/ui/ModalFooter';

/**
 * ModalFooter provides consistent action buttons for modal dialogs.
 * Supports customizable labels, disabled states, and danger styling.
 */
const meta: Meta<typeof ModalFooter> = {
  title: 'UI/ModalFooter',
  component: ModalFooter,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    cancelLabel: {
      control: 'text',
      description: 'Label for the cancel button',
    },
    saveLabel: {
      control: 'text',
      description: 'Label for the save/submit button',
    },
    saveDisabled: {
      control: 'boolean',
      description: 'Whether the save button is disabled',
    },
    saveDanger: {
      control: 'boolean',
      description: 'Use danger styling for the save button',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ModalFooter>;

export const Default: Story = {
  args: {
    onCancel: fn(),
    onSave: fn(),
  },
};

export const CustomLabels: Story = {
  args: {
    onCancel: fn(),
    onSave: fn(),
    cancelLabel: 'Go Back',
    saveLabel: 'Create Person',
  },
};

export const SaveDisabled: Story = {
  args: {
    onCancel: fn(),
    onSave: fn(),
    saveLabel: 'Submit',
    saveDisabled: true,
  },
};

export const DangerAction: Story = {
  args: {
    onCancel: fn(),
    onSave: fn(),
    cancelLabel: 'Keep',
    saveLabel: 'Delete Permanently',
    saveDanger: true,
  },
};

export const ConfirmDialog: Story = {
  args: {
    onCancel: fn(),
    onSave: fn(),
    cancelLabel: 'No',
    saveLabel: 'Yes, Continue',
  },
};
