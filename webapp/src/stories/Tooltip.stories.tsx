import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip } from '../components/Tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-20">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: 'This is a tooltip',
    children: <button className="px-4 py-2 bg-blue-500 text-white rounded">Hover me</button>,
  },
};

export const LongContent: Story = {
  args: {
    content: 'This is a longer tooltip with more detailed information about what this element does.',
    children: <span className="text-blue-500 underline cursor-help">What is this?</span>,
  },
};

export const WithIcon: Story = {
  args: {
    content: 'Click to add a new person',
    children: (
      <button className="w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-full">
        +
      </button>
    ),
  },
};
