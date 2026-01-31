import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ModalHeader from '../components/ui/ModalHeader';

const meta: Meta<typeof ModalHeader> = {
  title: 'UI/ModalHeader',
  component: ModalHeader,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-96 p-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Modal Title',
  },
};

export const WithSubtitle: Story = {
  args: {
    title: 'Create New Group',
    subtitle: 'Configure the settings for your new group',
  },
};

export const LongTitle: Story = {
  args: {
    title: 'This is a Very Long Modal Title That Might Wrap',
    subtitle: 'With an equally descriptive subtitle explaining what this modal does',
  },
};
