import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import PersonForm from '../components/ScenarioEditor/forms/PersonForm';
import { createAttributeDefinition } from '../services/scenarioAttributes';
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
  createAttributeDefinition('gender', ['male', 'female', 'non-binary'], 'attr-gender'),
  createAttributeDefinition('department', ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'], 'attr-department'),
  createAttributeDefinition('experience', ['junior', 'mid', 'senior'], 'attr-experience'),
];

const emptyFormData: PersonFormData = {
  name: '',
  attributes: {},
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
      name: 'Alice Johnson',
      attributes: { gender: 'female', department: 'Engineering' },
      sessions: [0, 1, 2],
    },
    personForm: {
      id: 'alice-001',
      name: 'Alice Johnson',
      attributes: { gender: 'female', department: 'Engineering' },
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
        gender: 'male', 
        department: 'Marketing',
        experience: 'senior'
      },
      name: 'Bob Smith',
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
    personForm: { name: '', attributes: {}, sessions: [] },
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
    personForm: { name: '', attributes: {}, sessions: [] },
    setPersonForm: fn(),
    attributeDefinitions: [
      createAttributeDefinition('gender', ['male', 'female', 'non-binary'], 'attr-gender'),
      createAttributeDefinition('department', ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Legal', 'Operations'], 'attr-department'),
      createAttributeDefinition('experience', ['intern', 'junior', 'mid', 'senior', 'staff', 'principal'], 'attr-experience'),
      createAttributeDefinition('location', ['New York', 'San Francisco', 'London', 'Berlin', 'Tokyo', 'Remote'], 'attr-location'),
      createAttributeDefinition('team', ['Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta'], 'attr-team'),
      createAttributeDefinition('role', ['Individual Contributor', 'Tech Lead', 'Manager', 'Director'], 'attr-role'),
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
    personForm: { name: '', attributes: {}, sessions: [0, 3, 5, 7, 9] },
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
      name: 'Late Joiner',
      attributes: {},
      sessions: [3, 4],
    },
    personForm: {
      id: 'late-joiner',
      name: 'Late Joiner',
      attributes: {},
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
