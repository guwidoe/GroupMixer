import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AttributeDistributionField } from './AttributeDistributionField';
import { getAttributeDistributionBuckets } from './attributeDistribution';

function ControlledField({
  initialValue,
  capacity,
}: {
  initialValue: Record<string, number>;
  capacity: number;
}) {
  const [value, setValue] = React.useState<Record<string, number>>(initialValue);
  return (
    <AttributeDistributionField
      label="Desired Distribution"
      buckets={getAttributeDistributionBuckets(['A', 'B', 'C'])}
      value={value}
      capacity={capacity}
      onChange={setValue}
    />
  );
}

describe('AttributeDistributionField', () => {
  it('revives a collapsed middle bucket when its divider is moved', () => {
    render(<ControlledField initialValue={{ A: 2, C: 1 }} capacity={5} />);

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

  it('allows manual over-allocation and disables drag affordance while over capacity', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={3} />);

    await user.click(screen.getByRole('button', { name: /increase a/i }));

    expect(screen.getByText(/allocated values exceed the current capacity/i)).toBeInTheDocument();
    expect(screen.getByLabelText('A count')).toHaveValue('3');
    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i })).toBeDisabled();
  });
});
