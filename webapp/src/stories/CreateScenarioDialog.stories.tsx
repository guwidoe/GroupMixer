import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CreateScenarioDialog } from '../components/ScenarioManager/CreateScenarioDialog';

/**
 * CreateScenarioDialog is a modal for creating a new scenario or duplicating an existing one.
 * Allows setting the scenario name and marking it as a template.
 */
const meta: Meta<typeof CreateScenarioDialog> = {
  title: 'Dialogs/CreateScenarioDialog',
  component: CreateScenarioDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CreateScenarioDialog>;

export const CreateEmpty: Story = {
  args: {
    open: true,
    mode: 'empty',
    newScenarioName: '',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: false,
    setNewScenarioIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const Duplicate: Story = {
  args: {
    open: true,
    mode: 'duplicate',
    newScenarioName: 'Team Retreat 2024 - Copy',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: false,
    setNewScenarioIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const WithNameEntered: Story = {
  args: {
    open: true,
    mode: 'empty',
    newScenarioName: 'Company Workshop Planning',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: false,
    setNewScenarioIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const AsTemplate: Story = {
  args: {
    open: true,
    mode: 'empty',
    newScenarioName: 'Standard 50-Person Setup',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: true,
    setNewScenarioIsTemplate: fn(),
    onCreate: fn(),
    onCancel: fn(),
  },
};

export const EmptyNameDisabled: Story = {
  args: {
    open: true,
    mode: 'empty',
    newScenarioName: '',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: false,
    setNewScenarioIsTemplate: fn(),
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
    newScenarioName: '',
    setNewScenarioName: fn(),
    newScenarioIsTemplate: false,
    setNewScenarioIsTemplate: fn(),
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
