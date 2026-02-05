import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import AttributeForm from '../components/ProblemEditor/forms/AttributeForm';

/**
 * AttributeForm is a modal form for defining attribute types with their possible values.
 * Attributes are used to categorize people (e.g., gender, department, experience level).
 */
const meta: Meta<typeof AttributeForm> = {
  title: 'Forms/AttributeForm',
  component: AttributeForm,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof AttributeForm>;

export const AddNewAttribute: Story = {
  args: {
    isEditing: false,
    newAttribute: { key: '', values: [''] },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const EditExistingAttribute: Story = {
  args: {
    isEditing: true,
    newAttribute: { 
      key: 'department', 
      values: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const FilledGenderAttribute: Story = {
  args: {
    isEditing: false,
    newAttribute: { 
      key: 'gender', 
      values: ['male', 'female', 'non-binary', 'prefer not to say'] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const TwoValuesMinimum: Story = {
  args: {
    isEditing: false,
    newAttribute: { 
      key: 'team-lead', 
      values: ['yes', 'no'] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Simple boolean-like attribute with just two values.',
      },
    },
  },
};

export const ManyValues: Story = {
  args: {
    isEditing: false,
    newAttribute: { 
      key: 'location', 
      values: [
        'New York', 
        'San Francisco', 
        'Los Angeles', 
        'Chicago', 
        'Boston', 
        'Seattle', 
        'Denver', 
        'Austin', 
        'Miami', 
        'London', 
        'Berlin', 
        'Paris', 
        'Tokyo', 
        'Singapore', 
        'Sydney',
        'Remote'
      ] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Attribute with many possible values - shows scrollable container.',
      },
    },
  },
};

export const ExperienceLevels: Story = {
  args: {
    isEditing: false,
    newAttribute: { 
      key: 'experience', 
      values: ['intern', 'junior', 'mid-level', 'senior', 'staff', 'principal', 'distinguished'] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
};

export const SingleValue: Story = {
  args: {
    isEditing: false,
    newAttribute: { 
      key: 'vip', 
      values: ['yes'] 
    },
    setNewAttribute: fn(),
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Attribute with single value - remove button is hidden since at least one value is required.',
      },
    },
  },
};
