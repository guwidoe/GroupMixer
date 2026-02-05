import type { Meta, StoryObj } from '@storybook/react-vite';
import { PeopleEmptyState } from '../components/ProblemEditor/sections/people/PeopleEmptyState';

/**
 * PeopleEmptyState is shown when no people have been added to the problem.
 * The message varies based on whether attributes have been defined.
 */
const meta: Meta<typeof PeopleEmptyState> = {
  title: 'Empty States/PeopleEmptyState',
  component: PeopleEmptyState,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div 
        className="p-6 border rounded-lg max-w-lg mx-auto"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PeopleEmptyState>;

export const NoAttributesDefined: Story = {
  args: {
    hasAttributes: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'When no attributes are defined, suggests defining them before adding people.',
      },
    },
  },
};

export const HasAttributes: Story = {
  args: {
    hasAttributes: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'When attributes exist, simply prompts to add people.',
      },
    },
  },
};

export const InContext: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>People</h3>
        <button className="btn-primary text-sm">+ Add Person</button>
      </div>
      <PeopleEmptyState hasAttributes={true} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Empty state shown in context with the section header and add button.',
      },
    },
  },
};
