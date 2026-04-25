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
  name: 'Alice Johnson',
  attributes: {
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
      name: 'Dr. Bartholomew Constantine Fitzgerald III',
      attributes: {
        department: 'Research',
      },
    },
  },
};

export const IdOnlyLegacyFallback: Story = {
  args: {
    person: {
      id: 'person-003',
      name: '',
      attributes: {
        department: 'Sales',
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Legacy incomplete data falls back to showing the ID.',
      },
    },
  },
};

export const MinimalPerson: Story = {
  args: {
    person: {
      id: 'bob',
      name: 'Bob',
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
      <PersonCard person={{ id: 'p1', name: 'Alice', attributes: {} }} />
      <PersonCard person={{ id: 'p2', name: 'Bob', attributes: {} }} />
      <PersonCard person={{ id: 'p3', name: 'Charlie', attributes: {} }} />
      <PersonCard person={{ id: 'p4', name: 'Diana', attributes: {} }} />
      <PersonCard person={{ id: 'p5', name: 'Eve', attributes: {} }} />
    </div>
  ),
};

export const SessionRestricted: Story = {
  args: {
    person: {
      id: 'person-late-joiner',
      name: 'Late Joiner',
      attributes: {},
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
