import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { Notification } from '../types';

/**
 * Notification component displays toast-style notifications.
 * This is a standalone version for Storybook (the actual component uses the store).
 */

// Standalone notification component for stories
interface NotificationItemProps {
  notification: Notification;
  onDismiss?: () => void;
}

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const iconColorMap = {
  success: { color: 'var(--color-success-600)' },
  error: { color: 'var(--color-error-600)' },
  warning: { color: 'var(--color-warning-600)' },
  info: { color: 'var(--color-accent)' },
} as const;

const borderColorMap = {
  success: 'var(--color-success-300)',
  error: 'var(--color-error-300)',
  warning: 'var(--color-warning-300)',
  info: 'var(--color-accent)',
} as const;

function NotificationItem({ notification, onDismiss }: NotificationItemProps) {
  const Icon = iconMap[notification.type as keyof typeof iconMap] || Info;
  const iconColor = iconColorMap[notification.type as keyof typeof iconColorMap] || { color: 'var(--text-secondary)' };
  const borderColor = borderColorMap[notification.type as keyof typeof borderColorMap] || 'var(--border-primary)';

  return (
    <div
      className="border rounded-lg p-4 shadow-lg max-w-sm"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: borderColor,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div className="flex items-start space-x-3">
        <Icon className="h-5 w-5 mt-0.5" style={iconColor} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {notification.title}
          </h4>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {notification.message}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

const meta: Meta<typeof NotificationItem> = {
  title: 'Components/Notification',
  component: NotificationItem,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotificationItem>;

export const Success: Story = {
  args: {
    notification: {
      id: '1',
      type: 'success',
      title: 'Result Saved',
      message: 'Your optimization result has been saved successfully.',
    },
    onDismiss: () => {},
  },
};

export const Error: Story = {
  args: {
    notification: {
      id: '2',
      type: 'error',
      title: 'Solver Error',
      message: 'The solver encountered an error and could not complete.',
    },
    onDismiss: () => {},
  },
};

export const Warning: Story = {
  args: {
    notification: {
      id: '3',
      type: 'warning',
      title: 'Constraint Conflict',
      message: 'Some constraints may be impossible to satisfy.',
    },
    onDismiss: () => {},
  },
};

export const InfoNotification: Story = {
  args: {
    notification: {
      id: '4',
      type: 'info',
      title: 'Auto-saved',
      message: 'Your changes have been automatically saved.',
    },
    onDismiss: () => {},
  },
};

export const LongMessage: Story = {
  args: {
    notification: {
      id: '5',
      type: 'info',
      title: 'Problem Loaded',
      message: 'Successfully loaded problem "Company Annual Retreat Planning 2024" with 45 people, 8 groups, and 6 sessions.',
    },
    onDismiss: () => {},
  },
};

export const NoDismissButton: Story = {
  args: {
    notification: {
      id: '6',
      type: 'success',
      title: 'Copied!',
      message: 'Schedule copied to clipboard.',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Notification without dismiss button (auto-dismiss only).',
      },
    },
  },
};

export const NotificationStack: Story = {
  render: () => (
    <div className="space-y-2">
      <NotificationItem
        notification={{
          id: '1',
          type: 'success',
          title: 'Solver Complete',
          message: 'Optimization finished in 45.2 seconds.',
        }}
        onDismiss={() => {}}
      />
      <NotificationItem
        notification={{
          id: '2',
          type: 'info',
          title: 'Result Saved',
          message: 'New result "Run #3" has been saved.',
        }}
        onDismiss={() => {}}
      />
      <NotificationItem
        notification={{
          id: '3',
          type: 'warning',
          title: 'High Penalty',
          message: 'The result has a high constraint penalty.',
        }}
        onDismiss={() => {}}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multiple notifications stacked as they would appear in the app.',
      },
    },
  },
};
