import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetricCard } from '../components/ResultsView/MetricCard';
import { Users, TrendingUp, Clock, Activity, BarChart3, Zap } from 'lucide-react';

/**
 * MetricCard displays a single metric with an icon, title, and value.
 * Used in the results view to show key optimization metrics.
 */
const meta: Meta<typeof MetricCard> = {
  title: 'Results/MetricCard',
  component: MetricCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const UniqueContacts: Story = {
  args: {
    title: 'Unique Contacts',
    value: 156,
    icon: Users,
    colorClass: 'text-green-600',
  },
};

export const FinalScore: Story = {
  args: {
    title: 'Final Score',
    value: '12.45',
    icon: TrendingUp,
    colorClass: 'text-blue-600',
  },
};

export const ElapsedTime: Story = {
  args: {
    title: 'Elapsed Time',
    value: '45.2s',
    icon: Clock,
    colorClass: 'text-orange-600',
  },
};

export const Iterations: Story = {
  args: {
    title: 'Iterations',
    value: '1,234,567',
    icon: Activity,
    colorClass: 'text-purple-600',
  },
};

export const RepetitionPenalty: Story = {
  args: {
    title: 'Repetition Penalty',
    value: '0.00',
    icon: BarChart3,
    colorClass: 'text-green-600',
  },
};

export const HighPenalty: Story = {
  args: {
    title: 'Constraint Penalty',
    value: '245.50',
    icon: Zap,
    colorClass: 'text-red-600',
  },
};

export const MetricGrid: Story = {
  render: () => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <MetricCard title="Unique Contacts" value={156} icon={Users} colorClass="text-green-600" />
      <MetricCard title="Final Score" value="12.45" icon={TrendingUp} colorClass="text-blue-600" />
      <MetricCard title="Elapsed Time" value="45.2s" icon={Clock} colorClass="text-orange-600" />
      <MetricCard title="Iterations" value="1.2M" icon={Activity} colorClass="text-purple-600" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multiple MetricCards arranged in a grid layout.',
      },
    },
  },
};

export const LargeValues: Story = {
  args: {
    title: 'Total Iterations',
    value: '12,345,678,901',
    icon: Activity,
    colorClass: 'text-blue-600',
  },
};
