import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantColumnsInput } from './ParticipantColumnsInput';
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

describe('ParticipantColumnsInput resize behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});
