import type { Meta, StoryObj } from '@storybook/react-vite';
import FormValidationError from '../components/ui/FormValidationError';

/**
 * FormValidationError displays validation error messages in a styled alert box.
 * Use this component to show form-level validation errors to users.
 */
const meta: Meta<typeof FormValidationError> = {
  title: 'UI/FormValidationError',
  component: FormValidationError,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    error: {
      control: 'text',
      description: 'Error message to display',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
  },
};

export default meta;
type Story = StoryObj<typeof FormValidationError>;

export const Default: Story = {
  args: {
    error: 'Please fill in all required fields.',
  },
};

export const NoError: Story = {
  args: {
    error: null,
  },
  parameters: {
    docs: {
      description: {
        story: 'When error is null or undefined, the component renders nothing.',
      },
    },
  },
};

export const LongErrorMessage: Story = {
  args: {
    error: 'The person "John Doe" could not be added because a person with the same ID already exists in this problem. Please use a unique identifier for each person.',
  },
};

export const ConstraintError: Story = {
  args: {
    error: 'Invalid constraint: The selected people cannot be in a "Must Stay Together" constraint because they participate in different sessions.',
  },
};

export const ValidationSummary: Story = {
  args: {
    error: 'Validation failed: • Name is required • At least 2 people must be selected • Penalty weight must be positive',
  },
};

export const WithCustomClass: Story = {
  args: {
    error: 'This is an error with custom styling.',
    className: 'max-w-md',
  },
};
