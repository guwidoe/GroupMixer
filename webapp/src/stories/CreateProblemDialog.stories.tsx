import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CreateProblemDialog } from '../components/ProblemManager/CreateProblemDialog';

/**
 * CreateProblemDialog is a modal for creating a new problem or duplicating an existing one.
 * Allows setting the problem name and marking it as a template.
 */
const meta: Meta<typeof CreateProblemDialog> = {
  title: 'Dialogs/CreateProblemDialog',
  component: CreateProblemDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CreateProblemDialog>;

export const CreateEmpty: Story = {
  args: {
    open: true,
    mode: 'empty',
    newProblemName: '',
    setNewProblemName: fn(),
    newProblemIsTemplate: false,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const Duplicate: Story = {
  args: {
    open: true,
    mode: 'duplicate',
    newProblemName: 'Team Retreat 2024 - Copy',
    setNewProblemName: fn(),
    newProblemIsTemplate: false,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const WithNameEntered: Story = {
  args: {
    open: true,
    mode: 'empty',
    newProblemName: 'Company Workshop Planning',
    setNewProblemName: fn(),
    newProblemIsTemplate: false,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const AsTemplate: Story = {
  args: {
    open: true,
    mode: 'empty',
    newProblemName: 'Standard 50-Person Setup',
    setNewProblemName: fn(),
    newProblemIsTemplate: true,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const EmptyNameDisabled: Story = {
  args: {
    open: true,
    mode: 'empty',
    newProblemName: '',
    setNewProblemName: fn(),
    newProblemIsTemplate: false,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Create button is disabled when name is empty.',
      },
    },
  },
};

export const Closed: Story = {
  args: {
    open: false,
    mode: 'empty',
    newProblemName: '',
    setNewProblemName: fn(),
    newProblemIsTemplate: false,
    setNewProblemIsTemplate: fn(),
    onCreate: fn(),
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
