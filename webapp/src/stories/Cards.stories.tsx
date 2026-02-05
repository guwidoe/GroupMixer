import type { Meta, StoryObj } from '@storybook/react-vite';
import { Users, Calendar, Settings, Trash2, Edit3, Eye, ChevronDown } from 'lucide-react';

/**
 * Card components used throughout GroupMixer for displaying information.
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${className}`}
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      {children}
    </div>
  );
}

const meta: Meta<typeof Card> = {
  title: 'Components/Cards',
  component: Card,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const BasicCard: Story = {
  args: {
    children: (
      <div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Card Title</h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          This is a basic card with some content. Cards are used to group related information.
        </p>
      </div>
    ),
  },
};

export const PersonCardExample: Story = {
  render: () => (
    <Card className="max-w-sm">
      <div className="flex items-center gap-3 mb-3">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <Users className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
        </div>
        <div>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Alice Johnson</h3>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>person-001</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          Engineering
        </span>
        <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          Senior
        </span>
        <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          Female
        </span>
      </div>
    </Card>
  ),
};

export const GroupCardExample: Story = {
  render: () => (
    <Card className="max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <Users className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Team Alpha</h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Capacity: 6 people</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
            <Edit3 className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          </button>
          <button className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
            <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error-600)' }} />
          </button>
        </div>
      </div>
    </Card>
  ),
};

export const ProblemSummaryCard: Story = {
  render: () => (
    <Card className="max-w-md">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Company Retreat 2024</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Created: Jan 15, 2024</p>
        </div>
        <span 
          className="px-2 py-1 rounded text-xs"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          Template
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>45</div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>People</div>
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>8</div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Groups</div>
        </div>
        <div>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-accent)' }}>5</div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Sessions</div>
        </div>
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
        <button className="btn-primary flex-1 flex items-center justify-center gap-2 py-2">
          <Eye className="w-4 h-4" /> Open
        </button>
        <button className="btn-secondary flex items-center gap-2 px-3 py-2">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </Card>
  ),
};

export const ResultCard: Story = {
  render: () => (
    <Card className="max-w-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Run #3 - Best Result</h3>
          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            Best
          </span>
        </div>
        <button>
          <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        </button>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Score:</span>
          <span className="ml-1 font-medium text-green-600">12.45</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Unique:</span>
          <span className="ml-1 font-medium" style={{ color: 'var(--text-primary)' }}>156 / 180</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Duration:</span>
          <span className="ml-1 font-medium" style={{ color: 'var(--text-primary)' }}>45.2s</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-secondary)' }}>Created:</span>
          <span className="ml-1 font-medium" style={{ color: 'var(--text-primary)' }}>Today 2:30 PM</span>
        </div>
      </div>
    </Card>
  ),
};

export const StatCard: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl">
      <Card className="text-center">
        <Calendar className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-accent)' }} />
        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>5</div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Sessions</div>
      </Card>
      <Card className="text-center">
        <Users className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>45</div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>People</div>
      </Card>
      <Card className="text-center">
        <Settings className="w-8 h-8 mx-auto mb-2 text-orange-500" />
        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>8</div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Groups</div>
      </Card>
      <Card className="text-center">
        <Calendar className="w-8 h-8 mx-auto mb-2 text-purple-500" />
        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>12</div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Constraints</div>
      </Card>
    </div>
  ),
};
