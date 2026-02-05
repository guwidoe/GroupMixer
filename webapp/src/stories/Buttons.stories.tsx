import type { Meta, StoryObj } from '@storybook/react-vite';
import { Play, Plus, Trash2, Download, Settings, Save, X, Check } from 'lucide-react';

/**
 * Button styles used throughout GroupMixer.
 * Shows the various button classes and their intended use cases.
 */

interface ButtonDemoProps {
  variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'error';
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

function ButtonDemo({ variant, children, icon: Icon, disabled }: ButtonDemoProps) {
  const className = `btn-${variant} flex items-center gap-2 px-4 py-2`;
  return (
    <button className={className} disabled={disabled}>
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

const meta: Meta<typeof ButtonDemo> = {
  title: 'UI/Buttons',
  component: ButtonDemo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ButtonDemo>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
    icon: Save,
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
    icon: X,
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Start Solver',
    icon: Play,
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'Cancel',
    icon: X,
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Delete',
    icon: Trash2,
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    children: 'Delete Forever',
    icon: Trash2,
  },
};

export const Disabled: Story = {
  args: {
    variant: 'primary',
    children: 'Disabled Button',
    disabled: true,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex items-center gap-2 px-4 py-2">
          <Save className="w-4 h-4" /> Primary
        </button>
        <button className="btn-secondary flex items-center gap-2 px-4 py-2">
          <Settings className="w-4 h-4" /> Secondary
        </button>
        <button className="btn-success flex items-center gap-2 px-4 py-2">
          <Play className="w-4 h-4" /> Success
        </button>
        <button className="btn-warning flex items-center gap-2 px-4 py-2">
          <X className="w-4 h-4" /> Warning
        </button>
        <button className="btn-danger flex items-center gap-2 px-4 py-2">
          <Trash2 className="w-4 h-4" /> Danger
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary px-4 py-2" disabled>Disabled Primary</button>
        <button className="btn-secondary px-4 py-2" disabled>Disabled Secondary</button>
      </div>
    </div>
  ),
};

export const IconOnlyButtons: Story = {
  render: () => (
    <div className="flex gap-2">
      <button className="btn-primary p-2 rounded-md">
        <Plus className="w-5 h-5" />
      </button>
      <button className="btn-secondary p-2 rounded-md">
        <Settings className="w-5 h-5" />
      </button>
      <button className="btn-danger p-2 rounded-md">
        <Trash2 className="w-5 h-5" />
      </button>
      <button className="btn-success p-2 rounded-md">
        <Check className="w-5 h-5" />
      </button>
    </div>
  ),
};

export const ButtonSizes: Story = {
  render: () => (
    <div className="flex items-center gap-2 flex-wrap">
      <button className="btn-primary px-2 py-1 text-xs">Extra Small</button>
      <button className="btn-primary px-3 py-1.5 text-sm">Small</button>
      <button className="btn-primary px-4 py-2 text-base">Medium</button>
      <button className="btn-primary px-6 py-3 text-lg">Large</button>
      <button className="btn-primary px-8 py-4 text-xl">Extra Large</button>
    </div>
  ),
};

export const CommonActions: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className="btn-primary flex items-center gap-2 px-4 py-2">
          <Plus className="w-4 h-4" /> Add Person
        </button>
        <button className="btn-primary flex items-center gap-2 px-4 py-2">
          <Plus className="w-4 h-4" /> Add Group
        </button>
      </div>
      <div className="flex gap-2">
        <button className="btn-success flex items-center gap-2 px-4 py-2">
          <Play className="w-4 h-4" /> Start Solver
        </button>
        <button className="btn-warning flex items-center gap-2 px-4 py-2">
          <X className="w-4 h-4" /> Cancel Solver
        </button>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary flex items-center gap-2 px-4 py-2">
          <Download className="w-4 h-4" /> Export
        </button>
        <button className="btn-danger flex items-center gap-2 px-4 py-2">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  ),
};
