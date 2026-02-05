import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import PersonForm from '../components/ProblemEditor/forms/PersonForm';
import type { AttributeDefinition, PersonFormData } from '../types';

/**
 * PersonForm is a modal form for adding or editing a person.
 * Includes name input, attribute selection, and session participation.
 */
const meta: Meta<typeof PersonForm> = {
  title: 'Forms/PersonForm',
  component: PersonForm,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PersonForm>;

const sampleAttributes: AttributeDefinition[] = [
  { key: 'gender', values: ['male', 'female', 'non-binary'] },
  { key: 'department', values: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'] },
  { key: 'experience', values: ['junior', 'mid', 'senior'] },
];

const emptyFormData: PersonFormData = {
  attributes: { name: '' },
  sessions: [],
};

export const AddNewPerson: Story = {
  args: {
    isEditing: false,
    editingPerson: null,
    personForm: emptyFormData,
    setPersonForm: fn(),
    attributeDefinitions: sampleAttributes,
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
};

export const EditExistingPerson: Story = {
  args: {
    isEditing: true,
    editingPerson: {
      id: 'alice-001',
      attributes: { name: 'Alice Johnson', gender: 'female', department: 'Engineering' },
      sessions: [0, 1, 2],
    },
    personForm: {
      id: 'alice-001',
      attributes: { name: 'Alice Johnson', gender: 'female', department: 'Engineering' },
      sessions: [0, 1, 2],
    },
    setPersonForm: fn(),
    attributeDefinitions: sampleAttributes,
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
};

export const FilledForm: Story = {
  args: {
    isEditing: false,
    editingPerson: null,
    personForm: {
      attributes: { 
        name: 'Bob Smith', 
        gender: 'male', 
        department: 'Marketing',
        experience: 'senior'
      },
      sessions: [],
    },
    setPersonForm: fn(),
    attributeDefinitions: sampleAttributes,
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
};

export const NoAttributesDefined: Story = {
  args: {
    isEditing: false,
    editingPerson: null,
    personForm: { attributes: { name: '' }, sessions: [] },
    setPersonForm: fn(),
    attributeDefinitions: [],
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'When no attributes are defined, only name input and sessions are shown.',
      },
    },
  },
};

export const ManyAttributes: Story = {
  args: {
    isEditing: false,
    editingPerson: null,
    personForm: { attributes: { name: '' }, sessions: [] },
    setPersonForm: fn(),
    attributeDefinitions: [
      { key: 'gender', values: ['male', 'female', 'non-binary'] },
      { key: 'department', values: ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal', 'Operations'] },
      { key: 'experience', values: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'] },
      { key: 'location', values: ['New York', 'San Francisco', 'London', 'Berlin', 'Tokyo', 'Remote'] },
      { key: 'team', values: ['Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta'] },
      { key: 'role', values: ['Individual Contributor', 'Tech Lead', 'Manager', 'Director'] },
    ],
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
};

export const ManySessions: Story = {
  args: {
    isEditing: false,
    editingPerson: null,
    personForm: { attributes: { name: '' }, sessions: [0, 3, 5, 7, 9] },
    setPersonForm: fn(),
    attributeDefinitions: sampleAttributes,
    sessionsCount: 12,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Form with many sessions to check layout with multiple checkboxes.',
      },
    },
  },
};

export const LateJoiner: Story = {
  args: {
    isEditing: true,
    editingPerson: {
      id: 'late-joiner',
      attributes: { name: 'Late Joiner' },
      sessions: [3, 4],
    },
    personForm: {
      id: 'late-joiner',
      attributes: { name: 'Late Joiner' },
      sessions: [3, 4],
    },
    setPersonForm: fn(),
    attributeDefinitions: sampleAttributes,
    sessionsCount: 5,
    onSave: fn(),
    onUpdate: fn(),
    onCancel: fn(),
    onShowAttributeForm: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Editing a person who only participates in later sessions.',
      },
    },
  },
};
