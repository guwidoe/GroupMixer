import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { NumberField } from '../components/ui/NumberField';

function StatefulNumberField(props: React.ComponentProps<typeof NumberField>) {
  const [value, setValue] = useState<number | null>(props.value);
  return <NumberField {...props} value={value} onChange={setValue} />;
}

const meta: Meta<typeof NumberField> = {
  title: 'UI/NumberField',
  component: NumberField,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NumberField>;

export const Default: Story = {
  render: (args) => <StatefulNumberField {...args} />,
  args: {
    label: 'Sessions',
    value: 4,
    min: 1,
    softMax: 10,
    step: 1,
    kind: 'int',
    hint: 'Use the slider for the common range and the field for precise values.',
  },
};

export const OverflowPinned: Story = {
  render: (args) => <StatefulNumberField {...args} />,
  args: {
    label: 'Group size',
    value: 18,
    min: 1,
    softMax: 12,
    step: 1,
    kind: 'int',
    hint: 'The slider stays pinned at 12+, while the field keeps the real value.',
  },
};

export const Decimal: Story = {
  render: (args) => <StatefulNumberField {...args} />,
  args: {
    label: 'Penalty weight',
    value: 2.5,
    min: 0,
    softMax: 10,
    step: 0.1,
    kind: 'float',
  },
};

export const Compact: Story = {
  render: (args) => <StatefulNumberField {...args} />,
  args: {
    label: 'Target meetings',
    value: 2,
    min: 0,
    step: 1,
    kind: 'int',
    variant: 'compact',
    showSlider: false,
  },
};
