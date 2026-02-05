import type { Meta, StoryObj } from '@storybook/react-vite';

/* eslint-disable react/no-multi-comp */

/**
 * Loading states shown during data fetching or processing.
 * Multiple components are defined here for Storybook demonstration purposes.
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-t-transparent`}
        style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
      />
      {text && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-lg border p-4 animate-pulse"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="flex-1">
          <div className="h-4 rounded w-3/4 mb-2" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
          <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="h-3 rounded w-5/6" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      </div>
    </div>
  );
}

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingStates',
  component: LoadingSpinner,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LoadingSpinner>;

export const SmallSpinner: Story = {
  args: {
    size: 'sm',
  },
};

export const MediumSpinner: Story = {
  args: {
    size: 'md',
  },
};

export const LargeSpinner: Story = {
  args: {
    size: 'lg',
  },
};

export const WithText: Story = {
  args: {
    size: 'md',
    text: 'Loading...',
  },
};

export const SolverRunning: Story = {
  args: {
    size: 'lg',
    text: 'Running optimization...',
  },
};

export const SkeletonLoader: Story = {
  render: () => <SkeletonCard />,
};

export const SkeletonList: Story = {
  render: () => (
    <div className="space-y-4 max-w-lg">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  ),
};

export const InlineLoading: Story = {
  render: () => (
    <button className="btn-primary flex items-center gap-2 px-4 py-2" disabled>
      <div
        className="w-4 h-4 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }}
      />
      Saving...
    </button>
  ),
};

export const PageLoading: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center min-h-[300px]">
      <LoadingSpinner size="lg" text="Loading problem data..." />
    </div>
  ),
};

export const SolverProgress: Story = {
  render: () => (
    <div 
      className="p-6 rounded-lg border max-w-md"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Solver Running</h3>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Active</span>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            <span>Progress</span>
            <span>45%</span>
          </div>
          <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <div className="h-2 rounded-full w-[45%]" style={{ backgroundColor: 'var(--color-accent)' }} />
          </div>
        </div>
        <div className="flex justify-between text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <span>Iterations: 450,000</span>
          <span>Elapsed: 23.5s</span>
        </div>
      </div>
    </div>
  ),
};
