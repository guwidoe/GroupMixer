import type { Meta, StoryObj } from '@storybook/react-vite';
import PersonCard from '../components/PersonCard';
import type { Person } from '../types';

/**
 * PersonCard displays a person as a compact chip with their name.
 * Hovering shows the person's ID as a tooltip.
 */
const meta: Meta<typeof PersonCard> = {
  title: 'Components/PersonCard',
  component: PersonCard,
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
type Story = StoryObj<typeof PersonCard>;

const samplePerson: Person = {
  id: 'person-001',
  attributes: {
    name: 'Alice Johnson',
    gender: 'female',
    department: 'Engineering',
  },
};

export const Default: Story = {
  args: {
    person: samplePerson,
  },
};

export const LongName: Story = {
  args: {
    person: {
      id: 'person-002',
      attributes: {
        name: 'Dr. Bartholomew Constantine Fitzgerald III',
        department: 'Research',
      },
    },
  },
};

export const NoNameAttribute: Story = {
  args: {
    person: {
      id: 'person-003',
      attributes: {
        department: 'Sales',
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'When no name attribute exists, the person ID is displayed.',
      },
    },
  },
};

export const MinimalPerson: Story = {
  args: {
    person: {
      id: 'bob',
      attributes: {},
    },
  },
};

export const WithCustomClass: Story = {
  args: {
    person: samplePerson,
    className: 'scale-125',
  },
};

export const MultipleCards: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <PersonCard person={{ id: 'p1', attributes: { name: 'Alice' } }} />
      <PersonCard person={{ id: 'p2', attributes: { name: 'Bob' } }} />
      <PersonCard person={{ id: 'p3', attributes: { name: 'Charlie' } }} />
      <PersonCard person={{ id: 'p4', attributes: { name: 'Diana' } }} />
      <PersonCard person={{ id: 'p5', attributes: { name: 'Eve' } }} />
    </div>
  ),
};

export const SessionRestricted: Story = {
  args: {
    person: {
      id: 'person-late-joiner',
      attributes: {
        name: 'Late Joiner',
      },
      sessions: [2, 3, 4], // Only joins from session 3 onwards
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Person who only participates in specific sessions (e.g., late arrival).',
      },
    },
  },
};
