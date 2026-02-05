import type { Meta, StoryObj } from '@storybook/react-vite';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * ThemeToggle allows users to switch between light, dark, and system themes.
 * Can be displayed as a dropdown button or as visible toggle buttons.
 */
const meta: Meta<typeof ThemeToggle> = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    showLabel: {
      control: 'boolean',
      description: 'Show theme options as visible buttons instead of dropdown',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the toggle button(s)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ThemeToggle>;

export const Default: Story = {
  args: {
    showLabel: false,
    size: 'md',
  },
};

export const SmallDropdown: Story = {
  args: {
    showLabel: false,
    size: 'sm',
  },
};

export const LargeDropdown: Story = {
  args: {
    showLabel: false,
    size: 'lg',
  },
};

export const WithLabels: Story = {
  args: {
    showLabel: true,
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows all three options as visible buttons with labels.',
      },
    },
  },
};

export const SmallWithLabels: Story = {
  args: {
    showLabel: true,
    size: 'sm',
  },
};

export const InHeader: Story = {
  render: () => (
    <div 
      className="flex items-center justify-between p-4 border rounded-lg"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        GroupMixer
      </h1>
      <ThemeToggle size="md" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Theme toggle positioned in a header context.',
      },
    },
  },
};

export const InSettingsPanel: Story = {
  render: () => (
    <div 
      className="p-4 space-y-4 max-w-md border rounded-lg"
      style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
    >
      <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Theme</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Choose your preferred appearance</div>
        </div>
        <ThemeToggle showLabel size="sm" />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Theme toggle in a settings panel with visible options.',
      },
    },
  },
};
