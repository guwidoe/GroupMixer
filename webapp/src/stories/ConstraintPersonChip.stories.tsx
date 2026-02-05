import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ConstraintPersonChip from '../components/ConstraintPersonChip';
import type { Person } from '../types';

/**
 * ConstraintPersonChip renders a person's name in a constraint context.
 * Shows warning styling when the referenced person no longer exists in the problem.
 */
const meta: Meta<typeof ConstraintPersonChip> = {
  title: 'Components/ConstraintPersonChip',
  component: ConstraintPersonChip,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConstraintPersonChip>;

const samplePeople: Person[] = [
  { id: 'alice-001', attributes: { name: 'Alice Johnson' } },
  { id: 'bob-002', attributes: { name: 'Bob Smith' } },
  { id: 'charlie-003', attributes: { name: 'Charlie Brown' } },
];

export const ExistingPerson: Story = {
  args: {
    personId: 'alice-001',
    people: samplePeople,
  },
};

export const WithRemoveButton: Story = {
  args: {
    personId: 'alice-001',
    people: samplePeople,
    onRemove: fn(),
  },
};

export const MissingPerson: Story = {
  args: {
    personId: 'deleted-person',
    people: samplePeople,
  },
  parameters: {
    docs: {
      description: {
        story: 'When a person referenced in a constraint has been deleted from the problem, the chip shows error styling.',
      },
    },
  },
};

export const MissingPersonWithRemove: Story = {
  args: {
    personId: 'old-employee-id',
    people: samplePeople,
    onRemove: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Missing person with remove button allows users to clean up stale constraint references.',
      },
    },
  },
};

export const PersonWithoutName: Story = {
  args: {
    personId: 'bob-002',
    people: [
      { id: 'bob-002', attributes: {} }, // No name attribute
    ],
    onRemove: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'When person has no name attribute, falls back to showing the ID.',
      },
    },
  },
};

export const LongPersonName: Story = {
  args: {
    personId: 'long-name-person',
    people: [
      { id: 'long-name-person', attributes: { name: 'Dr. Maximilian Bartholomew Fitzgerald-Worthington Jr.' } },
    ],
    onRemove: fn(),
  },
};

export const MultipleChipsInConstraint: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-gray-500">Must stay together:</span>
      <ConstraintPersonChip personId="alice-001" people={samplePeople} onRemove={fn()} />
      <ConstraintPersonChip personId="bob-002" people={samplePeople} onRemove={fn()} />
      <ConstraintPersonChip personId="charlie-003" people={samplePeople} onRemove={fn()} />
    </div>
  ),
};

export const MixedValidAndInvalid: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-gray-500">Should not be together:</span>
      <ConstraintPersonChip personId="alice-001" people={samplePeople} onRemove={fn()} />
      <ConstraintPersonChip personId="deleted-person" people={samplePeople} onRemove={fn()} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A constraint where one person still exists and another has been deleted.',
      },
    },
  },
};
