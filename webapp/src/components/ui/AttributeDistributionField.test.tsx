import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AttributeDistributionField } from './AttributeDistributionField';
import { getAttributeDistributionBuckets } from './attributeDistribution';

function ControlledField({
  initialValue,
  capacity,
  showSummary,
  showChips,
}: {
  initialValue: Record<string, number>;
  capacity: number;
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
      showSummary={showSummary}
      showChips={showChips}
    />
  );
}

function ControlledFieldWithSpy({
  initialValue,
  capacity,
  onChangeSpy,
}: {
  initialValue: Record<string, number>;
  capacity: number;
  onChangeSpy: (value: Record<string, number>) => void;
}) {
  const [value, setValue] = React.useState<Record<string, number>>(initialValue);
  return (
    <AttributeDistributionField
      label="Desired Distribution"
      buckets={getAttributeDistributionBuckets(['A', 'B', 'C'])}
      value={value}
      capacity={capacity}
      onChange={(nextValue) => {
        onChangeSpy(nextValue);
        setValue(nextValue);
      }}
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
    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={5} />);

    const input = screen.getByLabelText('B count');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    expect(screen.getByLabelText('B count')).toHaveValue('4');
  });

  it('allows legend count inputs to be emptied while editing', () => {
    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={11} />);

    const input = screen.getByLabelText('B count');
    input.focus();
    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveValue('');
  });

  it('widens legend count inputs for multiple digits', () => {
    render(<ControlledField initialValue={{ A: 2, B: 10 }} capacity={20} />);

    expect(screen.getByLabelText('B count')).toHaveStyle({ width: 'calc(2ch + 0.35rem)' });
  });

  it('lets inactive chips be activated without a checkbox and then appear in the bar', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2, C: 1 }} capacity={5} />);

    expect(screen.queryByRole('button', { name: /adjust boundary between a and b/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^enable target for b$/i }));

    expect(screen.getByLabelText('B count')).toHaveValue('0');
    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i })).toBeInTheDocument();
  });

  it('allows manual over-allocation and disables drag affordance while over capacity', async () => {
    render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={3} />);

    fireEvent.change(screen.getByLabelText('A count'), { target: { value: '3' } });

    expect(screen.getByText(/allocated values exceed the current capacity/i)).toBeInTheDocument();
    expect(screen.getByLabelText('A count')).toHaveValue('3');
    expect(screen.queryByRole('button', { name: /adjust boundary between a and b/i })).not.toBeInTheDocument();
  });

  it('supports a bar-only mode for grid usage', async () => {

    render(
      <ControlledField
        initialValue={{ A: 2, C: 1 }}
        capacity={5}
        showSummary={false}
        showChips={false}
      />,
    );

    expect(screen.queryByText(/allocated \d/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('A count')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adjust boundary between a and c/i })).toBeInTheDocument();
  });

  it('clamps divider markers inside the bar when allocations exceed capacity', () => {
    render(<ControlledField initialValue={{ A: 1, B: 2 }} capacity={2} showSummary={false} showChips={false} />);

    expect(screen.queryByRole('button', { name: /adjust boundary between/i })).not.toBeInTheDocument();
  });

  it('lets divider handles rebalance adjacent sections', () => {
    render(<ControlledField initialValue={{ A: 2, B: 0, C: 1 }} capacity={5} showSummary={false} showChips={false} />);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, right: 100, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const handle = screen.getByRole('button', { name: /adjust boundary between a and b/i });
    fireEvent.pointerDown(handle, { clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerUp(window, { clientX: 20 });

    expect(screen.getByRole('button', { name: /adjust boundary between a and b/i }).style.left).toBe('20%');
  });

  it('keeps legend layout stable until drag ends', () => {
    const { container } = render(<ControlledField initialValue={{ A: 2, B: 2 }} capacity={8} />);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, right: 100, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(1);

    const handle = screen.getByRole('button', { name: /adjust boundary between a and b/i });
    fireEvent.pointerDown(handle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 10 });

    expect(screen.getByLabelText('A count')).toHaveValue('1');
    expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(1);

    fireEvent.pointerUp(window, { clientX: 10 });

    expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(2);
  });

  it('commits drag changes once on release instead of every pointer move', () => {
    const onChangeSpy = vi.fn();

    render(<ControlledFieldWithSpy initialValue={{ A: 2, B: 2 }} capacity={8} onChangeSpy={onChangeSpy} />);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, right: 100, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    const handle = screen.getByRole('button', { name: /adjust boundary between a and b/i });
    fireEvent.pointerDown(handle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40 });
    fireEvent.pointerMove(window, { clientX: 25 });
    fireEvent.pointerMove(window, { clientX: 10 });

    expect(onChangeSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientX: 20 });

    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    expect(onChangeSpy).toHaveBeenCalledWith({ A: 1, B: 3 });
  });

  it('lets legend dots toggle attributes that do not fit inline', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 2 }} capacity={11} />);

    await user.click(screen.getByRole('button', { name: /enable target for b/i }));

    expect(screen.getByLabelText('B count')).toHaveValue('0');

    await user.click(screen.getByRole('button', { name: /disable target for b/i }));

    expect(screen.queryByLabelText('B count')).not.toBeInTheDocument();
  });

  it('lets inline bar labels toggle active attributes', async () => {
    const user = userEvent.setup();

    render(<ControlledField initialValue={{ A: 4, B: 1 }} capacity={5} />);

    await user.click(screen.getByRole('button', { name: /^disable target for a$/i }));

    expect(screen.queryByLabelText('A count')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^enable target for a$/i })).toBeInTheDocument();
  });

  it('uses count-only bar editing when there is room for the number but not the label', async () => {
    const { container } = render(<ControlledField initialValue={{ A: 4, B: 1 }} capacity={5} />);

    expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(2);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 88, top: 0, right: 88, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(3);
    });

    expect(container.querySelector('.attribute-distribution__segment-input')).toBeInTheDocument();
    expect(container.querySelectorAll('.attribute-distribution__support-input')).toHaveLength(1);
  });

  it('falls back to legend editing when the bar is too narrow for count-only controls', async () => {
    const { container } = render(<ControlledField initialValue={{ A: 4, B: 1 }} capacity={5} />);

    const bar = screen.getByRole('group', { name: 'Desired Distribution' });
    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 30, top: 0, right: 30, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(container.querySelectorAll('.attribute-distribution__support-item')).toHaveLength(3);
    });

    expect(container.querySelector('.attribute-distribution__segment-input')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.attribute-distribution__support-input')).toHaveLength(2);
  });

  it('hides bar toggle dots when the chip legend is available', () => {
    const { container } = render(<ControlledField initialValue={{ A: 2, B: 1 }} capacity={5} />);

    expect(container.querySelector('.attribute-distribution__toggle-dot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable target for b/i })).toBeInTheDocument();
  });
});
