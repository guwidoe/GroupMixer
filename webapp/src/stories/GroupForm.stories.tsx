import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import GroupForm from '../components/ProblemEditor/forms/GroupForm';
import type { GroupFormData } from '../types';

/**
 * GroupForm is a modal form for adding or editing a group.
 * Groups have an ID and a capacity (max people per session).
 */
const meta: Meta<typeof GroupForm> = {
  title: 'Forms/GroupForm',
  component: GroupForm,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GroupForm>;

const emptyFormData: GroupFormData = {
  id: '',
  size: 4,
};

export const AddNewGroup: Story = {
  args: {
    isEditing: false,
    editingGroup: null,
    groupForm: emptyFormData,
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const EditExistingGroup: Story = {
  args: {
    isEditing: true,
    editingGroup: {
      id: 'team-alpha',
      size: 6,
    },
    groupForm: {
      id: 'team-alpha',
      size: 6,
    },
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const FilledForm: Story = {
  args: {
    isEditing: false,
    editingGroup: null,
    groupForm: {
      id: 'workshop-room-1',
      size: 8,
    },
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const SmallGroup: Story = {
  args: {
    isEditing: false,
    editingGroup: null,
    groupForm: {
      id: 'pair-programming',
      size: 2,
    },
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const LargeGroup: Story = {
  args: {
    isEditing: false,
    editingGroup: null,
    groupForm: {
      id: 'plenary-session',
      size: 20,
    },
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const InvalidSize: Story = {
  args: {
    isEditing: false,
    editingGroup: null,
    groupForm: {
      id: 'invalid-group',
      size: 0,
    },
    setGroupForm: fn(),
    groupFormInputs: { size: '0' },
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows validation error styling when size is invalid.',
      },
    },
  },
};

export const EditGroupIdDisabled: Story = {
  args: {
    isEditing: true,
    editingGroup: {
      id: 'cannot-change-id',
      size: 5,
    },
    groupForm: {
      id: 'cannot-change-id',
      size: 5,
    },
    setGroupForm: fn(),
    groupFormInputs: {},
    setGroupFormInputs: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'When editing, the group ID field is disabled.',
      },
    },
  },
};
