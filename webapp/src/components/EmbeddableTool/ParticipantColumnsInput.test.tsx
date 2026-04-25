import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_GHOST_COLUMN_WIDTH, ParticipantColumnsInput } from './ParticipantColumnsInput';
import { PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY } from './participantColumnsLayoutStorage';

const baseProps = {
  label: 'Participants',
  nameColumnLabel: 'Name',
  nameColumnPlaceholder: 'One name per line',
  addAttributeLabel: 'Add attribute',
  ghostAttributeDisplayLabel: 'Add attribute',
  attributeNamePlaceholder: 'Department',
  ghostAttributeValuesPreview: 'Marketing',
  removeAttributeLabel: 'Remove attribute',
  columns: [
    { id: 'name', name: 'Name', values: 'Alex\nBlair' },
    { id: 'department', name: 'department', values: 'Marketing\nSales' },
  ],
  onChangeColumnName: vi.fn(),
  onChangeColumnValues: vi.fn(),
  onAddAttribute: vi.fn(() => 'new-attribute'),
  onRemoveAttribute: vi.fn(),
  minHeight: 130,
};

const multiAttributeColumns = [
  { id: 'name', name: 'Name', values: 'Alex\nBlair' },
  { id: 'department', name: 'department', values: 'Marketing\nSales' },
  { id: 'role', name: 'role', values: 'Designer\nEngineer' },
];

describe('ParticipantColumnsInput resize behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not report a manual height adjustment when resizing columns', () => {
    const onManualLayoutAdjustment = vi.fn();

    render(
      <ParticipantColumnsInput
        {...baseProps}
        onManualLayoutAdjustment={onManualLayoutAdjustment}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText('Resize column 1'), {
      clientX: 120,
      pointerId: 1,
    });

    expect(onManualLayoutAdjustment).not.toHaveBeenCalled();
  });

  it('reports and persists manual height adjustments from the bottom handle', () => {
    const onManualLayoutAdjustment = vi.fn();

    render(
      <ParticipantColumnsInput
        {...baseProps}
        onManualLayoutAdjustment={onManualLayoutAdjustment}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText('Resize input'), {
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientY: 160 });

    expect(onManualLayoutAdjustment).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY)).toContain('"height":190');
  });

  it('allows the final separator to grow the real column beyond the ghost column minimum', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: this.classList.contains('landing-participant-columns__columns') ? 392 : 0,
        top: 0,
        width: this.classList.contains('landing-participant-columns__columns') ? 392 : 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    render(<ParticipantColumnsInput {...baseProps} />);

    fireEvent.pointerDown(screen.getByLabelText('Resize ghost column'), {
      clientX: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 220 });

    const storedLayout = JSON.parse(window.localStorage.getItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY) ?? '{}') as {
      columnWidths?: number[];
      ghostColumnWidth?: number;
    };

    expect(storedLayout.columnWidths?.[1]).toBeGreaterThan(300);
    expect(storedLayout.ghostColumnWidth).toBe(MIN_GHOST_COLUMN_WIDTH);
  });

  it('allows dragging the final separator back far enough to remove overflow again', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: this.classList.contains('landing-participant-columns__columns') ? 392 : 0,
        top: 0,
        width: this.classList.contains('landing-participant-columns__columns') ? 392 : 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    render(<ParticipantColumnsInput {...baseProps} />);

    fireEvent.pointerDown(screen.getByLabelText('Resize ghost column'), {
      clientX: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 220 });
    fireEvent.pointerUp(window);

    fireEvent.pointerDown(screen.getByLabelText('Resize ghost column'), {
      clientX: 220,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 20 });

    const storedLayout = JSON.parse(window.localStorage.getItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY) ?? '{}') as {
      columnWidths?: number[];
      ghostColumnWidth?: number;
    };

    expect(storedLayout.columnWidths?.[1]).toBeLessThan(200);
    expect(storedLayout.ghostColumnWidth).toBeGreaterThan(MIN_GHOST_COLUMN_WIDTH);
  });

  it('expands the ghost column after deleting an attribute when the custom layout fits again', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: this.classList.contains('landing-participant-columns__columns') ? 520 : 0,
        top: 0,
        width: this.classList.contains('landing-participant-columns__columns') ? 520 : 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    const { rerender } = render(<ParticipantColumnsInput {...baseProps} columns={multiAttributeColumns} />);

    fireEvent.pointerDown(screen.getByLabelText('Resize ghost column'), {
      clientX: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 260 });
    fireEvent.pointerUp(window);

    rerender(<ParticipantColumnsInput {...baseProps} columns={multiAttributeColumns.slice(0, 2)} />);

    const storedLayout = JSON.parse(window.localStorage.getItem(PARTICIPANT_COLUMNS_LAYOUT_STORAGE_KEY) ?? '{}') as {
      columnWidths?: number[];
      ghostColumnWidth?: number;
    };

    expect(storedLayout.columnWidths).toHaveLength(2);
    expect(storedLayout.ghostColumnWidth).toBeGreaterThan(MIN_GHOST_COLUMN_WIDTH);
  });
});
