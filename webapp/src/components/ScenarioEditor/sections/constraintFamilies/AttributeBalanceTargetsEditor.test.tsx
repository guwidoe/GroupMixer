import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AttributeBalanceTargetsEditor } from './AttributeBalanceTargetsEditor';

function ControlledTargetsEditor({
  initialValue,
  maxValue,
}: {
  initialValue: Record<string, number>;
  maxValue?: number;
}) {
  const [value, setValue] = React.useState<Record<string, number>>(initialValue);
  return (
    <AttributeBalanceTargetsEditor
      options={['female', 'male']}
      value={value}
      maxValue={maxValue}
      onCommit={setValue}
    />
  );
}

describe('AttributeBalanceTargetsEditor', () => {
  it('reuses the full distribution control for grid editing', async () => {
    const user = userEvent.setup();

    render(<ControlledTargetsEditor initialValue={{ female: 2 }} maxValue={4} />);

    expect(screen.getByLabelText('female count')).toHaveValue('2');
    expect(screen.queryByText(/allocated \d/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^enable target for male$/i }));

    expect(screen.getByRole('button', { name: /adjust boundary between female and male/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^disable target for male$/i })).toHaveTextContent('male');
    expect(screen.getByLabelText('male count')).toHaveValue('0');
  });
});
