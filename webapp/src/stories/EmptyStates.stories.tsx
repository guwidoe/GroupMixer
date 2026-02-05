import type { Meta, StoryObj } from '@storybook/react-vite';
import { Users, Layers, AlertCircle, History, BarChart3 } from 'lucide-react';

/**
 * Empty states are shown when sections have no data.
 * They provide helpful guidance to users.
 */

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      <Icon className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
      <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
      <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

const meta: Meta<typeof EmptyState> = {
  title: 'Empty States/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div 
        className="border rounded-lg max-w-lg mx-auto"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const NoPeople: Story = {
  args: {
    icon: Users,
    title: 'No people added yet',
    description: 'Add people to get started with your optimization problem.',
    actionLabel: 'Add Person',
    onAction: () => {},
  },
};

export const NoGroups: Story = {
  args: {
    icon: Layers,
    title: 'No groups defined',
    description: 'Create groups to organize your sessions. Each group has a capacity limit.',
    actionLabel: 'Add Group',
    onAction: () => {},
  },
};

export const NoResults: Story = {
  args: {
    icon: History,
    title: 'No results yet',
    description: 'Run the solver to generate optimization results. Results will appear here.',
  },
};

export const NoConstraints: Story = {
  args: {
    icon: AlertCircle,
    title: 'No constraints defined',
    description: 'Constraints help you fine-tune the optimization. They\'re optional but powerful.',
  },
};

export const NoDataToDisplay: Story = {
  args: {
    icon: BarChart3,
    title: 'No data to display',
    description: 'Complete a solver run to see detailed metrics and analytics.',
  },
};

export const WithoutAction: Story = {
  args: {
    icon: Users,
    title: 'Search returned no results',
    description: 'Try adjusting your search terms or removing filters.',
  },
};

export const SearchResults: Story = {
  args: {
    icon: Users,
    title: 'No matching people',
    description: 'No people match your current search. Try different keywords.',
  },
};

export const AllEmptyStates: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <EmptyState icon={Users} title="No people" description="Add people to start." actionLabel="Add" onAction={() => {}} />
      </div>
      <div className="border rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <EmptyState icon={Layers} title="No groups" description="Create groups." actionLabel="Add" onAction={() => {}} />
      </div>
      <div className="border rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <EmptyState icon={History} title="No results" description="Run the solver first." />
      </div>
      <div className="border rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
        <EmptyState icon={BarChart3} title="No metrics" description="Complete a run." />
      </div>
    </div>
  ),
  decorators: [], // Remove the default decorator for this story
};
