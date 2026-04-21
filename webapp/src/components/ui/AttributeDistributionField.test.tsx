import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AttributeDistributionField } from './AttributeDistributionField';
import { getAttributeDistributionBuckets } from './attributeDistribution';

function ControlledField({
  initialValue,
  capacity,
  variant = 'default',
  showSummary,
  showChips,
}: {
  initialValue: Record<string, number>;
  capacity: number;
  variant?: 'default' | 'compact';
  showSummary?: boolean;
  showChips?: boolean;
}) {
  const [value, setValue] = React.useState<Record<string, number>>(initialValue);
  return (
    <AttributeDistributionField
      label="Desired Distribution"
      buckets={getAttributeDistributionBuckets(['A', 'B', 'C'])}
      value={value}
      capacity={capacity}
      onChange={setValue}
      variant={variant}
      showSummary={showSummary}
      showChips={showChips}
    />
  );
}

describe('AttributeDistributionField', () => {
  it('revives a collapsed middle bucket when its divider is moved', () => {
    render(<ControlledField initialValue={{ A: 2, B: 0, C: 1 }} capacity={5} />);

    const handle = screen.getByRole('button', { name: /adjust boundary between a and b/i });
    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(screen.getByLabelText('A count')).toHaveValue('1');
    expect(screen.getByLabelText('B count')).toHaveValue('1');
    expect(screen.getByLabelText('C count')).toHaveValue('1');
  });

  it('allows direct manual editing of chip values', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={5} />);

    const input = screen.getByLabelText('B count');
    await user.clear(input);
    await user.type(input, '4');
    fireEvent.blur(input);

    expect(screen.getByLabelText('B count')).toHaveValue('4');
  });

  it('lets inactive chips be activated without a checkbox and then appear in the bar', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2, C: 1 }} capacity={5} />);

    expect(screen.queryByRole('button', { name: /adjust boundary between a and b/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /b not targeted/i }));

    expect(screen.getByLabelText('B count')).toHaveValue('0');
    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i })).toBeInTheDocument();
  });

  it('allows manual over-allocation and disables drag affordance while over capacity', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={3} />);

    await user.click(screen.getByRole('button', { name: /increase a/i }));

    expect(screen.getByText(/allocated values exceed the current capacity/i)).toBeInTheDocument();
    expect(screen.getByLabelText('A count')).toHaveValue('3');
    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i })).toBeDisabled();
  });

  it('supports a compact bar-only mode with toggle dots for grid usage', async () => {
    const user = userEvent.setup();

    render(
      <ControlledField
        initialValue={{ A: 2, C: 1 }}
        capacity={5}
        variant="compact"
        showSummary={false}
        showChips={false}
      />,
    );

    expect(screen.queryByText(/allocated \d/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('A count')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /enable target for b/i }));

    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable target for b/i })).toHaveAttribute('title', 'B');
  });

  it('lets toggle dots act as drag handles without toggling on drag', () => {
    render(<ControlledField initialValue={{ A: 2, B: 0, C: 1 }} capacity={5} />);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, right: 100, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const dot = screen.getByRole('button', { name: /disable target for a/i });
    fireEvent.pointerDown(dot, { clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerUp(window, { clientX: 20 });

    expect(screen.getByLabelText('A count')).toHaveValue('1');
    expect(screen.getByLabelText('B count')).toHaveValue('1');
    expect(screen.getByRole('button', { name: /disable target for a/i })).toBeInTheDocument();
  });
});
