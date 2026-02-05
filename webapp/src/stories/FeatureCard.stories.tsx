import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings, ListChecks, Clock, Zap, Download, Users, Calendar, GitBranch } from 'lucide-react';

/**
 * FeatureCard displays a feature with icon, title, and description.
 * This is a standalone component extracted for Storybook demonstration.
 */

interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-4 sm:gap-6 max-w-xl">
      <div
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2"
        style={{ borderColor: 'var(--text-primary)' }}
      >
        <Icon className="w-5 h-5 sm:w-7 sm:h-7" style={{ color: 'var(--text-primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
    </div>
  );
}

const meta: Meta<typeof FeatureCard> = {
  title: 'Landing/FeatureCard',
  component: FeatureCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FeatureCard>;

export const Optimization: Story = {
  args: {
    icon: Settings,
    title: 'Advanced Optimization',
    description: 'Leverages the Simulated Annealing algorithm to maximize unique interactions across sessions while satisfying all defined rules.',
  },
};

export const CustomRules: Story = {
  args: {
    icon: ListChecks,
    title: 'Supports Custom Rules',
    description: 'Handles constraints such as keeping individuals together (or apart), balancing group attributes, fixing assignments, and managing partial attendance.',
  },
};

export const MultiSession: Story = {
  args: {
    icon: Clock,
    title: 'Multi-Session Support',
    description: 'Ensures variety across time slots while respecting group size limits and rules.',
  },
};

export const FastPrivate: Story = {
  args: {
    icon: Zap,
    title: 'Fast & Private',
    description: 'Processes hundreds of participants and complex constraints in seconds. Runs locally in your browser - no installs required.',
  },
};

export const Export: Story = {
  args: {
    icon: Download,
    title: 'Export & Share',
    description: 'Export schedules in CSV or JSON format. Save and reload setups for future use.',
  },
};

export const FeatureList: Story = {
  render: () => (
    <div className="space-y-8">
      <FeatureCard
        icon={Calendar}
        title="Automate Group Scheduling"
        description="GroupMixer generates group schedules for multi-session events."
      />
      <FeatureCard
        icon={GitBranch}
        title="Maximize Encounters"
        description="The algorithm prioritizes unique interactions by reducing repeated encounters across sessions."
      />
      <FeatureCard
        icon={Users}
        title="Team Building"
        description="Perfect for corporate retreats, workshops, and networking events."
      />
    </div>
  ),
};
