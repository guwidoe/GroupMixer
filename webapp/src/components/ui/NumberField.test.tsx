/* eslint-disable react/no-multi-comp */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberField } from './NumberField';

function NumberFieldHarness(props: Partial<React.ComponentProps<typeof NumberField>> = {}) {
  const [value, setValue] = useState<number | null>(props.value ?? 4);
  return (
    <div>
      <NumberField
        label="Sessions"
        min={1}
        softMax={10}
        step={1}
        value={value}
        onChange={setValue}
        {...props}
      />
      <output aria-label="current-value">{value ?? 'null'}</output>
    </div>
  );
}

function DecimalHarness({ onCommit }: { onCommit: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(1.5);
  return (
    <NumberField
      label="Weight"
      kind="float"
      min={0}
      softMax={5}
      step={0.1}
      value={value}
      onChange={setValue}
      onCommit={onCommit}
    />
  );
}

describe('NumberField', () => {
  it('renders a slider and editable field by default', () => {
    render(<NumberFieldHarness />);

    expect(screen.getByRole('slider', { name: /sessions slider/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /sessions/i })).toHaveValue('4');
    expect(screen.getByRole('button', { name: /decrease sessions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /increase sessions/i })).toBeInTheDocument();
  });

  it('pins the slider to softMax when the value overflows without showing scale labels', () => {
    render(<NumberFieldHarness value={27} />);

    expect(screen.getByRole('slider', { name: /sessions slider/i })).toHaveValue('10');
    expect(screen.getByRole('textbox', { name: /sessions/i })).toHaveValue('27');
    expect(screen.queryByText('10+')).not.toBeInTheDocument();
  });

  it('keeps the slider scale fixed when the value overflows', () => {
    render(<NumberFieldHarness value={27} />);

    const slider = screen.getByRole('slider', { name: /sessions slider/i }) as HTMLInputElement;
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '10');
    expect(screen.getByRole('textbox', { name: /sessions/i })).toHaveValue('27');
  });

  it('uses the configured soft range for the slider track', () => {
    render(<NumberFieldHarness />);

    const slider = screen.getByRole('slider', { name: /sessions slider/i }) as HTMLInputElement;
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '10');
    expect(slider).toHaveValue('4');
  });

  it('supports keyboard stepping for integer fields', async () => {
    const user = userEvent.setup();
    render(<NumberFieldHarness value={4} />);

    const input = screen.getByRole('textbox', { name: /sessions/i });
    await user.click(input);
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('5');

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(input).toHaveValue('15');
  });

  it('supports stepper buttons for precise slider adjustments', async () => {
    const user = userEvent.setup();
    render(<NumberFieldHarness />);

    await user.click(screen.getByRole('button', { name: /increase sessions/i }));
    expect(screen.getByLabelText('current-value')).toHaveTextContent('5');
    expect(screen.getAllByRole('textbox').map((element) => (element as HTMLInputElement).value)).toEqual(['5']);

    await user.click(screen.getByRole('button', { name: /decrease sessions/i }));
    expect(screen.getByLabelText('current-value')).toHaveTextContent('4');
    expect(screen.getAllByRole('textbox').map((element) => (element as HTMLInputElement).value)).toEqual(['4']);
  });

  it('supports decimal fields and commits on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<DecimalHarness onCommit={onCommit} />);

    const input = screen.getByRole('textbox', { name: /weight/i });
    await user.clear(input);
    await user.type(input, '2.7');
    await user.tab();

    expect(input).toHaveValue('2.7');
    expect(onCommit).toHaveBeenCalledWith(2.7);
  });

  it('reverts invalid draft text on blur', async () => {
    const user = userEvent.setup();
    render(<NumberFieldHarness value={4} />);

    const input = screen.getByRole('textbox', { name: /sessions/i });
    await user.clear(input);
    await user.type(input, 'abc');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.tab();
    expect(input).toHaveValue('4');
  });

  it('applies disabled and error states', () => {
    render(
      <NumberField
        label="Sessions"
        value={4}
        onChange={vi.fn()}
        min={1}
        softMax={10}
        disabled
        error="Required"
      />,
    );

    expect(screen.getByRole('slider', { name: /sessions slider/i })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /sessions/i })).toBeDisabled();
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
