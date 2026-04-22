import { Plus } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuickSetupParticipantColumn } from './types';
import { splitParticipantColumnValues } from '../../utils/quickSetup/participantColumns';

interface LandingParticipantColumnsInputProps {
  label: string;
  nameColumnLabel: string;
  nameColumnPlaceholder: string;
  addAttributeLabel: string;
  columns: QuickSetupParticipantColumn[];
  onChangeColumnName: (index: number, value: string) => void;
  onChangeColumnValues: (index: number, value: string) => void;
  onAddAttribute: () => void;
  minHeight: number;
}

const NAME_COLUMN_WIDTH = 300;
const ATTRIBUTE_COLUMN_WIDTH = 170;
const MIN_NAME_WIDTH = 180;
const MIN_ATTRIBUTE_WIDTH = 120;
const SEPARATOR_WIDTH = 12;
const HEADER_HEIGHT = 38;
const LINE_HEIGHT = 38;
const BODY_PADDING = 24;

export function LandingParticipantColumnsInput({
  label,
  nameColumnLabel,
  nameColumnPlaceholder,
  addAttributeLabel,
  columns,
  onChangeColumnName,
  onChangeColumnValues,
  onAddAttribute,
  minHeight,
}: LandingParticipantColumnsInputProps) {
  const [height, setHeight] = useState(minHeight);
  const [columnWidths, setColumnWidths] = useState<number[]>(() => columns.map((_, index) => (index === 0 ? NAME_COLUMN_WIDTH : ATTRIBUTE_COLUMN_WIDTH)));
  const dragStateRef = useRef<{ startX: number; leftWidth: number; rightWidth: number; index: number } | null>(null);
  const resizeDragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    setColumnWidths((previous) => columns.map((_, index) => previous[index] ?? (index === 0 ? NAME_COLUMN_WIDTH : ATTRIBUTE_COLUMN_WIDTH)));
  }, [columns]);

  const maxLineCount = useMemo(() => (
    Math.max(6, ...columns.map((column) => Math.max(1, splitParticipantColumnValues(column.values).length)))
  ), [columns]);

  const contentHeight = Math.max(minHeight - HEADER_HEIGHT - 28, maxLineCount * LINE_HEIGHT + BODY_PADDING);
  const surfaceMinWidth = columnWidths.reduce((sum, width) => sum + width, 0) + (Math.max(0, columns.length - 1) * SEPARATOR_WIDTH);

  const handleColumnPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const delta = event.clientX - dragState.startX;
    const leftMinWidth = dragState.index === 0 ? MIN_NAME_WIDTH : MIN_ATTRIBUTE_WIDTH;
    const rightMinWidth = MIN_ATTRIBUTE_WIDTH;
    const total = dragState.leftWidth + dragState.rightWidth;
    const nextLeftWidth = Math.min(total - rightMinWidth, Math.max(leftMinWidth, dragState.leftWidth + delta));
    const nextRightWidth = total - nextLeftWidth;

    setColumnWidths((previous) => {
      const next = [...previous];
      next[dragState.index] = nextLeftWidth;
      next[dragState.index + 1] = nextRightWidth;
      return next;
    });
  }, []);

  const stopColumnResize = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handleColumnPointerMove);
    window.removeEventListener('pointerup', stopColumnResize);
    window.removeEventListener('pointercancel', stopColumnResize);
  }, [handleColumnPointerMove]);

  const startColumnResize = useCallback((index: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragStateRef.current = {
      index,
      startX: event.clientX,
      leftWidth: columnWidths[index],
      rightWidth: columnWidths[index + 1],
    };

    window.addEventListener('pointermove', handleColumnPointerMove);
    window.addEventListener('pointerup', stopColumnResize);
    window.addEventListener('pointercancel', stopColumnResize);
  }, [columnWidths, handleColumnPointerMove, stopColumnResize]);

  const handleResizePointerMove = useCallback((event: PointerEvent) => {
    const dragState = resizeDragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextHeight = Math.max(minHeight, dragState.startHeight + (event.clientY - dragState.startY));
    setHeight(nextHeight);
  }, [minHeight]);

  const stopResize = useCallback(() => {
    resizeDragStateRef.current = null;
    window.removeEventListener('pointermove', handleResizePointerMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
  }, [handleResizePointerMove]);

  useEffect(() => stopColumnResize, [stopColumnResize]);
  useEffect(() => stopResize, [stopResize]);

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeDragStateRef.current = {
      startY: event.clientY,
      startHeight: height,
    };

    window.addEventListener('pointermove', handleResizePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }, [handleResizePointerMove, height, stopResize]);

  return (
    <div className="landing-resizable-textarea rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="theme-scrollbar landing-participant-columns" style={{ height: `${height}px` }}>
        <div className="landing-participant-columns__surface">
          <div className="landing-participant-columns__toolbar">
            <button
              type="button"
              onClick={onAddAttribute}
              className="landing-action-button landing-participant-columns__add-button rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <Plus className="h-4 w-4" />
              {addAttributeLabel}
            </button>
          </div>

          <div className="landing-participant-columns__columns" style={{ minWidth: `${surfaceMinWidth}px` }}>
            {columns.map((column, index) => (
              <React.Fragment key={column.id}>
                <div className="landing-participant-columns__column" style={{ width: `${columnWidths[index]}px` }}>
                  <div className="landing-participant-columns__column-header">
                    {index === 0 ? (
                      <div className="landing-participant-columns__header-label">{nameColumnLabel}</div>
                    ) : (
                      <input
                        value={column.name}
                        onChange={(event) => onChangeColumnName(index, event.target.value)}
                        className="landing-participant-columns__header-input"
                        aria-label={`Attribute column ${index}`}
                      />
                    )}
                  </div>
                  <textarea
                    aria-label={index === 0 ? label : column.name || `Attribute ${index}`}
                    value={column.values}
                    onChange={(event) => onChangeColumnValues(index, event.target.value)}
                    placeholder={index === 0 ? nameColumnPlaceholder : ''}
                    className="landing-participant-columns__textarea"
                    style={{ height: `${contentHeight}px` }}
                  />
                </div>

                {index < columns.length - 1 && (
                  <div
                    className="landing-participant-columns__separator"
                    onPointerDown={(event) => startColumnResize(index, event)}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize column ${index + 1}`}
                  >
                    <div className="landing-participant-columns__separator-line" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <div
        className="landing-resizable-textarea__resize-handle"
        onPointerDown={handleResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize input"
      />
    </div>
  );
}
